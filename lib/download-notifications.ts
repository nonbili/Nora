import { isAndroid } from '@/lib/utils'
import { isNotificationsAvailable, requestNotificationPermission } from '@/lib/notifications'

let requested = false

// Files written straight to MediaStore are announced with our own notification, which
// Android 13+ drops unless POST_NOTIFICATIONS was granted. Ask on the first save so the
// prompt has context, and only once — a decline just leaves the toast as the only feedback.
export async function ensureDownloadNotificationPermission() {
  if (!isAndroid || !isNotificationsAvailable || requested) {
    return
  }
  requested = true
  try {
    await requestNotificationPermission()
  } catch (e) {
    console.warn('Failed to request download notification permission', e)
  }
}
