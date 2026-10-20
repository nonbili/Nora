import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { openSharedUrl } from '@/lib/page'

/**
 * Notifications on desktop: the window's own, which Electron shows as the system's. A click brings
 * Nora forward and opens the url, as a link from another app would.
 */

export interface NotificationChannel {
  id: string
  name: string
  high?: boolean
}

export interface NoraNotification {
  title: string
  body: string
  url?: string
}

export const isNotificationsAvailable = typeof Notification !== 'undefined' && Boolean(window.electron?.ipcRenderer)

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isNotificationsAvailable) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

// The system has no channels to set up on desktop.
export const ensureNotificationChannel = async (_channel: NotificationChannel) => {}

/** Shows a notification now; resolves to whether it was shown. */
export const presentNotification = async (_channel: NotificationChannel, notification: NoraNotification) => {
  if (!isNotificationsAvailable || Notification.permission !== 'granted') return false
  const shown = new Notification(notification.title, { body: notification.body })
  const { url } = notification
  shown.onclick = () => {
    void mainClient.showMainWindow()
    if (url) void openSharedUrl(url)
  }
  return true
}

// A click opens its url in presentNotification already.
export const onNotificationOpened =
  (_open: (url: string) => void): (() => void) =>
  () => {}
