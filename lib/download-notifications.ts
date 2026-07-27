import { isAndroid } from '@/lib/utils'

let Notifications: typeof import('expo-notifications') | undefined
try {
  Notifications = require('expo-notifications')
} catch (e) {
  console.warn('Failed to load expo-notifications', e)
}

let requested = false

// Files written straight to MediaStore are announced with our own notification, which
// Android 13+ drops unless POST_NOTIFICATIONS was granted. Ask on the first save so the
// prompt has context, and only once — a decline just leaves the toast as the only feedback.
export async function ensureDownloadNotificationPermission() {
  if (!isAndroid || !Notifications || requested) {
    return
  }
  requested = true
  try {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted || !current.canAskAgain) {
      return
    }
    await Notifications.requestPermissionsAsync()
  } catch (e) {
    console.warn('Failed to request download notification permission', e)
  }
}
