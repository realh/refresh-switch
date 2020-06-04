const Gio = imports.gi.Gio;

var onDisplayConfigChanged = null;

var [getDisplays, enable, disable] = (function() {

let mainLoop = null;    // For debugging outside of gnome-shell

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

let displayConfigResources = {};
let displays = [];
let monitorsChangedTag = 0;

function enable() {
    displayConfigDbus = new DisplayConfigProxy(Gio.DBus.session,
        "org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig");
    monitorsChangedTag = displayConfigDbus.connectSignal("MonitorsChanged",
            () => {
        updateDisplayConfig();
        if (onDisplayConfigChanged)
            onDisplayConfigChanged(displays);
    });
}

function disable() {
    displayConfigDbus.disconnectSignal(monitorsChangedTag);
    displayConfigDbus = null;
    displayConfigResources = {};
    displays = [];
}

function updateDisplayConfig() {
    displayConfigResources = {};
    displays = [];
    return new Promise((resolve, reject) => {
        displayConfigDbus.GetResourcesRemote(function(resources, error, fdlist)
        {
            if (error) {
                reject(error);
            }
            displayConfigResources.serial = resources[0];
            displayConfigResources.crtcs = resources[1];
            displayConfigResources.outputs = resources[2];
            displayConfigResources.modes = resources[3];
            // Not interested in max_screen_width/_height
            processDisplayConfig();
            resolve(displays);
        });
    });
}

function isRoundable(n) {
    return (Math.ceil(n) - n < 0.1) || (n - Math.floor(n) < 0.1);
}

function processDisplayConfig() {
    for (const output of displayConfigResources.outputs) {
        const current_crtc = output[2];
        if (current_crtc == -1)
            continue;
        let current_mode = displayConfigResources.crtcs[current_crtc][7];
        if (current_mode == -1)
            continue;
        const props = output[7];
        let name = props["display-name"];
        if (name)
            name = name.get_string()[0];
        else
            name = output[4];
        const mode = displayConfigResources.modes[current_mode];
        const width = mode[2];
        const height = mode[3];
        // Filter modes to only include same width and height as current
        const modes = output[5].filter(n => {
            const mode = displayConfigResources.modes[n];
            return mode[2] == width && mode[3] == height;
        });
        const refresh = modes.map(n => displayConfigResources.modes[n][4]);
        // If all refresh rates round to unique values we can show them rounded
        let roundable = isRoundable(refresh[0]);
        if (refresh.length > 1 && roundable) {
            for (let i = 1; i < refresh.length; ++i)
            {
                let ri = refresh[i];
                if (!isRoundable(ri))
                {
                    roundable = false;
                    break;
                }
                for (let j = 0; j < i; ++j) {
                    let rj = refresh[j];
                    if (Math.round(rj) == Math.round(ri)) {
                        roundable = false;
                        break;
                    }
                }
                if (!roundable)
                    break;
            }
        }
        for (const i in refresh) {
            if (roundable)
                refresh[i] = `${Math.round(refresh[i])}`;
            else
                refresh[i] = `${Math.round(refresh[i] * 1000) / 1000}`;
        }
        // modes is an array of indices into displayConfigResources.modes
        current_mode = modes.indexOf(current_mode);
        displays.push({ id: output[0], name, current_mode, modes, refresh });
    }
}

function getDisplays() {
    if (displays.length)
        return new Promise((resolve, _) => resolve(displays));
    else
        return updateDisplayConfig();
}

return [getDisplays, enable, disable];

})();
