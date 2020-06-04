const {Gio, GLib, GObject, Gtk} = imports.gi;
const DispConf = imports.dispconf;

var [enable, disable] = (function() {

let oldDisplays = [];
let actionGroup = null;
let menuModel = null;
let popover = null;
let parentWidget = null;

function buildActionGroup(displays) {
    actionGroup = new Gio.SimpleActionGroup();
    const action = Gio.SimpleAction.new("close", null);
    action.connect("activate", () => {
        // TODO: Close the popover
        log("Close action activated");
    });
    const vt = GLib.VariantType.new('s');
    for (const dn in displays) {
        const disp = displays[dn];
        const states = disp.modes.map((_, i) =>
                GLib.Variant.new_string(`${i}`));
        const action = Gio.SimpleAction.new_stateful(`disp_${dn}`,
                vt, states[disp.current_mode]);
        action.set_state_hint(GLib.Variant.new_array(vt, states));
        action.connect("change-state", (_, value) => {
            // TODO: Check if mode has really changed and switch it
            log(`Action disp_${dn} changed state to ${value.get_string()}`);
        });
        actionGroup.add_action(action);
    }
    if (parentWidget) {
        parentWidget.insert_action_group("refreshswitch", actionGroup);
    }
}

function buildMenuModel(displays) {
    menuModel = new Gio.Menu();
    let section = new Gio.Menu();
    section.append_item(Gio.MenuItem.new("Close", "refreshswitch.close"));
    menuModel.append_section(null, section);
    for (const dn in displays) {
        const disp = displays[dn];
        section = new Gio.Menu();
        for (const rn in disp.refresh) {
            section.append_item(Gio.MenuItem.new(`${disp.refresh[rn]}Hz`,
                        `refreshswitch.disp_${dn}::${rn}`));
        }
        menuModel.append_section(disp.name, section);
    }
}

function rebuildPopover(displays) {
    buildActionGroup(displays);
    buildMenuModel(displays);
    if (popover) {
        popover.bind_model(menuModel, null);
    } else {
        popover = Gtk.Popover.new_from_model(parentWidget, menuModel);
        //popover.set_modal(false);
        popover.set_relative_to(parentWidget);
        popover.set_position(Gtk.PositionType.BOTTOM);
    }
}

function updatePopover(displays) {
    for (const dn in displays) {
        const action = actionGroup.lookup_action(`disp_${dn}`);
        if (action) {
            const disp = displays[dn];
            action.change_state(
                    GLib.Variant.new_string(`${disp.current_mode}`));
        } else {
            log(`Lookup failed for action disp_${dn}`);
        }
    }
}

function onDisplayConfigChanged(displays) {
    let rebuild = displays.length != oldDisplays.length;
    if (!rebuild) {
        for (const i in displays) {
            let d1 = oldDisplays[i];
            let d2 = displays[i];
            if (d1.id != d2.id || d1.name != d2.name ||
                    d1.refresh.length != d2.refresh.length) {
                rebuild = true;
                break;
            }
            for (const j in d1.refresh) {
                if (d1.refresh[j] != d2.refresh[j]) {
                    rebuild = true;
                    break;
                }
            }
            if (rebuild)
                break;
        }
    }
    oldDisplays = displays;
    if (rebuild)
        rebuildPopover(displays);
    else
        updatePopover(displays);
}

function enable(parentButton) {
    parentWidget = parentButton;
    DispConf.enable();
    DispConf.onDisplayConfigChanged = onDisplayConfigChanged;
    return DispConf.getDisplays().then(displays => {
        log("getDisplays() promise resolved");
        try {
            rebuildPopover(displays);
            return popover;
        } catch (ex) {
            log(ex);
            return null;
        }
    });
}

function disable() {
    DispConf.disable();
    popover = null;
    parentWidget = null;
    menuModel = null;
    actionGroup = null;
    oldDisplays = [];
}

return [enable, disable];

})();
