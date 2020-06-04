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
const PopDown = imports.popdown;

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
    }

    vfunc_activate() {
        this.window = new Gtk.ApplicationWindow({application: this});
        this.button = new Gtk.MenuButton();
        this.window.add(this.button);
        this.window.show_all();
        PopDown.enable(this.button).then(popover => {
            log("Attaching popover to button");
            this.button.set_popover(popover);
        });
    }
});

const app = new SwitchRefreshTestApp();
app.run(ARGV);
