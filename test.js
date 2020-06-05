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

//const DisplayConfig = imports.dispconf;
const Prefs = imports.prefs;

/*
const mainLoop = new GLib.MainLoop(null, false);
DisplayConfig.enable();
DisplayConfig.getDisplays().then(displays => {
    for (const d of displays) {
        log(`Display "${d.name}" refresh rates ${d.refresh}`);
    }
    mainLoop.quit();
});
mainLoop.run();
*/

const SwitchRefreshTestApp = GObject.registerClass(
        {GTypeName: "SwitchRefreshTestApp"},
class SwitchRefreshTestApp extends Gtk.Application {
    _init() {
        super._init({application_id: "switch-refresh.realh.co.uk",
                flags: Gio.ApplicationFlags.FLAGS_NONE});
        Prefs.init();
    }

    vfunc_activate() {
        this.window = new Gtk.ApplicationWindow({application: this});
        this.content = Prefs.buildPrefsWidget();
        this.window.add(this.content);
        this.window.show_all();
    }
});

const app = new SwitchRefreshTestApp();
app.run(ARGV);
