#!/bin/sh

I='interface=org.gnome.Mutter.DisplayConfig'

exec /usr/bin/dbus-monitor type=method_return \
    $I,member=GetCurrentState,type=method_call \
    $I,member=ApplyMonitorsConfig,type=method_call \
    $I,member=MonitorsChanged,type=signal
