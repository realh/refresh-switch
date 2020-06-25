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
const Model = imports.model;
const {logObject} = imports.util;

let model = null;

function showState(state) {
    log(`New MonitorsState with serial ${state.serial}`);
    for (const m of state.monitors) {
        log(`Monitor ${m.connector} mode ${m.currentMode}`);
    }
    model = Model.getStateModel(state);
    log(Model.describeModel(model));
}

DispConf.onMonitorsChanged = showState;
DispConf.enable();
DispConf.updateMonitorsState().then(showState, error => {
    log("Error from updateMonitorsState():");
    log(error);
});

const mainLoop = GLib.MainLoop.new(null, false);

function changeMode(group) {
    const mon = model.monitors[0];
    const con = mon.connector;
    const mode = mon.modeGroups[group].modes[0].id;
    log(`Changing mode: ${con}, ${mode}`);
    DispConf.changeMode(con, mode);
    return false;
}

GLib.timeout_add(0, 2000, () => changeMode(2));
GLib.timeout_add(0, 5000, () => changeMode(0));

mainLoop.run();
