const GLib = imports.gi.GLib;

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

DispConf.enable();
DispConf.updateDisplayConfig();

//const mainLoop = GLib.MainLoop.new(null, false);
//mainLoop.run();
