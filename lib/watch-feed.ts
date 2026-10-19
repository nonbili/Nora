import { AppState, Platform } from 'react-native'
import { t } from 'i18next'
import NoraViewModule from '@/modules/nora-view'
import { settings$ } from '@/states/settings'
import { watch$, type WatchedProfile } from '@/states/watch'
import { isAnonymousProfile } from '@/lib/anonymous'
import {
  INSTAGRAM_APP_ID,
  instagramProfileInfoUrl,
  mergeWatchPosts,
  INSTAGRAM_PAGE_HEADERS,
  backgroundIntervalMinutes,
  parseInstagramProfileInfo,
  parseInstagramProfilePage,
  parseXTimeline,
  watchIntervalMinutes,
  watchProfileUrl,
  xTimelineUrl,
  type WatchFetchResult,
  type WatchPost,
  type WatchSite,
} from '@/lib/watch'
import { isWatchWebViewAvailable, loadInWatchWebView } from '@/lib/watch-webview'
import { syncWatchMedia } from '@/lib/watch-media'
import { BACKGROUND_POLL_MIN_INTERVAL_MINUTES as MENTION_POLL_INTERVAL_MINUTES } from '@/lib/mention-notifications'

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

export const WATCH_TASK = 'nora.watch.poll'
const NOTIFICATION_CHANNEL_ID = 'watch'
// After the site said to slow down, or that it wants an account.
const RETRY_AFTER_MS = 60 * 60 * 1000
// How often, while Nora is open, it looks for profiles whose interval is up; only those are asked for.
const FOREGROUND_POLL_MS = 5 * 60 * 1000
// Between two requests, so a long list does not arrive at a site as a burst.
const REQUEST_GAP_MS = 1500
// How long one run may take. The system stops a background task that runs too long, so a long
// list is gone through over several runs, the profiles checked longest ago first.
const RUN_BUDGET_MS = {
  foreground: 3 * 60 * 1000,
  manual: 3 * 60 * 1000,
  background: Platform.OS === 'ios' ? 25 * 1000 : 5 * 60 * 1000,
}

export type WatchRunSource = keyof typeof RUN_BUDGET_MS

export const WATCH_ERROR_NEEDS_LOGIN = 'needsLogin'
export const WATCH_ERROR_RATE_LIMITED = 'rateLimited'

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

class WatchFetchError extends Error {
  constructor(
    message: string,
    readonly retry = false,
  ) {
    super(message)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const parseCookieHeader = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    if (k) out[k] = part.slice(eq + 1).trim()
  }
  return out
}

const siteCookieOrigin: Record<WatchSite, string> = {
  x: 'https://x.com',
  instagram: 'https://www.instagram.com',
}

const isSignedIn: Record<WatchSite, (cookies: Record<string, string>) => boolean> = {
  x: (cookies) => Boolean(cookies.auth_token && cookies.ct0),
  instagram: (cookies) => Boolean(cookies.sessionid),
}

/** The cookies of the first Nora profile signed in to the site, or '' when there is none. */
const findSignedInCookies = async (site: WatchSite): Promise<string> => {
  const profileIds = Array.from(
    new Set(
      settings$.profiles
        .peek()
        .map((profile) => profile?.id)
        .filter((id): id is string => Boolean(id) && !isAnonymousProfile(id)),
    ),
  )
  for (const profileId of profileIds) {
    try {
      const header = await NoraViewModule.getCookies(siteCookieOrigin[site], profileId)
      if (header && isSignedIn[site](parseCookieHeader(header))) {
        return header
      }
    } catch (e) {
      console.warn('watch getCookies failed', site, e)
    }
  }
  return ''
}

const checkStatus = (res: Response, signedIn: boolean) => {
  if (res.status === 429) {
    throw new WatchFetchError(WATCH_ERROR_RATE_LIMITED, true)
  }
  if ((res.status === 401 || res.status === 403) && !signedIn) {
    throw new WatchFetchError(WATCH_ERROR_NEEDS_LOGIN, true)
  }
  if (!res.ok) {
    throw new WatchFetchError(`HTTP ${res.status}`)
  }
}

// Each request is cancelled at the run's deadline, and in any case after this long: a stalled one
// would hold up the run, and every refresh after it, for as long as it hangs.
const REQUEST_TIMEOUT_MS = 30 * 1000

const timeLeft = (deadline: number) => Math.max(0, Math.min(deadline - Date.now(), REQUEST_TIMEOUT_MS))

/** Runs a request, reading its answer included, with a signal that cancels it when its time is up. */
const withDeadline = async <T>(deadline: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeLeft(deadline))
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

const fetchX = (handle: string, cookie: string, _source: WatchRunSource, deadline: number): Promise<WatchFetchResult> =>
  withDeadline(deadline, async (signal) => {
    const res = await fetch(xTimelineUrl(handle), {
      signal,
      headers: {
        'user-agent': DESKTOP_USER_AGENT,
        accept: 'text/html',
        'accept-language': 'en-US,en;q=0.9',
        ...(cookie ? { cookie } : {}),
      },
    })
    checkStatus(res, Boolean(cookie))
    return parseXTimeline(await res.text(), handle)
  })

const fetchInstagramApi = (handle: string, cookie: string, deadline: number): Promise<WatchFetchResult> =>
  withDeadline(deadline, async (signal) => {
    const csrf = parseCookieHeader(cookie).csrftoken
    const res = await fetch(instagramProfileInfoUrl(handle), {
      signal,
      headers: {
        'user-agent': DESKTOP_USER_AGENT,
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'x-ig-app-id': INSTAGRAM_APP_ID,
        'x-requested-with': 'XMLHttpRequest',
        referer: `https://www.instagram.com/${handle}/`,
        cookie,
        ...(csrf ? { 'x-csrftoken': csrf } : {}),
      },
    })
    checkStatus(res, true)
    let json: any
    try {
      json = await res.json()
    } catch (e) {
      if (signal.aborted) throw e
      throw new WatchFetchError('not JSON')
    }
    return parseInstagramProfileInfo(json, handle)
  })

// The profile's own page, as a browser on a computer would ask for it, without cookies.
const fetchInstagramPage = (handle: string, deadline: number): Promise<WatchFetchResult> =>
  withDeadline(deadline, async (signal) => {
    const res = await fetch(watchProfileUrl({ site: 'instagram', handle }), {
      signal,
      headers: { 'user-agent': DESKTOP_USER_AGENT, ...INSTAGRAM_PAGE_HEADERS },
      credentials: 'omit',
    })
    checkStatus(res, false)
    return parseInstagramProfilePage(await res.text(), handle)
  })

// The hidden webview needs the app's UI, so a background run goes without it.
const canUseWebView = (source: WatchRunSource) =>
  source !== 'background' && AppState.currentState === 'active' && isWatchWebViewAvailable()

const isRateLimited = (e: unknown) => e instanceof WatchFetchError && e.message === WATCH_ERROR_RATE_LIMITED

/**
 * With an account, Instagram's own API for the profile. Without one, or when that fails, the
 * profile's page; and when a plain request for that is not answered with its posts, the page
 * as loaded by a real browser, in a webview out of sight.
 */
const fetchInstagram = async (
  handle: string,
  cookie: string,
  source: WatchRunSource,
  deadline: number,
): Promise<WatchFetchResult> => {
  if (cookie) {
    try {
      return await fetchInstagramApi(handle, cookie, deadline)
    } catch (e) {
      // A limit on the API is not one on the page, which is asked for next.
      console.warn('watch instagram api failed', handle, e)
    }
  }
  try {
    return await fetchInstagramPage(handle, deadline)
  } catch (e) {
    if (isRateLimited(e) || !canUseWebView(source) || !timeLeft(deadline)) throw e
    console.warn('watch instagram page failed, trying the webview', handle, e)
  }
  const html = await loadInWatchWebView(watchProfileUrl({ site: 'instagram', handle }), timeLeft(deadline))
  return parseInstagramProfilePage(html, handle)
}

const fetchers: Record<
  WatchSite,
  (handle: string, cookie: string, source: WatchRunSource, deadline: number) => Promise<WatchFetchResult>
> = {
  x: fetchX,
  instagram: fetchInstagram,
}

const isStillWatched = (key: string) => watch$.profiles.peek().some((profile) => profile.key === key)

const checkProfile = async (
  profile: WatchedProfile,
  cookie: string,
  source: WatchRunSource,
  deadline: number,
): Promise<WatchPost[]> => {
  const now = Date.now()
  // Whether an account was there to use, even when the profile was read in the end without it:
  // the feed tells to log in only where that would help.
  const mode = cookie ? 'loggedIn' : 'loggedOut'
  try {
    const result = await fetchers[profile.site](profile.handle, cookie, source, deadline)
    // It can be unwatched while the request is out.
    if (!isStillWatched(profile.key)) {
      return []
    }
    // When the answer came, not when it was asked for: the feed may have been looked at between.
    const { posts, fresh } = mergeWatchPosts(watch$.posts[profile.key].peek() || [], result.posts, {
      now: Date.now(),
      initial: !profile.lastSuccessAt,
    })
    watch$.posts[profile.key].set(posts)
    watch$.updateProfile(profile.key, {
      ...(result.info.name ? { name: result.info.name } : {}),
      ...(result.info.avatar ? { avatar: result.info.avatar } : {}),
      mode,
      lastCheckedAt: now,
      lastSuccessAt: now,
      retryAfter: undefined,
      error: undefined,
    })
    return fresh
  } catch (e: any) {
    if (isStillWatched(profile.key)) {
      watch$.updateProfile(profile.key, {
        mode,
        lastCheckedAt: now,
        retryAfter: e instanceof WatchFetchError && e.retry ? now + RETRY_AFTER_MS : undefined,
        error: e?.message || String(e),
      })
    }
    return []
  }
}

const ensureNotificationChannel = async () => {
  if (Platform.OS !== 'android' || !Notifications) return
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: t('feed.notificationChannel'),
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

const notifyFresh = async (profile: WatchedProfile, fresh: WatchPost[]) => {
  if (!Notifications || !fresh.length) return
  const latest = fresh[0]
  const current = watch$.profiles.peek().find((p) => p.key === profile.key) || profile
  try {
    await ensureNotificationChannel()
    await Notifications.scheduleNotificationAsync({
      content: {
        title: current.name ? `${current.name} (@${current.handle})` : `@${current.handle}`,
        body: fresh.length === 1 ? latest.text || t('feed.newPost') : t('feed.newPosts', { count: fresh.length }),
        // One post opens on its own; several open on the profile, where they all are.
        data: { url: fresh.length === 1 ? latest.url : watchProfileUrl(current) },
      },
      trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
    })
  } catch (e) {
    console.warn('watch notification failed', e)
  }
}

let running: Promise<number> | null = null

/**
 * Checks the watched profiles that are due, the ones checked longest ago first, for as long
 * as the run may take. Resolves to how many new posts were found.
 */
export const refreshWatched = (source: WatchRunSource): Promise<number> => {
  if (running) {
    return running
  }
  running = runRefresh(source).finally(() => {
    running = null
  })
  return running
}

export const isRefreshingWatched = () => Boolean(running)

const runRefresh = async (source: WatchRunSource) => {
  const start = Date.now()
  const defaultMinutes = watch$.checkIntervalMinutes.peek()
  const due = watch$.profiles
    .peek()
    // A refresh by hand tries again even a profile the site asked to wait with.
    .filter((profile) => source === 'manual' || !profile.retryAfter || profile.retryAfter <= start)
    // Each profile at its own interval, unless the feed is refreshed by hand.
    .filter(
      (profile) =>
        source === 'manual' ||
        !profile.lastCheckedAt ||
        start - profile.lastCheckedAt >= watchIntervalMinutes(profile, defaultMinutes) * 60000,
    )
    .sort((a, b) => (a.lastCheckedAt || 0) - (b.lastCheckedAt || 0))
  const cookies: Partial<Record<WatchSite, string>> = {}
  let found = 0
  for (const [i, profile] of due.entries()) {
    if (Date.now() - start > RUN_BUDGET_MS[source]) {
      break
    }
    if (i > 0) {
      await sleep(REQUEST_GAP_MS + Math.random() * REQUEST_GAP_MS)
    }
    if (cookies[profile.site] === undefined) {
      cookies[profile.site] = await findSignedInCookies(profile.site)
    }
    const fresh = await checkProfile(profile, cookies[profile.site] || '', source, start + RUN_BUDGET_MS[source])
    found += fresh.length
    if (profile.notify && fresh.length) {
      await notifyFresh(profile, fresh)
    }
  }
  // The media of what was found, kept for the feed within its own time and storage limits. The
  // background task has to wait for it to be done; in the app the posts are shown without waiting.
  const media = syncWatchMedia(source).catch((e) => console.warn('watch media sync failed', e))
  if (source === 'background') await media
  return found
}

// --- runtime ----------------------------------------------------------------

const isAvailable = Platform.OS !== 'web' && Boolean(TaskManager && BackgroundTask)

if (isAvailable && TaskManager && !TaskManager.isTaskDefined(WATCH_TASK)) {
  TaskManager.defineTask(WATCH_TASK, async () => {
    try {
      await refreshWatched('background')
      return BackgroundTask?.BackgroundTaskResult.Success ?? 1
    } catch (e) {
      console.warn('watch task failed', e)
      return BackgroundTask?.BackgroundTaskResult.Failed ?? 2
    }
  })
}

/** How often the background task should run, or null when nothing is watched. */
const wantedTaskInterval = () => {
  const profiles = watch$.profiles.peek()
  if (!profiles.length) return null
  const interval = backgroundIntervalMinutes(profiles, watch$.checkIntervalMinutes.peek())
  // All background tasks of the app run on one schedule, set by the last one registered: it
  // must not be longer than what the mention notifications register theirs with.
  return settings$.mentionNotificationsEnabled.peek() ? Math.min(interval, MENTION_POLL_INTERVAL_MINUTES) : interval
}

// What the task was registered with by this run of the app; a run starts by registering it anew.
let registeredInterval: number | null | undefined

// The task is there for as long as anything is watched, as often as the profile checked most often needs.
const syncBackgroundTaskNow = async () => {
  if (!isAvailable || !BackgroundTask || !TaskManager) return
  const interval = wantedTaskInterval()
  if (interval === registeredInterval) return
  registeredInterval = interval
  try {
    if (await TaskManager.isTaskRegisteredAsync(WATCH_TASK)) {
      await BackgroundTask.unregisterTaskAsync(WATCH_TASK)
    }
    if (interval !== null) {
      await BackgroundTask.registerTaskAsync(WATCH_TASK, { minimumInterval: interval })
    }
  } catch (e) {
    registeredInterval = undefined
    console.warn('watch task setup failed', e)
  }
}

// One at a time, so that an unregister and a register of two changes do not interleave.
let syncing: Promise<void> = Promise.resolve()
const syncBackgroundTask = () => {
  syncing = syncing.then(syncBackgroundTaskNow)
  return syncing
}

/** Asks for permission to notify, and turns notifications on for one watched profile if given. */
export const enableWatchNotifications = async (key: string): Promise<boolean> => {
  if (!Notifications) return false
  const current = await Notifications.getPermissionsAsync()
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted
  if (granted) {
    watch$.setNotify(key, true)
    await ensureNotificationChannel()
  }
  return granted
}

if (isAvailable) {
  // Every check changes the list too; the task is only registered again when its interval changes.
  watch$.profiles.onChange(() => void syncBackgroundTask())
  watch$.checkIntervalMinutes.onChange(() => void syncBackgroundTask())
  settings$.mentionNotificationsEnabled.onChange(() => void syncBackgroundTask())
  // While Nora is open the background task does not run on iOS, and on Android only when the
  // system gets to it; a profile whose interval is up is checked from here then.
  let foregroundTimer: ReturnType<typeof setInterval> | undefined
  const syncForegroundTimer = (state: string) => {
    if (state === 'active') {
      void refreshWatched('foreground')
      if (!foregroundTimer) {
        foregroundTimer = setInterval(() => void refreshWatched('foreground'), FOREGROUND_POLL_MS)
      }
    } else if (foregroundTimer) {
      clearInterval(foregroundTimer)
      foregroundTimer = undefined
    }
  }
  AppState.addEventListener('change', syncForegroundTimer)
  syncForegroundTimer(AppState.currentState)
  void syncBackgroundTask()
}
