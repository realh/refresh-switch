const Util = (function() {
    try {
        const ExtensionUtils = imports.misc.extensionUtils;
        const Me = ExtensionUtils.getCurrentExtension();
        return Me.imports.util;
    } catch (error) {
        return imports.util;
    }
})();
const isRoundable = Util.isRoundable;

// Generates a model for building a UI of selectable refresh rates
//
//  interface Model {
//      serial: number
//      monitors: Monitor[]
//      columns: number
//  }
//  
//  interface Monitor {
//      connector: string
//      canUnderscan: boolean
//      modeGroups: ModeGroup[]
//  }
//  
//  interface ModeGroup {
//      refresh: string
//      modes: Mode[]
//  }
//  
//  interface Mode {
//      id: string
//      refresh: number
//      preferred: boolean
//      current: boolean
//      interlaced: boolean
//      underscan: boolean
//  }

// Modes can be paired if they have similar refresh rates and one is interlaced
// and the other isn't
function pairableModes(a, b) {
    if (!a || !b)
        return false;
    if (a.interlaced == b.interlaced)
        return false;
    a = a.refresh;
    b = b.refresh;
    return a == b || (isRoundable(a) && isRoundable(b) &&
            Math.round(a) == Math.round(b));
}

// Returns an array of Mode sorted by refresh rate
function getModesForMonitor(monitor) {
    let modes = monitor.getFilteredModes().map(id => {
        const m = monitor.modes[id];
        return {
            id,
            refresh: m.refresh_rate,
            preferred: m.isPreferred(),
            current: m.isCurrent(),
            interlaced: m.isInterlaced(),
            underscan: false
        }
    });
    modes.sort((a, b) => {
        if (a.refresh < b.refresh)
            return 1;
        else if (a.refresh > b.refresh)
            return -1;
        else
            return 0;
    });
    return modes;
}

function groupModes(modes, canUnderscan) {
    let groups = [];
    let group = [];
    for (let i = 0; i < modes.length; ++i) {
        const prevMode = (i >= 1) ? modes[i - 1] : undefined;
        const thisMode = modes[i];
        let pairable = false;
        // Can thisMode be paired with prevMode?
        if (pairableModes(prevMode, thisMode)) {
            pairable = true;
            // Provisionally yes, but if thisMode is also pairable with nextMode
            // and has a closer refresh rate to the latter, then leave it to be
            // paired with nextMode instead
            if (i < modes.length - 1) {
                const nextMode = modes[i + 1];
                if (thisMode.refresh - nextMode.refresh <
                        prevMode.refresh - thisMode.refresh &&
                        pairableModes(thisMode, nextMode))
                    pairable = false;
            }
        }
        if (pairable) {
            // Interlaced comes after non-interlaced
            if (thisMode.interlaced)
                group.push(thisMode);
            else
                group.unshift(thisMode);
            group = [];
        } else {
            group = [thisMode];
            groups.push(group);
        }
    }
    if (canUnderscan) {
        for (const g of groups) {
            const l = g.length;
            for (let i = 0; i < l; ++i) {
                let mu = Object.assign({}, g[i]);
                mu.underscan = true;
                g.push(mu);
            }
        }
    }
    return groups.map(g => {
        return { refresh: `${Math.round(g[0].refresh * 1000) / 1000}`,
                 modes: g };
    });
}

function getStateModel(state) {
    let columns = 1;
    let monitors = state.monitors.map(ms => {
        const canUnderscan = ms.canUnderscan();
        const monitor = {
            connector: ms.connector,
            canUnderscan,
            modeGroups: groupModes(getModesForMonitor(ms), canUnderscan)
        }
        for (const g of monitor.modeGroups)
            columns = Math.max(columns, g.modes.length);
        return monitor;
    }).filter(mon => mon.modeGroups.length > 1 ||
        mon.modeGroups[0].modes[length] > 1);
    return { serial: state.serial, columns, monitors };
}

function modelsAreCompatible(mod1, mod2) {
    if (mod1.monitors.length != mod2.monitors.length) {
        log(`States have incompatible monitor lengths:` +
            `${mod1.monitors.length} vs ${mod2.monitors.length}`);
        return false;
    }
    if (mod1.columns != mod2.columns) {
        log(`States have incompatible columns: ` +
                `${mod1.columns} vs ${mod2.columns}`)
        return false;
    }
    for (let i = 0; i < mod1.monitors.length; ++i)
    {
        let mon1 = mod1.monitors[i];
        let mon2 = mod2.monitors[i];
        if (mon1.connector != mon2.connector ||
                mon1.modeGroups.length != mon2.modeGroups.length) {
            log(`States have different monitors at index ${i}: ` +
                    `${mon1.connector} vs ${mon2.connector} or ` +
                    `${mon1.modeGroups.length} vs ${mon2.modeGroups.length}`);
            return false;
        }
        for (let j = 0; j < mon1.modeGroups.length; ++j) {
            let g1 = mon1.modeGroups[j];
            let g2 = mon2.modeGroups[j];
            if (g1.refresh != g2.refresh || g1.modes.length != g2.modes.length)
            {
                log(`States have different mode groups for monitor ` +
                        `${mon1.connector}: ` +
                        `${g1.refresh} vs ${g2.refresh} or ` +
                        `${g1.modes.length} vs ${g2.modes.length}`);
                return false;
            }
            for (let k = 0; k < g1.length; ++k) {
                if (g1[k].id != g2[k].id) {
                    log(`States have different modes for monitor ` +
                            `${mon1.connector} refresh ${g1.refresh} ` +
                            `${k}: ${g1[k].id} vs ${g2[k].id}`);
                    return false;
                }
            }
        }
    }
    return true;
}

function describeGroup(group) {
    return `{${group.refresh} [${getGroupLabels(group, true).join(", ")}]}`;
}

function describeMonitor(monitor) {
    let s = `  Monitor ${monitor.connector} {`;
    for (const g of monitor.modeGroups) {
        s += `\n    ${describeGroup(g)}`;
    }
    s += "\n  }";
    return s;
}

function describeModel(model) {
    return `Model {\n  serial: ${model.serial}, columns: ${model.columns}` +
        model.monitors.map(m => '\n' + describeMonitor(m)) + "\n}";
}
