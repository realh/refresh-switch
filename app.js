imports.gi.versions.Gdk = "3.0";
imports.gi.versions.Gtk = "3.0";
const {GLib, Gio, GObject, Gdk, Gtk} = imports.gi;

function directoryOfThisScript() {
    const re = /@(.+?)(:\d+)+$/;
    const stack = new Error().stack.split('\n');
    for (const l of stack) {
        if (l.indexOf("directoryOfThisScript@") >= 0) {
            const m = re.exec(l);
            if (m) {
                return GLib.path_get_dirname(m[1]);
            }
        }
    }
    return null;
}

imports.searchPath.push(directoryOfThisScript());

const DispConf = imports.dispconf;
const Model = imports.model;
const {logObject} = imports.util;
const Widgets = imports.widgets;

const SwitchRefreshApp = GObject.registerClass(
        {GTypeName: "SwitchRefreshApp"},
class SwitchRefreshApp extends Gtk.Application {
    _init() {
        super._init({application_id: "switch-refresh.realh.co.uk",
                flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE});
    }

    vfunc_command_line(cmdLine) {
        const args = cmdLine.get_arguments();
        if (args.indexOf("--quit") >= 0 ||
                (this.window && this.window.is_visible()))
        {
            log("Quitting applet");
            this.quit();
            return 0;
        }
        let x = undefined;
        let y = undefined;
        for (const a of args) {
            if (a.indexOf("--x=") === 0)
                x = Number(a.slice(4));
            else if (a.indexOf("--y=") === 0)
                y = Number(a.slice(4));
        }
        if (!this.window) {
            const settings = Gtk.Settings.get_default();
            if (settings) {
                settings.set_property("gtk-application-prefer-dark-theme",
                        true);
            } else {
                log("GtkSettings not available to set dark theme");
            }
            DispConf.enable();
            DispConf.onMonitorsChanged = (state) => this.onStateChanged(state);
            this.window = new Gtk.ApplicationWindow({application: this});
            this.window.set_title("Display Refresh Switcher");
            // Need an outer box with opposite orientation so padding works in
            // both directions
            this.outerBox = new Gtk.Box(
                    {orientation: Gtk.Orientation.HORIZONTAL}, 0);
            this.box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL}, 0);
            this.outerBox.pack_start(this.box, false, false, 8);
            this.window.add(this.outerBox);
        }
        if (x !== undefined && y !== undefined) {
            let gravity;
            if (x > 640) {
                if (y > 480)
                    gravity = Gdk.Gravity.SOUTH_EAST;
                else
                    gravity = Gdk.Gravity.NORTH_EAST;
            } else {
                if (y > 480)
                    gravity = Gdk.Gravity.SOUTH_WEST;
                else
                    gravity = Gdk.Gravity.NORTH_WEST;
            }
            this.window.set_gravity(gravity);
            this.window.move(x, y);
            // I think Wyland ignores this, but oh well, I tried
        }
        DispConf.updateMonitorsState().
            then(state => this.onStateChanged(state)).
            catch(error => {
                this.showError(error)
                return 1;
            });
        return 0;
    }

    showError(error) {
        log(logObject(error));
        error = `${error}`;
        if (this.box) {
            let children = this.box.get_children();
            if (children && children.length)
                children[0].destroy();
            if (this.grid) {
                this.grid.destroy();
                this.grid = null;
            }
            const label = Gtk.Label.new(`${error}`);
            this.box.pack_start(label, false, false, 8);
        }
        this.window.show_all();
    }

    onStateChanged(state) {
        try {
            const model = Model.getStateModel(state);
            if (!this.model || !Model.modelsAreCompatible(this.model, model)) {
                log("Major state change, rebuilding grid");
                if (this.grid) {
                    this.grid.destroy();
                    this.grid = null;
                }
                const [g, r] = Widgets.buildGrid(model,
                        (_, monitor, mode) =>
                            this.onModeSelected(monitor, mode));
                this.grid = g;
                this.radios = r;
                this.box.pack_start(this.grid, false, false, 8);
                this.grid.show_all();
            } else {
                for (const mon of model.monitors) {
                    let done = false;
                    for (const group of mon.modeGroups) {
                        for (const mode of group.modes) {
                            if (mode.current) {
                                const key = `${mon.connector},${mode.id},` +
                                    `${mode.underscan}`;
                                const rad = this.radios.get(key);
                                if (!rad) {
                                    log(`No radio for ${key}`);
                                } else if (!rad.get_active()) {
                                    log(`Activating radio for ${key}`);
                                    rad.set_active();
                                } else {
                                    log(`Radio for ${key} already active`);
                                }
                                done = true;
                                break;
                            }
                        }
                        if (done)
                            break;
                    }
                }
            }
            this.model = model;
        } catch (error) {
            logError(error, "Error updating radios");
        }
        this.window.show_all();
    }

    onModeSelected(monitor, mode) {
        log(`Switching ${monitor.connector} to ${mode.id}` +
                (mode.underscan ? " (underscan)" : ""));
        DispConf.changeMode(monitor.connector, mode.id, mode.underscan);
    }
});

const app = new SwitchRefreshApp();
app.run(ARGV);
