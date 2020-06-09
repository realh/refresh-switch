const {Gio, GLib, GObject, Gtk} = imports.gi;
const [DispConf, logError, logObject] = (function() {
    try {
        const ExtensionUtils = imports.misc.extensionUtils;
        const Me = ExtensionUtils.getCurrentExtension();
        const Util = Me.imports.util;
        return [Me.imports.dispconf, Util.logError, Util.logObject];
    } catch (error) {
        const Util = imports.util;
        return [imports.dispconf, Util.logError, Util.logObject];
    }
})();

var [init, buildPrefsWidget] = (function() {

let oldDisplays = null;
let prefsWidget = null;
var radios = new Map();

function init() {
    DispConf.enable();
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
            const SPACING = 4;
            prefsWidget = new Gtk.Grid({
                column_homogeneous: false,
                row_homogeneous: false,
                column_spacing: SPACING,
                row_spacing: SPACING});
            prefsWidget.connect("parent-set", () => {
                const win = prefsWidget.get_toplevel();
                if (win && win.set_title)
                    win.set_title("Refresh rate");
            });
            prefsWidget.connect("destroy", () => {
                prefsWidget = null;
            });
        }
        // First work out how many columns are in the grid for spanning labels
        let numColumns = 1;
        for (const mon of DispConf.displayState.monitors) {
            for (const mi of mon.modeItems) {
                numColumns = Math.max(numColumns, mi.modes.length);
                if (numColumns == 4)
                    break;
            }
            if (numColumns == 4)
                break;
        }
        let row = 0;
        // Use of const is important below to prevent closures inadvertently
        // sharing the same values
        for (const mon in DispConf.displayState.monitors) {
            const monitor = DispConf.displayState.monitors[mon];
            if (!monitor.modeItems.length)
                continue;
            prefsWidget.attach(Gtk.Label.new(`${monitor.connector}`),
                    0, row, numColumns, 1);
            ++row;
            let group = null;
            for (const min in monitor.modeItems) {
                const mi = monitor.modeItems[min];
                log(`modeItem ${min} .refresh = ${mi.refresh}`);
                for (const mdn in mi.modes) {
                    const md = mi.modes[mdn];
                    let label;
                    const smi = md.modeIndex;
                    log(`subMode ${mdn} is modes[${smi}] with refresh_rate ` +
                            `${monitor.modes[smi].refresh_rate}`);
                    if (mdn == 0) {
                        label = `${mi.refresh}Hz`;
                        if (md.interlaced && !md.underscan)
                            label += " (i)";
                        else if (!md.interlaced && md.underscan)
                            label += " (u)";
                        else if (md.interlaced && md.underscan)
                            label += " (iu)";
                    } else {
                        if (md.interlaced && ! md.underscan)
                            label = "Interlaced";
                        else if (!md.interlaced && md.underscan)
                            label = "Underscan";
                        else if (md.interlaced && md.underscan)
                            label += "Interlaced & Underscan";
                        else    // Shouldn't happen
                            label = "-";
                    }
                    const radio = Gtk.RadioButton.new_with_label_from_widget(
                            group, label);
                    radios.set(`${mon},${min},${mdn}`, radio);
                    if (min == 0 && mdn == 0)
                        group = radio;
                    radio.set_active(min == monitor.currentMode &&
                            mdn == monitor.currentSubMode);
                    if (min == monitor.currentMode &&
                            mdn == monitor.currentSubMode) {
                        log(`This is the active mode`);
                    }
                    radio.connect("toggled", r => {
                        if (r.get_active()) {
                            log(`Monitor ${mon} ${monitor.connector} ` +
                                `mode ${min}/${mdn} toggled on`);
                            if (monitor.currentMode != min ||
                                    monitor.currentSubMode != mdn) {
                                DispConf.changeMode(monitor, min, mdn);
                            }
                        }
                    });
                    prefsWidget.attach(radio, mdn, row, 1, 1);
                }
                ++row;
            }
        }
        prefsWidget.show_all();
    } catch (error) {
        logError(error, "populatePrefsWidget");
        throw error;
    }
}

function updatePrefsWidget() {
    if (!prefsWidget) {
        buildPrefsWidget();
        return;
    }
    for (const mn in DispConf.displayState.monitors) {
        const monitor = DispConf.displayState.monitors[mn];
        log(`updatePrefsWidget: Activating radio ` +
                `${mn},${monitor.currentMode},${monitor.currentSubMode}`);
        const mi = monitor.modeItems[monitor.currentMode];
        log(`modeItems refresh rate = ${mi.refresh}`);
        const smi = mi.modes[monitor.currentSubMode].modeIndex;
        log(`modes ${smi} refresh rate = ${monitor.modes[smi].refresh_rate}`);
        radios.get(`${mn},${monitor.currentMode},${monitor.currentSubMode}`).
            set_active(true);
    }
}

function buildPrefsWidget() {
    if (!prefsWidget) {
        populatePrefsWidget();
    } else {
        log("buildPrefsWidget: prefsWidget already exists");
    }
    return prefsWidget;
}

return [init, buildPrefsWidget];

})();
