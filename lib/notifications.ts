import { Platform } from 'react-native'
import NoraViewModule from '@/modules/nora-view'

let Notifications: typeof import('expo-notifications') | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications')
} catch (e) {
  console.warn('Failed to load expo-notifications', e)
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })
}

// The F-Droid build has no expo-notifications, which brings in Firebase; on Android Nora's own
// module posts them then, and a tap opens the url as a link from another app would.
const nativeModule =
  Platform.OS === 'android' && !Notifications && NoraViewModule.postNotification ? NoraViewModule : undefined

export const isNotificationsAvailable = Boolean(Notifications || nativeModule)

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

/** Whether notifications may be shown, asking the user when they were not asked yet. */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (Notifications) {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (!current.canAskAgain) return false
    return (await Notifications.requestPermissionsAsync()).granted
  }
  if (nativeModule) {
    if (nativeModule.areNotificationsEnabled?.()) return true
    return (await nativeModule.requestNotificationPermission?.()) ?? false
  }
  return false
}

export const ensureNotificationChannel = async (channel: NotificationChannel) => {
  if (Platform.OS !== 'android' || !Notifications) return
  await Notifications.setNotificationChannelAsync(channel.id, {
    name: channel.name,
    importance: channel.high ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
    ...(channel.high ? { vibrationPattern: [0, 250, 250, 250] } : {}),
  })
}

let nativeId = Math.floor(Math.random() * 0x40000000)

/** Shows a notification now; resolves to whether it was shown. */
export const presentNotification = async (channel: NotificationChannel, notification: NoraNotification) => {
  if (Notifications) {
    await ensureNotificationChannel(channel)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: notification.url ? { url: notification.url } : {},
        ...(channel.high ? { sound: 'default' } : {}),
      },
      trigger: Platform.OS === 'android' ? { channelId: channel.id } : null,
    })
    return true
  }
  if (nativeModule?.postNotification) {
    nativeId = (nativeId + 1) % 0x7fffffff
    return nativeModule.postNotification(
      channel.id,
      channel.name,
      Boolean(channel.high),
      nativeId,
      notification.title,
      notification.body,
      notification.url ?? null,
    )
  }
  return false
}

/**
 * Calls `open` with the url of a notification the user taps, also of the one that started the
 * app. Those posted by Nora's own module arrive as a link instead, through expo-linking.
 */
export const onNotificationOpened = (open: (url: string) => void): (() => void) => {
  if (!Notifications) return () => {}
  const urlOf = (response: import('expo-notifications').NotificationResponse | null) => {
    const url = response?.notification?.request?.content?.data?.url
    return typeof url === 'string' ? url : undefined
  }
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    const url = urlOf(response)
    if (url) open(url)
  })
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = urlOf(response)
    if (url) open(url)
  })
  return () => sub.remove()
}
