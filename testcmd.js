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

function showState(state) {
    log(`New MonitorsState with serial ${state.serial}`);
    for (const m of state.monitors) {
        log(`Monitor ${m.connector} mode ${m.currentMode}`);
    }
}

DispConf.onMonitorsChanged = showState;
DispConf.enable();
DispConf.updateMonitorsState().then(showState, error => {
    log("Error from updateMonitorsState():");
    log(error);
});

const mainLoop = GLib.MainLoop.new(null, false);
mainLoop.run();
