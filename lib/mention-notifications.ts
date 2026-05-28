import { AppState, Platform } from 'react-native'
import NoraViewModule from '@/modules/nora-view'
import { createMMKV, type MMKV } from 'react-native-mmkv'
import { settings$ } from '@/states/settings'

let Notifications: typeof import('expo-notifications') | undefined
let TaskManager: typeof import('expo-task-manager') | undefined
let BackgroundTask: typeof import('expo-background-task') | undefined

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  TaskManager = require('expo-task-manager')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  BackgroundTask = require('expo-background-task')
} catch (e) {
  console.warn('Failed to load expo-notifications or related modules', e)
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

export const isMentionNotificationsAvailable = Boolean(Notifications && TaskManager && BackgroundTask)

const storage = Platform.OS !== 'web' ? createMMKV({ id: 'mention-notifications' }) : null as unknown as MMKV
const SEEN_KEY = 'seenIds'
const LAST_POLL_KEY = 'lastPollMs'
const LAST_BACKGROUND_POLL_KEY = 'lastBackgroundPollMs'
const MAX_SEEN = 200
const FOREGROUND_POLL_MIN_AGE_MS = 5 * 60 * 1000
const FOREGROUND_POLL_INTERVAL_MS = 5 * 60 * 1000
const FOREGROUND_POLL_BACKGROUND_GRACE_MS = 60 * 60 * 1000
const BACKGROUND_POLL_MIN_INTERVAL_MINUTES = 15
const NOTIFICATION_CHANNEL_ID = 'mentions'

export const POLL_TASK = 'nora.mentionNotifications.poll'

export interface PollItem {
  source: string
  kind: 'mention' | 'dm'
  profileId?: string
  id: string
  url: string
  title: string
  body: string
  createdAtMs: number
}

export interface PollResult {
  loggedIn: boolean
  items: PollItem[]
  errors: string[]
}

interface ServicePoller {
  id: string
  poll: () => Promise<PollResult>
}

// --- x.com poller -----------------------------------------------------------

const X_WEB_BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const parseCookieHeader = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (k) out[k] = v
  }
  return out
}

const xHeaders = (cookieHeader: string, csrf: string) => ({
  authorization: X_WEB_BEARER,
  'x-csrf-token': csrf,
  'x-twitter-active-user': 'yes',
  'x-twitter-auth-type': 'OAuth2Session',
  'x-twitter-client-language': 'en',
  cookie: cookieHeader,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://x.com/',
  origin: 'https://x.com',
  'user-agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
})

const fetchXMentions = async (headers: Record<string, string>, profileId: string): Promise<PollItem[]> => {
  const url =
    'https://x.com/i/api/2/notifications/mentions.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&include_entities=true&include_user_entities=true&count=20&ext=mediaStats%2ChighlightedLabel'
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`mentions HTTP ${res.status}`)
  const json: any = await res.json()
  const tweets = json?.globalObjects?.tweets || {}
  const users = json?.globalObjects?.users || {}
  const items: PollItem[] = []
  for (const id of Object.keys(tweets)) {
    const t = tweets[id]
    const author = users[t.user_id_str]
    items.push({
      source: 'x',
      kind: 'mention',
      profileId,
      id,
      url: `https://x.com/${author?.screen_name || 'i'}/status/${id}`,
      title: `Mention from ${author?.name || author?.screen_name || 'x.com'}`,
      body: t.full_text || t.text || '',
      createdAtMs: t.created_at ? Date.parse(t.created_at) : Date.now(),
    })
  }
  return items
}

const fetchXDms = async (headers: Record<string, string>, profileId: string): Promise<PollItem[]> => {
  const url =
    'https://x.com/i/api/1.1/dm/inbox_initial_state.json?nsfw_filtering_enabled=false&filter_low_quality=true&include_quality=all&include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1&skip_status=1&dm_secret_conversations_enabled=false&krs_registration_enabled=true&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=true&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&ext=mediaColor%2CaltText%2CmediaStats%2ChighlightedLabel%2CvoiceInfo'
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`dms HTTP ${res.status}`)
  const json: any = await res.json()
  const entries = json?.inbox_initial_state?.entries || []
  const users = json?.inbox_initial_state?.users || {}
  const items: PollItem[] = []
  for (const e of entries) {
    const m = e?.message
    if (!m) continue
    const sender = users[m.message_data?.sender_id]
    items.push({
      source: 'x',
      kind: 'dm',
      profileId,
      id: String(m.id),
      url: `https://x.com/messages/${m.conversation_id}`,
      title: `DM from ${sender?.name || sender?.screen_name || 'x.com'}`,
      body: m.message_data?.text || '',
      createdAtMs: m.time ? Number(m.time) : Date.now(),
    })
  }
  return items
}

const getXPollProfiles = () =>
  Array.from(
    new Set(
      settings$.profiles
        .get()
        .map((p) => p?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  )

const pollXProfile = async (profileId: string): Promise<PollResult> => {
  const result: PollResult = { loggedIn: false, items: [], errors: [] }
  let cookieHeader = ''
  try {
    cookieHeader = await NoraViewModule.getCookies('https://x.com', profileId)
  } catch (e: any) {
    result.errors.push(`x ${profileId} getCookies: ${e?.message || e}`)
    return result
  }
  const cookies = parseCookieHeader(cookieHeader)
  if (!cookies.ct0 || !cookies.auth_token) return result
  result.loggedIn = true
  const headers = xHeaders(cookieHeader, cookies.ct0)
  const [mentions, dms] = await Promise.allSettled([fetchXMentions(headers, profileId), fetchXDms(headers, profileId)])
  if (mentions.status === 'fulfilled') result.items.push(...mentions.value)
  else result.errors.push(`x ${profileId} mentions: ${mentions.reason?.message || mentions.reason}`)
  if (dms.status === 'fulfilled') result.items.push(...dms.value)
  else result.errors.push(`x ${profileId} dms: ${dms.reason?.message || dms.reason}`)
  return result
}

const pollX = async (): Promise<PollResult> => {
  const merged: PollResult = { loggedIn: false, items: [], errors: [] }
  const profiles = getXPollProfiles()
  const results = await Promise.allSettled(profiles.map((profileId) => pollXProfile(profileId)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      merged.loggedIn = merged.loggedIn || r.value.loggedIn
      merged.items.push(...r.value.items)
      merged.errors.push(...r.value.errors)
    } else {
      merged.errors.push(`x ${profiles[i]}: ${r.reason?.message || r.reason}`)
    }
  })
  return merged
}

// --- registry & runtime -----------------------------------------------------

const pollers: ServicePoller[] = [{ id: 'x', poll: pollX }]

const ensureNotificationChannel = async () => {
  if (Platform.OS !== 'android' || !Notifications) return
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: 'Mentions and DMs',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  })
}

export const pollAll = async (): Promise<PollResult> => {
  const merged: PollResult = { loggedIn: false, items: [], errors: [] }
  const results = await Promise.allSettled(pollers.map((p) => p.poll()))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      merged.loggedIn = merged.loggedIn || r.value.loggedIn
      merged.items.push(...r.value.items)
      merged.errors.push(...r.value.errors)
    } else {
      merged.errors.push(`${pollers[i].id}: ${r.reason?.message || r.reason}`)
    }
  })
  merged.items.sort((a, b) => b.createdAtMs - a.createdAtMs)
  return merged
}

const loadSeenIds = (): Set<string> => {
  const raw = storage.getString(SEEN_KEY)
  if (!raw) return new Set()
  try {
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

const saveSeenIds = (ids: Set<string>) => {
  const arr = Array.from(ids)
  const trimmed = arr.length > MAX_SEEN ? arr.slice(arr.length - MAX_SEEN) : arr
  storage.set(SEEN_KEY, JSON.stringify(trimmed))
}

const itemKey = (i: PollItem) => `${i.source}:${i.profileId || 'default'}:${i.kind}:${i.id}`

export const runPollAndNotify = async (source: 'foreground' | 'background' | 'manual' = 'manual'): Promise<number> => {
  const now = Date.now()
  storage.set(LAST_POLL_KEY, now)
  if (source === 'background') {
    storage.set(LAST_BACKGROUND_POLL_KEY, now)
  }
  const r = await pollAll()
  if (r.errors.length) {
    console.warn('mention notification poll errors', r.errors)
  }
  if (!r.loggedIn) return 0
  await ensureNotificationChannel()
  const seen = loadSeenIds()
  const fresh = r.items.filter((i) => !seen.has(itemKey(i)))
  let fired = 0
  for (const item of fresh) {
    try {
      if (Notifications) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: item.title,
            body: item.body || ' ',
            data: { url: item.url },
            sound: 'default',
          },
          trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
        })
        fired += 1
      }
    } catch (e) {
      console.warn('schedule notification failed', e)
    }
    seen.add(itemKey(item))
  }
  saveSeenIds(seen)
  return fired
}

let foregroundPollTimer: ReturnType<typeof setInterval> | undefined
let foregroundPollInFlight = false

const runForegroundPollIfDue = () => {
  if (AppState.currentState !== 'active') return
  if (!settings$.mentionNotificationsEnabled.get()) return
  if (foregroundPollInFlight) return
  const lastBackgroundPoll = storage.getNumber(LAST_BACKGROUND_POLL_KEY) || 0
  if (Date.now() - lastBackgroundPoll < FOREGROUND_POLL_BACKGROUND_GRACE_MS) return
  const last = storage.getNumber(LAST_POLL_KEY) || 0
  if (Date.now() - last < FOREGROUND_POLL_MIN_AGE_MS) return
  foregroundPollInFlight = true
  runPollAndNotify('foreground')
    .catch((e) => console.warn('foreground poll failed', e))
    .finally(() => {
      foregroundPollInFlight = false
    })
}

const syncForegroundPollTimer = () => {
  const shouldRun =
    isMentionNotificationsAvailable && AppState.currentState === 'active' && settings$.mentionNotificationsEnabled.get()
  if (!shouldRun) {
    if (foregroundPollTimer) {
      clearInterval(foregroundPollTimer)
      foregroundPollTimer = undefined
    }
    return
  }
  if (!foregroundPollTimer) {
    foregroundPollTimer = setInterval(runForegroundPollIfDue, FOREGROUND_POLL_INTERVAL_MS)
  }
  runForegroundPollIfDue()
}

AppState.addEventListener('change', () => {
  syncForegroundPollTimer()
})

settings$.mentionNotificationsEnabled.onChange(() => {
  syncForegroundPollTimer()
})

syncForegroundPollTimer()

if (TaskManager && !TaskManager.isTaskDefined(POLL_TASK)) {
  TaskManager.defineTask(POLL_TASK, async () => {
    try {
      await runPollAndNotify('background')
      return BackgroundTask?.BackgroundTaskResult.Success ?? 1
    } catch (e) {
      console.warn('mention poll task failed', e)
      return BackgroundTask?.BackgroundTaskResult.Failed ?? 2
    }
  })
}

const ensurePermission = async (): Promise<boolean> => {
  if (!Notifications) return false
  const cur = await Notifications.getPermissionsAsync()
  if (cur.granted) return true
  const req = await Notifications.requestPermissionsAsync()
  return !!req.granted
}

const registerBackgroundPollTask = async () => {
  if (!BackgroundTask) return
  await BackgroundTask.registerTaskAsync(POLL_TASK, { minimumInterval: BACKGROUND_POLL_MIN_INTERVAL_MINUTES })
}

const ensureEnabledRuntime = async () => {
  if (!isMentionNotificationsAvailable || !settings$.mentionNotificationsEnabled.get()) return
  try {
    await ensureNotificationChannel()
    await registerBackgroundPollTask()
  } catch (e) {
    console.warn('mention notification runtime setup failed', e)
  }
  syncForegroundPollTimer()
}

export const enableMentionNotifications = async (): Promise<{ ok: boolean; reason?: string }> => {
  if (!isMentionNotificationsAvailable) {
    return { ok: false, reason: 'Notifications not supported on this device' }
  }
  const granted = await ensurePermission()
  if (!granted) return { ok: false, reason: 'notification permission denied' }
  await ensureNotificationChannel()
  try {
    const r = await pollAll()
    if (r.loggedIn) {
      const seen = loadSeenIds()
      for (const item of r.items) seen.add(itemKey(item))
      saveSeenIds(seen)
    }
    if (r.errors.length) {
      console.warn('mention notification seed poll errors', r.errors)
    }
  } catch (e) {
    console.warn('seed failed', e)
  }
  try {
    await registerBackgroundPollTask()
    syncForegroundPollTimer()
    return { ok: true }
  } catch (e: any) {
    return { ok: false, reason: e?.message || String(e) }
  }
}

export const disableMentionNotifications = async () => {
  if (!BackgroundTask) return
  try {
    await BackgroundTask.unregisterTaskAsync(POLL_TASK)
  } catch {
    // ignore
  }
}

ensureEnabledRuntime()
