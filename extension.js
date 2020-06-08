const Atk = imports.gi.Atk;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

var [init, enable, disable] = (function() {

const indicatorName = Me.metadata.name + " indicator";

const RefreshSwitchButton = GObject.registerClass(
    {GTypeName: "RefreshSwitchButton"},
class RefreshSwitchButton extends PanelMenu.Button {
    _init() {
        super._init(0, indicatorName, true);
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'video-display-symbolic'}),
            style_class: 'system-status-icon'
        });
        this.actor.add_child(icon);
    }

    vfunc_event(event) {
        if ((event.type() == Clutter.EventType.TOUCH_BEGIN ||
                    event.type() == Clutter.EventType.BUTTON_PRESS))
            ExtensionUtils.openPrefs();

        return Clutter.EVENT_PROPAGATE;
    }
});

let indicator = null;

function init() {
    indicator = new RefreshSwitchButton();
    Main.panel.addToStatusArea(indicatorName, indicator);
}

function enable() {
    indicator = new RefreshSwitchButton();
}

function disable() {
    if (indicator) {
        indicator.destroy();
        indicator = null;
    }
}

return [init, enable, disable];

})();
