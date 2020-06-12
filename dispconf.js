const {Gio, GLib} = imports.gi;

const [logError, logObject] = (function() {
    let Util;
    try {
        const ExtensionUtils = imports.misc.extensionUtils;
        const Me = ExtensionUtils.getCurrentExtension();
        Util = Me.imports.util;
    } catch (error) {
        Util = imports.util;
    }
    return [Util.logError, Util.logObject];
})();

function blog() {};

function arrayToObjects(ar, ctor, name) {
    if (!ar || ar.length === undefined) {
        log(`No source array (${ar}) to create array of ${name}`);
        return [];
    } else if (!ar.length) {
        log(`Empty source array for array of ${name}`);
        return [];
    }
    return ar.map(a => {
        try {
            return ctor(a);
        } catch (error) {
            log(`Error creating ${name} from ${a}: ${error}`);
            log(logObject(error.stack));
            return null;
        }
    }).filter(a => a != null);
}

function readProperties(o) {
    let result = {};
    for (const k in o) {
        let v = o[k];
        if (v instanceof GLib.Variant)
            v = v.deepUnpack();
        result[k] = v;
    }
    return result;
}

class Mode {
    constructor(ar) {
        this.id = ar[0];
        this.width = ar[1];
        this.height = ar[2];
        this.refresh_rate = ar[3];
        this.preferred_scale = ar[4];
        this.supported_scales = ar[5];
        this.properties = readProperties(ar[6]);
    }

    isCurrent() {
        return this.properties["is-current"] ? true : false;
    }

    isPreferred() {
        return this.properties["is-preferred"] ? true : false;
    }

    isInterlaced() {
        return this.properties["is-interlaced"] ? true : false;
    }
}

class MonitorDetails {
    constructor(ar) {
        this.connector = ar[0];
        this.vendor = ar[1];
        this.product = ar[2];
        this.serial = ar[3];
    }

    equal(m) {
        return ["connector", "vendor", "product", "serial"].
            every(k => this[k] == m[k]);
    }
}

function isRoundable(n) {
    return (Math.ceil(n) - n < 0.1) || (n - Math.floor(n) < 0.1);
}

function wouldRoundTheSame(a, b) {
    return a == b ||
        (isRoundable(a) && isRoundable(b) && Math.round(a) == Math.round(b));
}

function pairableModes(a, b) {
    if (a.isInterlaced() == b.isInterlaced())
        return false;
    a = a.refresh_rate;
    b = b.refresh_rate;
    return a == b || (isRoundable(a) && isRoundable(b) &&
            Math.round(a) == Math.round(b));
}

// Returns a rounded to log10(b) decimal places
function roundBy(a, b) {
    return Math.round(a * b) / b;
}

class Monitor extends MonitorDetails {
    constructor(ar) {
        super(ar[0]);
        this.modes = arrayToObjects(ar[1], m => new Mode(m), "Mode");
        this.properties = readProperties(ar[2]);
        this.propertyVariants = ar[2];
        this.processModes();
    }

    // Creates three new fields:
    // * modeItems is an array of:
    //   { refresh: num,
    //     modes: [{ modeIndex: int, interlaced: bool, underscan?: bool}, ...] }
    //   where mode is an index into this.modes
    // * currentMode
    //   Index of current mode in modeItems
    // * currentSubMode
    //   Index of current mode in refreshRates[currentRefresh].modes
    processModes() {
        this.modeItems = [];
        let modesIndex = this.modes.findIndex(m => m.isCurrent());
        if (modesIndex == -1) {
            log("No current mode!");
            modesIndex = this.modes.findIndex(m => m.isPreferred());
            if (modesIndex == -1) {
                if (this.modes.length)
                    modesIndex = 0;
                else
                    throw new Error(`Monitor connected to ${this.connector}` +
                            " has no modes");
            }
        }
        const currentWidth = this.modes[modesIndex].width;
        const currentHeight = this.modes[modesIndex].height;
        let filteredModes = [];
        for (let mi = 0; mi < this.modes.length; ++mi) {
            if (mi == modesIndex) {
                filteredModes.push(mi);
            } else if (this.modes[mi].width == currentWidth &&
                    this.modes[mi].height == currentHeight) {
                filteredModes.push(mi);
            }
        }
        blog(`filteredModes: [${filteredModes}] refresh rates ` +
                `[${filteredModes.map(a => this.modes[a].refresh_rate)}]`);
        // Sort by refresh rate (descending)
        filteredModes.sort((a, b) => {
            a = this.modes[a].refresh_rate;
            b = this.modes[b].refresh_rate;
            if (a > b)
                return -1;
            else if (a < b)
                return 1;
            else return 0;
        });
        log(`sorted filteredModes: [${filteredModes}] refresh rates ` +
                `[${filteredModes.map(a => this.modes[a].refresh_rate)}]`);
        let canUnderscan = this.properties["is-underscanning"];
        canUnderscan = canUnderscan === true || canUnderscan === false;
        let currentRefresh = [];
        // Build refreshRates, making interlaced/!interlaced pairs
        // where possible
        for (let i = 0; i < filteredModes.length; ++i) {
            if (typeof i == "string") {
                log(`filteredModes key ${i} is a string!`);
                i = Number(i);
            }
            const prevMode = (currentRefresh.length == 1) ?
                this.modes[currentRefresh[0].modeIndex] : undefined;
            const thisMode = this.modes[filteredModes[i]];
            let pairable = false;
            if (prevMode && pairableModes(prevMode, thisMode)) {
                pairable = true;
                if (i < filteredModes.length - 1) {
                    log(`i ${i}`);
                    log(`filteredModes[i + 1] ${filteredModes[i + 1]}`);
                    const nextMode = this.modes[filteredModes[i + 1]];
                    const pr = prevMode.refresh_rate;
                    const tr = thisMode.refresh_rate;
                    const nr = nextMode.refresh_rate;
                    // Rates are in descending order so no need to use abs()
                    // Don't pair if thisMode is closer to next mode than to
                    // prevMode
                    if ((pr - tr > tr - nr &&
                                pairableModes(thisMode, nextMode)) ||
                            // Nor if the refresh rates aren't an exact match
                            // and next mode would have the same rounded value
                            (tr != pr && wouldRoundTheSame(tr, nr))) {
                        pairable = false;
                    }
                }
            }
            const newMode = {
                modeIndex: filteredModes[i],
                interlaced: thisMode.isInterlaced(),
                underscan: false
            };
            if (pairable) {
                if (newMode.interlaced)
                    currentRefresh.push(newMode);
                else
                    currentRefresh.unshift(newMode);
            } else {
                currentRefresh = [newMode];
                this.modeItems.push({refresh: thisMode.refresh_rate,
                        modes: currentRefresh});
            }
        }
        blog(`modeItems with raw refresh rates: ${logObject(this.modeItems)}`);
        // Now convert refresh rates to unique but rounded strings
        let uniqueRefreshes = this.modeItems.map(a => a.refresh);
        let i = 0;
        while (i < uniqueRefreshes.length) {
            let ri = uniqueRefreshes[i];
            let j = i + 1;
            blog(`Loop condition for i ${i} j ${j}`); 
            blog(`j < uniqueRefreshes.length: ${j < uniqueRefreshes.length}`);
            if (j < uniqueRefreshes.length) {
                blog(`uniqueRefreshes[j] ${uniqueRefreshes[j]} != ` +
                        `ri ${ri}: ${uniqueRefreshes[j] != ri}`);
                blog("Math.round(uniqueRefreshes[j]) " +
                    `${Math.round(uniqueRefreshes[j])} == ` +
                    `Math.round(ri) ${Math.round(ri)}: ` +
                    `${Math.round(uniqueRefreshes[j]) == Math.round(ri)}`);
            }
            for (j = i + 1; j < uniqueRefreshes.length &&
                    uniqueRefreshes[j] != ri &&
                    Math.round(uniqueRefreshes[j]) == Math.round(ri); ++j)
            {
                ++j;
                blog(`Loop condition for i ${i} j ${j}`); 
                blog(`j < uniqueRefreshes.length: ${j < uniqueRefreshes.length}`);
                if (j < uniqueRefreshes.length) {
                    blog(`uniqueRefreshes[j] ${uniqueRefreshes[j]} != ` +
                            `ri ${ri}: ${uniqueRefreshes[j] != ri}`);
                    blog("Math.round(uniqueRefreshes[j]) " +
                        `${Math.round(uniqueRefreshes[j])} == ` +
                        `Math.round(ri) ${Math.round(ri)}: ` +
                        `${Math.round(uniqueRefreshes[j]) == Math.round(ri)}`);
                }
                --j;
            }
            --j;
            blog(`j is ${j} for i ${i}`);
            let rounding = 1;
            if (j > i) {
                for (let k = i + 1; k <= j; ++k) {
                    const uk = uniqueRefreshes[k];
                    const uk1 = uniqueRefreshes[k - 1];
                    blog(`k ${k} uk ${uniqueRefreshes[k]} ` +
                            `uk1 ${uniqueRefreshes[k - 1]}`);
                    let rk, rk1;
                    while ((rk = roundBy(uk, rounding)) ==
                                    (rk1 = roundBy(uk1, rounding)) &&
                            (rk != uk || rk1 != uk1)) {
                        rounding *= 10;
                        blog(`  rk ${rk} rk1 ${rk1} inc rounding to ${rounding}`);
                    }
                    blog(`  rk ${rk} rk1 ${rk1} done: rounding ${rounding}`);
                }
            }
            for (let k = i; k <= j; ++k) {
                this.modeItems[k].refresh = roundBy(uniqueRefreshes[k],
                        rounding);
            }
            blog(`k loop ended with i ${j + 1}`);
            if (j < i)
                break;
            i = j + 1;
        }
        // TODO: If the monitor supports underscan, add copies of modes
        this.currentMode = undefined
        this.currentSubMode = undefined
        for (let mi = 0; mi < this.modeItems.length; ++mi) {
            const m = this.modeItems[mi];
            log(`Looking at modeItem ${mi}: ${logObject(m)}`);
            for (let sm = 0; sm < m.modes.length; ++sm) {
                log(`Looking at subMode ${sm}: ${logObject(m.modes[sm])}`);
                if (this.modes[m.modes[sm].modeIndex].isCurrent()) {
                    this.currentSubMode = sm;
                    this.currentMode = mi;
                    break;
                }
                if (this.currentMode !== undefined)
                    break;
            }
        }
        this.debugModeItems();
        if (this.currentMode === undefined) {
            log(`No mode is current for monitor ${this.connector}`);
            this.currentSubMode = 0;
            this.currentMode = 0;
        }
    }

    debugModeItems() {
        for (const r of this.modeItems) {
            const sm = r.modes.map(m => `{i: ${m.modeIndex}, ` +
                    `cur: ${this.modes[m.modeIndex].isCurrent()}, ` +
                    `i: ${m.interlaced}, u: ${m.underscan}}`);
            log(`${r.refresh} [${sm.join(',')}]`);
        }
    }

    // Only updates this object's records
    changeMode(newMode, newSub) {
        let modeItem = this.modeItems[this.currentMode];
        let subMode = modeItem.modes[this.currentSubMode];
        let sysMode = this.modes[subMode.modeIndex];
        log(`subMode for old selection ` +
                `${this.currentMode}/${this.currentSubMode}:` +
                `${logObject(subMode)}\n` +
                `mi ref ${modeItem.refresh} sys ref ${sysMode.refresh_rate}`);
        delete sysMode.properties['is-current'];
        this.currentMode = newMode;
        this.currentSubMode = newSub;
        modeItem = this.modeItems[newMode];
        subMode = modeItem.modes[newSub];
        sysMode = this.modes[subMode.modeIndex];
        log(`subMode for new selection ` +
                `${newMode}/${newSub}:` +
                `${logObject(subMode)}\n` +
                `mi ref ${modeItem.refresh} sys ref ${sysMode.refresh_rate}`);
        sysMode.properties['is-current'] = true;
    }

    // Gets a tuple for use as a monitor element in ApplyMonitorsConfig
    getState() {
        const currentMode = this.modes.find(m => m.isCurrent());
        const props = this.properties["is-underscanning"] ?
            { "enable-underscanning": true } : {};
        return [this.connector, currentMode.id, props];
    }

    // Returns true if this Monitor has the same connector and refresh rates
    // as other
    compatible(other) {
        if (!(other instanceof Monitor))
            return false;
        if (this.modeItems.length != other.modeItems.length)
            return false;
        for (let i = 0; i < this.modeItems.length; ++i) {
            const tmi = this.modeItems[i];
            const omi = other.modeItems[i];
            if (tmi.refresh != omi.refresh)
                return false;
            if (tmi.modes.length != omi.modes.length)
                return false;
            if (tmi.modes.length == 2 &&
                    tmi.modes[1].interlaced != omi.modes[1].interlaced)
                return false;
        }
        return true;
    }
}

class LogicalMonitor {
    constructor(ar) {
        this.x = ar[0];
        this.y = ar[1];
        this.scale = ar[2];
        this.transform = ar[3];
        this.primary = ar[4];
        this.monitors = arrayToObjects(ar[5],
                m => new MonitorDetails(m), "MonitorDetails");
        this.properties = readProperties(ar[6]);
        this.propertyVariants = ar[6];
    }

    // Gets a tuple for use as a logical_monitor element in ApplyMonitorsConfig
    getState() {
        const monitors = this.monitors.map(m => {
            return displayState.monitors.find(m2 => m.equal(m2)).getState();
        });
        return [this.x, this.y, this.scale, this.transform, this.primary,
               monitors];
    }
}

 // From mutter's org.gnome.Mutter.DisplayConfig.xml
const displayConfigXml = `<node>
  <interface name="org.gnome.Mutter.DisplayConfig">
    <method name="GetResources">
      <arg name="serial" direction="out" type="u" />
      <arg name="crtcs" direction="out" type="a(uxiiiiiuaua{sv})" />
      <arg name="outputs" direction="out" type="a(uxiausauaua{sv})" />
      <arg name="modes" direction="out" type="a(uxuudu)" />
      <arg name="max_screen_width" direction="out" type="i" />
      <arg name="max_screen_height" direction="out" type="i" />
    </method>
    <method name="ApplyConfiguration">
      <arg name="serial" direction="in" type="u" />
      <arg name="persistent" direction="in" type="b" />
      <arg name="crtcs" direction="in" type="a(uiiiuaua{sv})" />
      <arg name="outputs" direction="in" type="a(ua{sv})" />
    </method>
    <method name="ChangeBacklight">
      <arg name="serial" direction="in" type="u" />
      <arg name="output" direction="in" type="u" />
      <arg name="value" direction="in" type="i" />
      <arg name="new_value" direction="out" type="i" />
    </method>
    <method name="GetCrtcGamma">
      <arg name="serial" direction="in" type="u" />
      <arg name="crtc" direction="in" type="u" />
      <arg name="red" direction="out" type="aq" />
      <arg name="green" direction="out" type="aq" />
      <arg name="blue" direction="out" type="aq" />
    </method>
    <method name="SetCrtcGamma">
      <arg name="serial" direction="in" type="u" />
      <arg name="crtc" direction="in" type="u" />
      <arg name="red" direction="in" type="aq" />
      <arg name="green" direction="in" type="aq" />
      <arg name="blue" direction="in" type="aq" />
    </method>
    <property name="PowerSaveMode" type="i" access="readwrite" />
    <signal name="MonitorsChanged" />
    <method name="GetCurrentState">
      <arg name="serial" direction="out" type="u" />
      <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />
      <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />
      <arg name="properties" direction="out" type="a{sv}" />
    </method>
    <method name="ApplyMonitorsConfig">
      <arg name="serial" direction="in" type="u" />
      <arg name="method" direction="in" type="u" />
      <arg name="logical_monitors" direction="in" type="a(iiduba(ssa{sv}))" />
      <arg name="properties" direction="in" type="a{sv}" />
    </method>
  </interface>
</node>`;

const DisplayConfigProxy = Gio.DBusProxy.makeProxyWrapper(displayConfigXml);

let displayConfigDbus = null;

var displayState = null;
let monitorsChangedTag = 0;

// After we change mode, reading the state in response to the resultant
// MonitorsChanged signal returns data with the old mode current, not the one
// we just requested. This flag helps us try to deal with it.
let earlySignal = false;

function monitorStatesAreCompatible(a, b) {
    let compatible = true;
    if (a && a.monitors.length == b.monitors.length) {
        for (let i = 0; i < b.monitors.length; ++i) {
            if (!b.monitors[i].compatible(a.monitors[i])) {
                compatible = false;
                break;
            }
        }
    } else {
        compatible = false;
    }
    return compatible;
}

function monitorsChangedHandler() {
    // This signal gets raised when we've changed the state ourselves,
    // but if it isn't the first time we've changed the state, calling
    // GetCurrentState here has "is-current" on the old mode, not the new
    // one, so we have to stop this fooling us into changing back to the old
    // mode.
    log(`MonitorsChanged: ignore ${earlySignal}`);
    const oldState = displayState;
    let bigChange = !monitorStatesAreCompatible(oldState, displayState);
    if (earlySignal && !bigChange) {
        earlySignal = false;
        displayState.monitors = oldState.monitors;
        return;
    }
    earlySignal = false;
    updateDisplayConfig();
    if (bigChange && onMonitorsChanged)
        onMonitorsChanged(displayState);
    else if (!bigChange && onRefreshRateChanged)
        onRefreshRateChanged(displayState);
}

function enable() {
    if (displayConfigDbus)
        return;
    displayConfigDbus = new DisplayConfigProxy(Gio.DBus.session,
        "org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig");
    monitorsChangedTag = displayConfigDbus.connectSignal("MonitorsChanged",
        monitorsChangedHandler);
}

function disable() {
    if (!displayConfigDbus)
        return;
    displayConfigDbus.disconnectSignal(monitorsChangedTag);
    displayConfigDbus = null;
    displayState = null;
    displays = [];
}

var onRefreshRateChanged = null;
var onMonitorsChanged = null;

function updateDisplayConfig() {
    const state = displayConfigDbus.GetCurrentStateSync();
    displayState = {
        serial: state[0], 
        monitors: arrayToObjects(state[1], m => new Monitor(m), "Monitor"),
        logical_monitors: arrayToObjects(state[2], m => new LogicalMonitor(m),
                    "LogicalMonitor"),
        properties: readProperties(state[3])
    };
}

function changeMode(monitor, mode, subMode) {
    monitor.changeMode(mode, subMode);
    const logical_monitors = displayState.logical_monitors.map(lm =>
            lm.getState());
    earlySignal = true;
    let layout_mode =
        displayState.properties["supports-changing-layout-mode"] ?
        displayState.properties["layout-mode"] : undefined;
    if (layout_mode != 1 && layout_mode != 2)
        layout_mode = undefined;
    const props = layout_mode ? { "layout-mode": layout_mode } : {};
    log(`logical_monitors[0] ${logObject(logical_monitors[0])}`);
    displayConfigDbus.ApplyMonitorsConfigSync(
            displayState.serial,
            1,  // Apply temporarily
            logical_monitors,
            props
    );
}
