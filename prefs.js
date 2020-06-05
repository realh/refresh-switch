const {Gio, GLib, GObject, Gtk} = imports.gi;
const DispConf = imports.dispconf;

var [init, buildPrefsWidget] = (function() {

let oldDisplays = null;
let prefsWidget = null;
const radios = new Map();

function logObject(o, indent) {
    if (!indent)
        indent = "";
    let s = "{\n";
    const nested = indent + "  ";
    for (const k of Object.getOwnPropertyNames(o)) {
        s += `${nested}${k}: `;
        const v = o[k];
        if (typeof v == "string") {
            s += `"${v}"`;
        } else if (typeof v == "number" || !v || v === true) {
            s += `${v}`;
        } else {
            s += logObject(v, nested);
        }
        s += ",\n";
    }
    s += indent + '}';
    return s;
}

function logError(error, detail) {
    log(`${detail}:\n${logObject(error)}`);
}

function init() {
    log("DispConf.init()");
    DispConf.enable();
    oldDisplays = [];
    DispConf.getDisplays().then(displays => {
        oldDisplays = displays;
        log("init => getDisplays() promise resolved");
        if (prefsWidget) {
            log("init => getDisplays() promise populating prefsWidget");
            populatePrefsWidget(displays);
        }
    }, error => {
        logError(error, "init => getDisplays()");
    });
}

function populatePrefsWidget(displays) {
    try {
        radios.clear();
        if (prefsWidget) {
            const children = prefsWidget.get_children();
            if (children && children.length) {
                for (const c of children)
                    c.destroy();
            }
        } else {
            prefsWidget = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        }
        // Use of const is important here to prevent closures inadvertently
        // sharing the same values
        for (const dn in displays) {
            const disp = displays[dn];
            prefsWidget.pack_start(Gtk.Label.new(`${disp.name}`),
                    false, false, 0);
            let group = null;
            log(`Display ${disp.name}'s current_mode is ${disp.current_mode}`);
            for (const rn in disp.refresh) {
                const label = `${disp.refresh[rn]}Hz`;
                const radio = rn ?
                    Gtk.RadioButton.new_with_label_from_widget(group, label) :
                    Gtk.RadioButton.new_with_label(null, label);
                radios.set(`${dn},${rn}`, radio);
                if (!rn)
                    group = radio;
                radio.set_active(rn == disp.current_mode);
                log(`  Radio ${rn} active(${rn == disp.current_mode}): ` +
                        `${radio.get_active()}`);
                radio.connect("toggled", r => {
                    if (r.get_active()) {
                        log(`Display ${dn} ${disp.name} ${rn} toggled on`);
                    }
                });
                prefsWidget.pack_start(radio, false, false, 0);
            }
        }
        prefsWidget.show_all();
    } catch (error) {
        logError(error, "populatePrefsWidget");
    }
}

function updatePrefsWidget(displays) {
    for (const dn in displays) {
        const disp = displays[dn];
        log(`updatePrefsWidget: Activating radio ${dn},${disp.current_mode}`);
        radios.get(`${dn},${disp.current_mode}`).set_active(true);
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
        populatePrefsWidget(displays);
    else
        updatePrefsWidget(displays);
}

function buildPrefsWidget() {
    if (!prefsWidget) {
        prefsWidget = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        if (oldDisplays && oldDisplays.length) {
            log("buildPrefsWidget creating prefsWidget with oldDisplays");
            populatePrefsWidget(oldDisplays);
        } else if (!oldDisplays) {
            log("buildPrefsWidget getting displays");
            oldDisplays = [];
            DispConf.getDisplays().then(displays => {
                log("buildPrefsWidget => getDisplays() promise resolved");
                oldDisplays = displays;
                populatePrefsWidget(displays);
            }, error => logError(error, "buildPrefsWidget"));
        } else {
            log("buildPrefsWidget waiting for getDisplays() promise");
        }
    } else {
        log("buildPrefsWidget: prefsWidget already exists");
    }
    return prefsWidget;
}

return [init, buildPrefsWidget];

})();
