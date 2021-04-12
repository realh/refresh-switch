const {Atk, Clutter, Gio, GLib, GObject, St} = imports.gi;
const Global = imports.gi.Shell.Global;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Util = imports.misc.util;
const byteArray = imports.byteArray;

const APPID = "uk.co.realh.refresh_switch";

const app_path = (function() {
    let path = null;
    function f() {
        if (!path) {
            let d = Me.dir.get_path();
            if (!d.endsWith('/'))
                d += '/';
            path = GLib.canonicalize_filename(d + APPID, null);
        }
        return path;
    }
    return f;
})();

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
                    event.type() == Clutter.EventType.BUTTON_PRESS)) {
            log("Got click event");
            runApplet();
        }

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
    quitApplet();
}

// GNOME needs a desktop file to be able to show a nice app name and icon in
// the top bar.
function runApplet() {
    const path = app_path();
    log("app_path: " + path);
    let appInfo = Gio.DesktopAppInfo.new(`${APPID}`);
    if (appInfo) {
        const exec = GLib.canonicalize_filename(appInfo.get_string("Exec"),
                null);
        if (exec != path)
        {
            log(`Doesn't match exec ${exec}`);
            appInfo = null;
        }
    }
    // If the desktop file doesn't already exist, or had the incorrect path 
    // in Exec, create one.
    if (!appInfo) {
        const dtf = GLib.get_user_data_dir() + `/applications/${APPID}.desktop`;
        log("Creating " + dtf);
        GLib.file_set_contents(dtf,
`[Desktop Entry]
Name=RefreshSwitch
Type=Application
Categories=GNOME;Utility;System;DesktopSettings;
Icon=video-display-symbolic
Exec=${path}
`);
        appInfo = Gio.DesktopAppInfo.new_from_filename(dtf);
        log("made new appInfo; ");
    }
    const lc = Global.get().create_app_launch_context(0, -1);
    appInfo.launch([], lc);
    log("Launched");
}

// We don't need to use the desktop file when quitting.
function quitApplet() {
    let args = ["gjs", app_path(), "--quit"];
    Util.spawn(args);
}
