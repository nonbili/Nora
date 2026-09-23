import { spawn } from 'child_process'
import * as dbus from '@particle/dbus-next'

// When a portal notification is clicked, xdg-desktop-portal-gnome passes the XDG
// activation token only to org.freedesktop.Application.Activate on our app ID. Wayland
// won't raise the window without it, and Electron only accepts a token from a second
// instance, so relaunch with the token and let the `second-instance` handler focus.
class ApplicationInterface extends dbus.interface.Interface {
  Activate(platformData: Record<string, dbus.Variant>) {
    const token = platformData['activation-token']?.value
    if (typeof token == 'string' && token) {
      spawn(process.execPath, [], {
        env: { ...process.env, XDG_ACTIVATION_TOKEN: token },
        detached: true,
        stdio: 'ignore',
      }).unref()
    }
  }
}

ApplicationInterface.configureMembers({
  methods: {
    Activate: { inSignature: 'a{sv}' },
  },
})

export async function exportApplication() {
  const appId = process.env.FLATPAK_ID
  if (process.platform != 'linux' || !appId) return

  try {
    const bus = dbus.sessionBus()
    bus.on('error', (error) => console.error('D-Bus session bus error', error))
    const path = '/' + appId.replace(/\./g, '/').replace(/-/g, '_')
    bus.export(path, new ApplicationInterface('org.freedesktop.Application'))
    await bus.requestName(appId, 0)
  } catch (error) {
    console.error('Failed to export org.freedesktop.Application', error)
  }
}
