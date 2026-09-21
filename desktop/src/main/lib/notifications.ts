import type { BrowserWindow, WebContents } from 'electron'

export function attachGuestNotifications(
  guest: WebContents,
  owner: BrowserWindow,
  activateTab: (webContentsId: number) => void,
) {
  // Listen on the guest itself rather than trusting a page-supplied tab ID.
  guest.on('ipc-message', (event, channel) => {
    if (channel !== 'notification-click' || guest.isDestroyed() || owner.isDestroyed()) return
    if (!event.senderFrame || event.senderFrame !== guest.mainFrame) return
    if (owner.isMinimized()) owner.restore()
    owner.show()
    owner.focus()
    activateTab(guest.id)
  })
}
