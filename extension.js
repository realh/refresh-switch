import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {panel} from 'resource:///org/gnome/shell/ui/main.js';
import {Button} from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const APPID = "uk.co.realh.refresh_switch";

const RefreshSwitchButton = GObject.registerClass(
    {GTypeName: "RefreshSwitchButton"},
    class RefreshSwitchButton extends Button {
        _init(indicatorName) {
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

export default class FixFullscreenTearingExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.indicatorName = this.metadata.name + " indicator";
        this.indicator = null;
        this._path = null;
    }

    get_app_path() {
        if (!this._path) {
            let d = this.dir.get_path();
            if (!d.endsWith('/'))
            d += '/';
            this._path = GLib.canonicalize_filename(d + APPID, null);
        }
        return this._path;
    };

    enable() {
        this.indicator = new RefreshSwitchButton(this.indicatorName);
        panel.addToStatusArea(this.indicatorName, this.indicator);
    }

    disable() {
        if (this.indicator) {
            this.indicator.destroy();
            this.indicator = null;
        }
        quitApplet();
    }

    // GNOME needs a desktop file to be able to show a nice app name and icon
    // in the top bar.
    runApplet() {
        const path = this.get_app_path();
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
        // If the desktop file doesn't already exist, or had the incorrect
        // path in Exec, create one.
        if (!appInfo) {
            const dtf = GLib.get_user_data_dir() +
                `/applications/${APPID}.desktop`;
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
    quitApplet() {
        let args = ["gjs", this.get_app_path(), "--quit"];
        Util.spawn(args);
    }
}
