import { AppState, Platform } from 'react-native'
import { t } from 'i18next'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { getTimeline, isMediaOnly, profileNotifies, timelineIntervals, watch$, type WatchedProfile } from '@/states/watch'
import {
  mergeWatchPosts,
  backgroundIntervalMinutes,
  dueWatchProfiles,
  watchKey,
  watchSiteLabels,
  watchSourceLabel,
  type WatchPost,
  type WatchSite,
  type WatchTarget,
} from '@/lib/watch'
import { WATCH_WEBVIEW_CANCELLED, isWatchWebViewAvailable } from '@/lib/watch-webview'
import {
  REQUEST_GAP_MS,
  RETRY_AFTER_MS,
  WATCH_ERROR_NEEDS_VERIFICATION,
  WatchFetchError,
  canUseWebView,
  fetchImginn,
  fetchers,
  imginnBlocked$,
  resumeImginn,
  sleep,
  type WatchRunSource,
} from '@/lib/watch/fetch'
import { syncWatchMedia } from '@/lib/watch-media'
import { showActionToast, showToast } from '@/lib/toast'
import { accountChoice, findSignedInCookies, siteCookieOrigin, type SiteAccount } from '@/lib/watch-account'
import { getProfilePosts, setProfilePosts } from '@/lib/watch-db'
import { feedTabUrl, isFeedTabUrl } from '@/lib/feed-tab'
import { BACKGROUND_POLL_MIN_INTERVAL_MINUTES as MENTION_POLL_INTERVAL_MINUTES } from '@/lib/mention-notifications'

import {
  ensureNotificationChannel as ensureChannel,
  isNotificationsAvailable,
  presentNotification,
  requestNotificationPermission,
} from '@/lib/notifications'

let TaskManager: typeof import('expo-task-manager') | undefined
let BackgroundTask: typeof import('expo-background-task') | undefined

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  TaskManager = require('expo-task-manager')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  BackgroundTask = require('expo-background-task')
} catch (e) {
  console.warn('Failed to load expo-task-manager or expo-background-task', e)
}

export const WATCH_TASK = 'nora.watch.poll'
const NOTIFICATION_CHANNEL_ID = 'watch'
// How often, while Nora is open, it looks for profiles whose interval is up; only those are asked for.
const FOREGROUND_POLL_MS = 5 * 60 * 1000
const DESKTOP_FIRST_RUN_DELAY_MS = 10 * 1000
// How long one run may take. The system stops a background task that runs too long, so a long
// list is gone through over several runs, the profiles checked longest ago first.
const RUN_BUDGET_MS: Record<WatchRunSource, number> = {
  foreground: 3 * 60 * 1000,
  manual: 3 * 60 * 1000,
  background: Platform.OS === 'ios' ? 25 * 1000 : 5 * 60 * 1000,
}
const isStillWatched = (key: string) => watch$.profiles.peek().some((profile) => profile.key === key)

const checkProfile = async (
  profile: WatchedProfile,
  account: SiteAccount | null,
  source: WatchRunSource,
  deadline: number,
): Promise<WatchPost[]> => {
  const now = Date.now()
  const cookie = account?.cookie || ''
  // Whether an account was there to use, even when the profile was read in the end without it:
  // the feed tells to log in only where that would help.
  const mode = cookie ? 'loggedIn' : siteCookieOrigin[profile.site] ? 'loggedOut' : undefined
  try {
    const result = await fetchers[profile.site](profile.handle, cookie, source, deadline, account)
    // It can be unwatched while the request is out.
    if (!isStillWatched(profile.key)) {
      return []
    }
    // When the answer came, not when it was asked for: the feed may have been looked at between.
    const { posts, fresh } = mergeWatchPosts(getProfilePosts(profile.key), result.posts, {
      now: Date.now(),
      initial: !profile.lastSuccessAt,
      max: watch$.postsPerSource.peek(),
    })
    setProfilePosts(profile.key, posts)
    watch$.updateProfile(profile.key, {
      ...(result.info.name ? { name: result.info.name } : {}),
      ...(result.info.avatar ? { avatar: result.info.avatar } : {}),
      ...(result.info.url ? { url: result.info.url } : {}),
      ...(result.reachBackTo !== undefined ? { reachBackTo: result.reachBackTo ?? undefined } : {}),
      mode,
      accountProfileId: account?.profileId,
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
        accountProfileId: account?.profileId,
        lastCheckedAt: now,
        retryAfter: e instanceof WatchFetchError && e.retry ? now + RETRY_AFTER_MS : undefined,
        error: e?.message || String(e),
      })
    }
    return []
  }
}

const notificationChannel = () => ({ id: NOTIFICATION_CHANNEL_ID, name: t('feed.notificationChannel') })

const notifyFresh = async (profile: WatchedProfile, fresh: WatchPost[]) => {
  const current = watch$.profiles.peek().find((p) => p.key === profile.key) || profile
  const timelineId = getTimeline(current.timelineId)?.id
  // Match the feed's media filter, including posts whose media has yet to be loaded.
  if (isMediaOnly(timelineId)) {
    fresh = fresh.filter((post) => Boolean(post.media?.length) || post.mediaComplete === false)
  }
  if (!fresh.length) return
  const latest = fresh[0]
  try {
    await presentNotification(notificationChannel(), {
      // The site too: the same name can be watched on several.
      title: `${current.name ? `${current.name} (${watchSourceLabel(current)})` : watchSourceLabel(current)} · ${watchSiteLabels[current.site]}`,
      body: fresh.length === 1 ? latest.text || t('feed.newPost') : t('feed.newPosts', { count: fresh.length }),
      // Read new posts in the source's timeline, or the whole feed when it has none.
      url: feedTabUrl(timelineId),
    })
  } catch (e) {
    console.warn('watch notification failed', e)
  }
}

let running: Promise<number> | null = null

/**
 * Checks the watched profiles that are due, the ones checked longest ago first, for as long
 * as the run may take; by hand, only those of `keys` when given. Resolves to how many new
 * posts were found.
 */
export const refreshWatched = (source: WatchRunSource, keys?: string[], force = false): Promise<number> => {
  if (!settings$.feedEnabled.peek()) return Promise.resolve(0)
  if (running) {
    // A run on its own is done by the one going on. One by hand waits for it, and then asks
    // for what that one did not just check.
    if (source !== 'manual') return running
    return running.then(() => refreshWatched(source, keys, force))
  }
  running = runRefresh(source, keys, force).finally(() => {
    running = null
  })
  return running
}

export const isRefreshingWatched = () => Boolean(running)

/** Watches the profile of a page, filling the feed with what it has posted so far, or stops watching it. */
export const toggleWatched = (target: WatchTarget) => {
  const key = watchKey(target)
  if (watch$.profiles.peek().some((profile) => profile.key === key)) {
    watch$.unwatch(key)
    showToast(t('toast.profileUnwatched', { source: watchSourceLabel(target), interpolation: { escapeValue: false } }))
    return
  }
  watch$.watch(target)
  showToast(t('toast.profileWatched', { handle: target.handle, source: watchSourceLabel(target), interpolation: { escapeValue: false } }))
  void refreshWatched('manual', [key])
}

const waitingForVerification = () => watch$.profiles.peek().filter((profile) => profile.error === WATCH_ERROR_NEEDS_VERIFICATION)

// How long the user is given to pass imginn's check.
const VERIFY_TIMEOUT_MS = 3 * 60 * 1000

// The profile to pass imginn's check on: the one it stopped, or one it left unread before Nora was last closed.
const imginnVerifyHandle = () =>
  watch$.imginnMode.peek() === 'off' ? '' : imginnBlocked$.peek() || waitingForVerification()[0]?.handle || ''

// The check being passed: another tap waits for it, not to be shown the page again after.
let verifying: Promise<void> | null = null

/**
 * Shows imginn's page of the profile its check stopped, for the user to pass the check, and then
 * checks again the sources that could not be read without it, which the webview then reads.
 */
export const verifyImginn = () => {
  verifying ??= verifyImginnNow().finally(() => {
    verifying = null
  })
  return verifying
}

const verifyImginnNow = async () => {
  const handle = imginnVerifyHandle()
  if (!handle || !isWatchWebViewAvailable()) return
  try {
    await fetchImginn(handle, VERIFY_TIMEOUT_MS, true)
  } catch (e) {
    if (!(e instanceof Error && e.message === WATCH_WEBVIEW_CANCELLED)) showToast(t('feed.verifyFailed'))
    return
  }
  resumeImginn()
  const waiting = waitingForVerification()
  if (waiting.length) {
    void refreshWatched(
      'manual',
      waiting.map((profile) => profile.key),
      true,
    )
  }
}

/**
 * Tells, once, that imginn's check stopped it, with a toast to pass it from, wherever the user is;
 * but in the feed, which tells it itself. Once imginn reads again, it is told again next time.
 */
const promptVerification = (source: WatchRunSource, blockedBefore: boolean) => {
  if (!imginnVerifyHandle()) {
    ui$.verifyHintDismissed.set(false)
    return
  }
  if (blockedBefore || source === 'background' || ui$.verifyHintDismissed.peek() || AppState.currentState !== 'active') return
  if (isFeedTabUrl(tabs$.currentTab()?.url)) return
  showActionToast(t('feed.verifyToast'), () => void verifyImginn())
}

const runRefresh = async (source: WatchRunSource, keys?: string[], force = false) => {
  const start = Date.now()
  const blockedBefore = Boolean(imginnVerifyHandle())
  const due = dueWatchProfiles(watch$.profiles.peek(), {
    manual: source === 'manual',
    force,
    keys,
    now: start,
    defaultMinutes: watch$.checkIntervalMinutes.peek(),
    timelineMinutes: timelineIntervals(),
  })
  // Each site's account, looked up once a run unless the user changes which to use while it goes on.
  const accounts: Partial<Record<WatchSite, { choice: string | null; account: SiteAccount | null }>> = {}
  let found = 0
  for (const [i, profile] of due.entries()) {
    // The feed can be turned off while a run goes on.
    if (Date.now() - start > RUN_BUDGET_MS[source] || !settings$.feedEnabled.peek()) {
      break
    }
    // Read only in the webview: it waits for Nora to be open, not failing meanwhile.
    if (profile.site === 'tiktok' && !canUseWebView(source)) {
      continue
    }
    if (i > 0) {
      await sleep(REQUEST_GAP_MS + Math.random() * REQUEST_GAP_MS)
    }
    const choice = accountChoice(profile.site)
    if (accounts[profile.site]?.choice !== choice) {
      accounts[profile.site] = { choice, account: await findSignedInCookies(profile.site) }
    }
    const fresh = await checkProfile(profile, accounts[profile.site]?.account || null, source, start + RUN_BUDGET_MS[source])
    found += fresh.length
    if (fresh.length && profileNotifies(profile) && settings$.feedEnabled.peek()) {
      await notifyFresh(profile, fresh)
    }
  }
  promptVerification(source, blockedBefore)
  // The media of what was found, kept for the feed within its own time and storage limits. The
  // background task has to wait for it to be done; in the app the posts are shown without waiting.
  if (!settings$.feedEnabled.peek()) return found
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
  if (!profiles.length || !settings$.feedEnabled.peek()) return null
  const interval = backgroundIntervalMinutes(profiles, watch$.checkIntervalMinutes.peek(), timelineIntervals())
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
  const firstSync = registeredInterval === undefined
  registeredInterval = interval
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(WATCH_TASK)
    // Registering again puts the next run a whole interval away, and stops the one going on: a
    // run the system started in the background loads the app, and with it this, anew.
    if (firstSync && registered && interval !== null) {
      const options = await TaskManager.getTaskOptionsAsync<{ minimumInterval?: number }>(WATCH_TASK)
      if (options?.minimumInterval === interval) return
    }
    if (registered) {
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

const allowWatchNotifications = async () => {
  if (!isNotificationsAvailable) return false
  const granted = await requestNotificationPermission()
  if (granted) await ensureChannel(notificationChannel())
  return granted
}

/** Asks for permission to notify, and turns notifications on for one watched profile if given. */
export const enableWatchNotifications = async (key: string): Promise<boolean> => {
  const granted = await allowWatchNotifications()
  if (granted) watch$.setNotify(key, true)
  return granted
}

/** Asks for permission to notify, and turns notifications on for a timeline, or the whole feed, if given: for its sources that have no choice of their own. */
export const enableTimelineNotifications = async (id?: string): Promise<boolean> => {
  const granted = await allowWatchNotifications()
  if (granted) {
    if (id) watch$.setTimelineNotify(id, true)
    else watch$.feedNotify.set(true)
  }
  return granted
}

if (isAvailable) {
  // Every check changes the list too; the task is only registered again when its interval changes.
  watch$.profiles.onChange(() => void syncBackgroundTask())
  watch$.checkIntervalMinutes.onChange(() => void syncBackgroundTask())
  watch$.timelines.onChange(() => void syncBackgroundTask())
  settings$.mentionNotificationsEnabled.onChange(() => void syncBackgroundTask())
  // While Nora is open the background task does not run on iOS, and on Android only when the
  // system gets to it; a profile whose interval is up is checked from here then.
  let foregroundTimer: ReturnType<typeof setInterval> | undefined
  const syncForegroundTimer = (state: string | null | undefined) => {
    if (state === 'active' && settings$.feedEnabled.peek()) {
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
  settings$.feedEnabled.onChange(() => {
    void syncBackgroundTask()
    syncForegroundTimer(AppState.currentState)
  })
  syncForegroundTimer(AppState.currentState)
  void syncBackgroundTask()
} else if (Platform.OS === 'web') {
  // The desktop app has no background task: while it runs, minimized or not, it checks the
  // profiles that are due. The first run waits for the window, as some are read in its webview.
  let timer: ReturnType<typeof setInterval> | undefined
  let firstRun: ReturnType<typeof setTimeout> | undefined
  const syncTimer = () => {
    if (settings$.feedEnabled.peek() && !timer) {
      firstRun = setTimeout(() => void refreshWatched('foreground'), DESKTOP_FIRST_RUN_DELAY_MS)
      timer = setInterval(() => void refreshWatched('foreground'), FOREGROUND_POLL_MS)
    } else if (!settings$.feedEnabled.peek() && timer) {
      clearTimeout(firstRun)
      clearInterval(timer)
      timer = undefined
    }
  }
  settings$.feedEnabled.onChange(syncTimer)
  syncTimer()
}
