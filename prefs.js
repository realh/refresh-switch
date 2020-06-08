const {Gio, GLib, GObject, Gtk} = imports.gi;
const DispConf = imports.dispconf;
const {logError, logObject} = imports.util;

var [init, buildPrefsWidget] = (function() {

let oldDisplays = null;
let prefsWidget = null;
const radios = new Map();

function init() {
    DispConf.enable();
    log(`DispConf enabled`);
    oldDisplays = [];
    DispConf.updateDisplayConfig();
    DispConf.onRefreshRateChanged = updatePrefsWidget;
    DispConf.onMonitorsChanged = populatePrefsWidget;
}

function populatePrefsWidget() {
    try {
        radios.clear();
        if (prefsWidget) {
            const children = prefsWidget.get_children();
            if (children && children.length) {
                for (const c of children)
                    c.destroy();
            }
        } else {
            prefsWidget = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        }
        // Use of const is important here to prevent closures inadvertently
        // sharing the same values
        for (const mn in DispConf.displayState.monitors) {
            const monitor = DispConf.displayState.monitors[mn];
            if (!monitor.refreshRates.length)
                continue;
            prefsWidget.pack_start(Gtk.Label.new(`${monitor.connector}`),
                    false, false, 0);
            let group = null;
            for (const rn in monitor.refreshRates) {
                const label = `${monitor.refreshRates[rn]}Hz`;
                const radio = 
                    Gtk.RadioButton.new_with_label_from_widget(group, label);
                radios.set(`${mn},${rn}`, radio);
                if (rn == 0)
                    group = radio;
                radio.set_active(rn == monitor.currentMode);
                radio.connect("toggled", r => {
                    if (r.get_active()) {
                        log(`Display ${mn} ${monitor.connector} ${rn} ` +
                                "toggled on");
                        if (monitor.currentMode != rn) {
                            DispConf.changeMode(monitor, rn);
                        }
                            
                    }
                });
                prefsWidget.pack_start(radio, false, false, 0);
            }
        }
        prefsWidget.show_all();
    } catch (error) {
        logError(error, "populatePrefsWidget");
    }
}

function updatePrefsWidget() {
    if (!prefsWidget) {
        buildPrefsWidget();
        return;
    }
    for (const mn in DispConf.displayState.monitors) {
        const monitor = DispConf.displayState.monitors[mn];
        log(`updatePrefsWidget: Activating radio ${mn},${monitor.currentMode}`);
        radios.get(`${mn},${monitor.currentMode}`).set_active(true);
    }
}

function buildPrefsWidget() {
    if (!prefsWidget) {
        prefsWidget = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        populatePrefsWidget();
        prefsWidget.connect("parent-set", () => {
            const win = prefsWidget.get_toplevel();
            if (win && win.set_title)
                win.set_title("Refresh rate");
        });
    } else {
        log("buildPrefsWidget: prefsWidget already exists");
    }
    return prefsWidget;
}

return [init, buildPrefsWidget];

})();
