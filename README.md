Refresh Switch GNOME extension
==============================
This is a GNOME shell extension to allow convenient switching of your
monitor(s) refresh rate without having to navigate through the GNOME settings
app and confirm each mode change.

The UI is implemented as a GTK window in a separate process from gnome-shell.
This made it easier to test, and makes it easier to use in case the display is
a TV which overscans in some modes; the window stays open after selecting a
mode, whereas a menu would close, and the panel might be off-screen due to
overscan. The disadvantage of this design is that Wayland and/or modern mutter
don't allow an application to control the position of its windows.

I also intended to include a control for turning fullscreen redirect on and
off, but this is more awkward to implement with a separate process, and there
was already a
[Fix Fullscreen Tearing extension](https://extensions.gnome.org/extension/1445/fix-fullscreen-tearing/)
which serves very well since
[I updated it](https://github.com/realh/fix-fullscreen-tearing).
