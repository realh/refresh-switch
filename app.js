imports.gi.versions.Gtk = "3.0";
const {GLib, Gio, GObject, Gtk} = imports.gi;

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
                flags: Gio.ApplicationFlags.FLAGS_NONE});
        DispConf.enable();
        DispConf.onMonitorsChanged = (state) => this.onStateChanged(state);
    }

    vfunc_activate() {
        if (this.window && this.window.is_visible())
        {
            this.quit();
            return;
        }
        if (!this.window) {
            this.window = new Gtk.ApplicationWindow({application: this});
            this.window.set_title("Display Refresh Switcher");
            // Need an outer box with opposite orientation so padding works in
            // both directions
            this.outerBox = new Gtk.Box(
                    {orientation: Gtk.Orientation.HORIZONTAL}, 0);
            this.box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL}, 0);
            this.outerBox.pack_start(this.box, false, false, 8);
            this.window.add(this.outerBox);
            DispConf.updateMonitorsState().then(state => {
                try {
                    this.onStateChanged(state);
                } catch (error) {
                    this.showError(error);
                }
            }, error => this.showError(error));
        }
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
        const model = Model.getStateModel(state);
        if (!this.model || !Model.modelsAreCompatible(this.model, model)) {
            if (this.grid) {
                this.grid.destroy();
                this.grid = null;
            }
            [this.grid, this.radios] = Widgets.buildGrid(model,
                    (_, monitor, mode) =>
                        this.onModeSelected(monitor, mode));
            this.box.pack_start(this.grid, false, false, 8);
            this.grid.show_all();
        } else {
            for (const mon of model.monitors) {
                let done = false;
                for (const group of mon.modeGroups) {
                    for (const mode of group.modes) {
                        if (mode.current) {
                            const rad = this.radios.get(
                              `${mon.connector},${mode.id},${mode.underscan}`);
                            if (!rad.get_active())
                                rad.set_active();
                            done = true;
                            break;
                        }
                    }
                    if (done)
                        break;
                }
            }
        }
        this.window.show_all();
    }

    onModeSelected(monitor, mode) {
        log(`Switching ${monitor.connector} to ${mode.id}` +
                (mode.underscan ? " (underscan)" : ""));
    }
});

const app = new SwitchRefreshApp();
app.run(ARGV);
