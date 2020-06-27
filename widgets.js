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

// For model see model.js
// callback is called with (Monitor, Mode)
// Returns [Gtk.Grid,
//      Map<"monitor.connector,mode.id,underscan:bool", Gtk.Radio>]
function buildGrid(model, callback) {
    if (!model.monitors.length)
        return Gtk.Label.new("No suitable monitors");
    const SPACING = 4;
    const gridWidget = new Gtk.Grid({
        column_homogeneous: false,
        row_homogeneous: false,
        column_spacing: SPACING,
        row_spacing: SPACING});

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
    for (let mon = 0; mon < model.monitors.length; ++mon) {
        const monitor = model.monitors[mon];
        gridWidget.attach(Gtk.Label.new(`${monitor.connector}`),
                0, row, numColumns, 1);
        ++row;
        let group = null;
        for (let mgn = 0; mgn < monitor.modeItems.length; ++mgn) {
            const group = monitor.modeItems[mgn];
            for (let mdn = 0; mdn < group.modes.length; ++mdn) {
                const mode = group.modes[mdn];
                let label;
                if (mdn == 0) {
                    label = `${group.refresh}Hz`;
                    if (mode.interlaced && !mode.underscan)
                        label += " (i)";
                    else if (!mode.interlaced && mode.underscan)
                        label += " (u)";
                    else if (mode.interlaced && mode.underscan)
                        label += " (iu)";
                } else {
                    if (mode.interlaced && ! mode.underscan)
                        label = "Interlaced";
                    else if (!mode.interlaced && mode.underscan)
                        label = "Underscan";
                    else if (mode.interlaced && mode.underscan)
                        label += "I + U";
                    else    // Shouldn't happen
                        label = "-";
                }
                const radio = Gtk.RadioButton.new_with_label_from_widget(
                        group, label);
                radios.set(`${monitor.connector},${mode.id},${mode.underscan}`,
                        radio);
                if (mgn == 0 && mdn == 0)
                    group = radio;
                radio.set_active(mode.current);
                radio.connect("toggled", r => {
                    if (r.get_active()) {
                        callback(monitor, mode);
                    }
                });
                prefsWidget.attach(radio, mdn, row, 1, 1);
            }
            ++row;
        }
    }
    prefsWidget.show_all();
}
