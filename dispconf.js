const {Gio, GLib} = imports.gi;

const {logError, logObject} = imports.util;

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

class Monitor extends MonitorDetails {
    constructor(ar) {
        super(ar[0]);
        this.modes = arrayToObjects(ar[1], m => new Mode(m), "Mode");
        this.properties = readProperties(ar[2]);
        this.propertyVariants = ar[2];
        this.processModes();
    }

    // Creates three new fields:
    // * filteredModes is an array of indices into this.modes, containing only
    //   modes with the same dimensions as the current mode
    // * refreshRates is an array of refresh rate names corresponding to
    //   filteredModes
    // * currentMode is the index of the current mode in either of the above
    //   two arrays
    processModes() {
        this.filteredModes = [];
        this.refreshRates = [];
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
        for (const mi in this.modes) {
            let add = false;
            if (mi == modesIndex) {
                add = true;
                this.currentMode = this.filteredModes.length;
            } else if (this.modes[mi].width == currentWidth &&
                    this.modes[mi].height == currentHeight) {
                add = true;
            }
            if (add) {
                this.filteredModes.push(mi);
                this.refreshRates.push(this.modes[mi].refresh_rate);
            }
        }
        this.processRefreshRates();
    }

    // Converts refresh rates to strings, rounded if possible
    processRefreshRates() {
        let roundable = isRoundable(this.refreshRates[0]);
        if (this.refreshRates.length > 1 && roundable) {
            for (let i = 1; i < this.refreshRates.length; ++i)
            {
                let ri = this.refreshRates[i];
                if (!isRoundable(ri))
                {
                    roundable = false;
                    break;
                }
                for (let j = 0; j < i; ++j) {
                    let rj = this.refreshRates[j];
                    if (Math.round(rj) == Math.round(ri)) {
                        roundable = false;
                        break;
                    }
                }
                if (!roundable)
                    break;
            }
        }
        for (const i in this.refreshRates) {
            if (roundable)
                this.refreshRates[i] = `${Math.round(this.refreshRates[i])}`;
            else
                this.refreshRates[i] =
                    `${Math.round(this.refreshRates[i] * 1000) / 1000}`;
        }
    }

    // Only updates this object's records
    changeMode(currentMode) {
        delete this.modes[this.filteredModes[this.currentMode]].
            properties['is-current'];
        this.modes[this.filteredModes[currentMode]].
            properties['is-current'] = true;
        this.currentMode = currentMode;
    }

    // Gets a tuple for use as a monitor element in ApplyMonitorsConfig
    getState() {
        const currentMode = this.modes.find(m => m.isCurrent());
        return [this.connector, currentMode.id, this.propertyVariants];
    }

    // Returns true if this Monitor has the same connector and refresh rates
    // as other
    compatible(other) {
        if (!(other instanceof Monitor))
            return false;
        if (this.refreshRates.length != other.refreshRates.length)
            return false;
        for (const i in this.refreshRates) {
            if (this.refreshRates[i] != other.refreshRates[i])
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

let ignoreSignal = false;

function enable() {
    if (displayConfigDbus)
        return;
    displayConfigDbus = new DisplayConfigProxy(Gio.DBus.session,
        "org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig");
    monitorsChangedTag = displayConfigDbus.connectSignal("MonitorsChanged",
            () => {
        // This signal gets raised when we've changed the state ourselves,
        // but if it isn't the first time we've changed the state, calling
        // GetCurrentState here has "is-current" on the old mode, not the new
        // one, so we have to ignore that.
        log(`MonitorsChanged: ignore ${ignoreSignal}`);
        if (ignoreSignal)
            ignoreSignal = false;
        else
            updateDisplayConfig();
    });
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
    const oldState = displayState;
    displayState = {
        serial: state[0], 
        monitors: arrayToObjects(state[1], m => new Monitor(m), "Monitor"),
        logical_monitors: arrayToObjects(state[2], m => new LogicalMonitor(m),
                    "LogicalMonitor"),
        properties: readProperties(state[3])
    };
    let bigChange = false;
    if (oldState && oldState.monitors.length == displayState.monitors.length) {
        for (const i in displayState.monitors) {
            if (!displayState.monitors[i].compatible(oldState.monitors[i])) {
                bigChange = true;
                break;
            }
        }
    } else {
        bigChange = true;
    }
    if (bigChange && onMonitorsChanged)
        onMonitorsChanged(displayState);
    else if (!bigChange && onRefreshRateChanged)
        onRefreshRateChanged(displayState);
}

function changeMode(monitor, mode) {
    monitor.changeMode(mode);
    const logical_monitors = displayState.logical_monitors.map(lm =>
            lm.getState());
    ignoreSignal = true;
    displayConfigDbus.ApplyMonitorsConfigSync(
            displayState.serial,
            1,  // Apply temporarily
            logical_monitors,
            {}  // Don't change properties
    );
}
