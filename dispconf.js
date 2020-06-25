const Util = (function() {
    try {
        const ExtensionUtils = imports.misc.extensionUtils;
        const Me = ExtensionUtils.getCurrentExtension();
        return Me.imports.util;
    } catch (error) {
        return imports.util;
    }
})();

const {Gio, GLib} = imports.gi;

const {logError, logObject, arrayToObjects, readProperties,
    isRoundable, roundBy, wouldRoundTheSame} = Util;

var onMonitorsChanged = null;

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

class Monitor extends MonitorDetails {
    constructor(ar) {
        super(ar[0]);
        this.modes = arrayToObjects(ar[1], m => new Mode(m), "Mode");
        this.modes = this.modes.reduce((acc, v) => {
            acc[v.id] = v;
            if (v.properties["is-current"]) {
                //delete v.properties["is-current"];
                this.currentMode = v.id;
            }
            return acc;
        }, {});
        this.properties = readProperties(ar[2]);
    }

    canUnderscan() {
        return this.properties["is-underscanning"] !== undefined;
    }

    isUnderscanning() {
        return this.properties["is-underscanning"];
    }

    // Returns an array of mode ids with the same width and height as current
    // mode
    getFilteredModes() {
        if (this.currentMode === undefined)
            return [];
        const cm = this.modes[this.currentMode];
        const w = cm.width;
        const h = cm.height;
        return Object.keys(this.modes).filter(k =>
                this.modes[k].width == w && this.modes[k].height == h);
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
let monitorsChangedTag = null;

function enable() {
    if (!displayConfigDbus)
        displayConfigDbus = new DisplayConfigProxy(Gio.DBus.session,
            "org.gnome.Mutter.DisplayConfig",
            "/org/gnome/Mutter/DisplayConfig");
    if (monitorsChangedTag == null)
        monitorsChangedTag = displayConfigDbus.connectSignal("MonitorsChanged",
            () => {
                updateMonitorsState().then(state => {
                    if (onMonitorsChanged)
                        onMonitorsChanged(state);
                }, error => {
                    log("Error reading new state after MonitorsChanged signal");
                    log(error);
                });
            });
}

function disable() {
    if (!displayConfigDbus)
        return;
    if (monitorsChangedTag != null) {
        displayConfigDbus.disconnectSignal(monitorsChangedTag);
        monitorsChangedTag = null;
    }
    displayConfigDbus = null;
    displayState = null;
    displays = [];
}

let monitorsState = null;

function getMonitorsState() {
    return new Promise((resolve, reject) => {
        displayConfigDbus.GetCurrentStateRemote(function(state, error) {
            if (error) {
                reject(new Error("Unexpected result from GetCurrentState(): " +
                    logObject(error)));
            } else {
                let serial = state[0];
                if (serial instanceof GLib.Variant)
                    serial = serial.deepUnpack();
                resolve({
                    serial,
                    monitors: arrayToObjects(state[1],
                            m => new Monitor(m), "Monitor"),
                    logical_monitors: arrayToObjects(state[2],
                            m => new LogicalMonitor(m), "LogicalMonitor"),
                    properties: readProperties(state[3])
                });
            }
        });
    });
}

function updateMonitorsState() {
    return getMonitorsState().then(state => monitorsState = state);
}

// monId: connector Id for monitor
// modeId: Id of mode to select for this monitor
// returns false if mode is unchanged
function changeMode(monId, modeId, underscan) {
    for (const mon of monitorsState.monitors) {
        if (mon.connector == monId) {
            if (mon.canUnderscan()) {
                if (underscan != true)
                    underscan = false;
            } else if (underscan !== undefined) {
                if (underscan)
                    log(`Monitor ${monId} does not support underscan`);
                underscan = undefined;
            }
            if (mon.currentMode == modeId && mon.isUnderscanning() != underscan)
                return false;
            for (const k in mon.modes) {
                let mode = mon.modes[k];
                mode.properties["is-current"] = (mode.id == modeId);
            }
            mon.currentMode = modeId;
            mon.properties["is-underscanning"] = underscan;
        }
    }
    // Build new logical_monitors configuration for ApplyMonitorsConfig
    let logicalMonitors = monitorsState.logical_monitors.map(lm => {
        let mons = lm.monitors.map(mon => {
            mon = monitorsState.monitors.find(
                    m => m.connector == mon.connector);
            let props = mon.canUnderscan() ? 
                { "enable-underscanning": mon.isUnderscanning() } : {}
            return [mon.connector, mon.currentMode, props];
        });
        return [lm.x, lm.y, lm.scale, lm.transform, lm.primary, mons];
    });
    let layoutMode =
        monitorsState.properties["supports-changing-layout-mode"] ?
        monitorsState.properties["layout-mode"] : undefined;
    let props = layoutMode === undefined ? {} : {"layout-mode": layoutMode};
    /*
    let error = displayConfigDbus.ApplyMonitorsConfigSync(monitorsState.serial,
            1, // config is temporary
            logicalMonitors, props);
    log(`Result of ApplyMonitorsConfig: ${error}`);
    */
    displayConfigDbus.ApplyMonitorsConfigRemote(monitorsState.serial,
            1, // config is temporary
            logicalMonitors, props, error => {
        log(`Result of ApplyMonitorsConfig: ${error}`);
    });
}
