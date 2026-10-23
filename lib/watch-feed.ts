import { AppState, Platform } from 'react-native'
import { t } from 'i18next'
import { settings$ } from '@/states/settings'
import { getTimeline, isMediaOnly, profileNotifies, timelineIntervals, watch$, type WatchedProfile } from '@/states/watch'
import {
  INSTAGRAM_APP_ID,
  instagramProfileInfoUrl,
  isFacebookErrorPage,
  mergeWatchPosts,
  INSTAGRAM_PAGE_HEADERS,
  backgroundIntervalMinutes,
  blueskyFeedUrl,
  blueskyVideoDids,
  didDocumentUrl,
  parseDidDocumentPds,
  dueWatchProfiles,
  parseFacebookPage,
  reachesBackTo,
  mastodonLookupUrl,
  mastodonStatusesUrl,
  parseBlueskyFeed,
  parseInstagramProfileInfo,
  parseInstagramProfilePage,
  mastodonWebFingerUrl,
  parseMastodonStatuses,
  parseMastodonWebFinger,
  parseRedditCommunityCard,
  parseRedditListing,
  parseRedditPosts,
  parseThreadsProfilePage,
  parseTikTokChainToken,
  parseTikTokItemLists,
  parseXTimeline,
  TIKTOK_REFERER,
  redditCommunityCardUrl,
  redditListingUrl,
  redditPostsUrl,
  splitMastodonHandle,
  watchKey,
  watchProfileUrl,
  watchSiteLabels,
  watchSourceLabel,
  xTimelineUrl,
  type WatchFetchResult,
  type WatchPost,
  type WatchSite,
  type WatchTarget,
} from '@/lib/watch'
import {
  FACEBOOK_POSTS_MARKER,
  THREADS_POSTS_MARKER,
  TIKTOK_POSTS_MARKER,
  WATCH_WEBVIEW_PROFILE,
  WATCH_WEBVIEW_RATE_LIMITED,
  isWatchWebViewAvailable,
  loadInWatchWebView,
} from '@/lib/watch-webview'
import { syncWatchMedia } from '@/lib/watch-media'
import { showToast } from '@/lib/toast'
import { watchFetch } from '@/lib/watch-fetch'
import NoraViewModule from '@/modules/nora-view'
import { accountChoice, findSignedInCookies, parseCookieHeader, siteCookieOrigin, type SiteAccount } from '@/lib/watch-account'
import { getProfilePosts, setProfilePosts } from '@/lib/watch-db'
import { feedTabUrl } from '@/lib/feed-tab'
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
// After the site said to slow down, or that it wants an account.
const RETRY_AFTER_MS = 60 * 60 * 1000
// How often, while Nora is open, it looks for profiles whose interval is up; only those are asked for.
const FOREGROUND_POLL_MS = 5 * 60 * 1000
const DESKTOP_FIRST_RUN_DELAY_MS = 10 * 1000
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
    const res = await watchFetch(xTimelineUrl(handle), {
      signal,
      headers: {
        'user-agent': DESKTOP_USER_AGENT,
        accept: 'text/html',
        'accept-language': 'en-US,en;q=0.9',
        ...(cookie ? { cookie } : {}),
      },
      // Only the cookies of the profile chosen above, never those the app's own requests keep.
      credentials: 'omit',
    })
    checkStatus(res, Boolean(cookie))
    return parseXTimeline(await res.text(), handle)
  })

const fetchInstagramApi = (handle: string, cookie: string, deadline: number): Promise<WatchFetchResult> =>
  withDeadline(deadline, async (signal) => {
    const csrf = parseCookieHeader(cookie).csrftoken
    const res = await watchFetch(instagramProfileInfoUrl(handle), {
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
      credentials: 'omit',
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
    const res = await watchFetch(watchProfileUrl({ site: 'instagram', handle }), {
      signal,
      headers: { 'user-agent': DESKTOP_USER_AGENT, ...INSTAGRAM_PAGE_HEADERS },
      credentials: 'omit',
    })
    checkStatus(res, false)
    return parseInstagramProfilePage(await res.text(), handle)
  })

// The hidden webview needs the app's UI, so a background run goes without it.
// The desktop's webview reads a page with its window minimized too.
const canUseWebView = (source: WatchRunSource) =>
  source !== 'background' && (Platform.OS === 'web' || AppState.currentState === 'active') && isWatchWebViewAvailable()

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

/** A page or an API's answer from a site that is read without an account, as text. */
const fetchText = (url: string, headers: Record<string, string>, deadline: number): Promise<string> =>
  withDeadline(deadline, async (signal) => {
    const res = await watchFetch(url, { signal, headers: { 'user-agent': DESKTOP_USER_AGENT, ...headers }, credentials: 'omit' })
    // An account would not help: a 401 or 403 is a failure like any other.
    checkStatus(res, true)
    return res.text()
  })

const fetchJson = async (url: string, deadline: number): Promise<any> => {
  const text = await fetchText(url, { accept: 'application/json' }, deadline)
  try {
    return JSON.parse(text)
  } catch {
    throw new WatchFetchError('not JSON')
  }
}

/** The profile's page, as for Instagram: by a plain request, or else as loaded by the hidden webview. */
const fetchThreads = async (handle: string, _cookie: string, source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
  const url = watchProfileUrl({ site: 'threads', handle })
  try {
    return parseThreadsProfilePage(await fetchText(url, INSTAGRAM_PAGE_HEADERS, deadline), handle)
  } catch (e) {
    if (isRateLimited(e) || !canUseWebView(source) || !timeLeft(deadline)) throw e
    console.warn('watch threads page failed, trying the webview', handle, e)
  }
  return parseThreadsProfilePage(await loadInWatchWebView(url, timeLeft(deadline), { marker: THREADS_POSTS_MARKER }), handle)
}

// The server each Bluesky account with a video is on, where its videos are kept.
const blueskyServers = new Map<string, string>()

const fetchBluesky = async (handle: string, _cookie: string, _source: WatchRunSource, deadline: number) => {
  const json = await fetchJson(blueskyFeedUrl(handle), deadline)
  for (const did of blueskyVideoDids(json)) {
    const url = didDocumentUrl(did)
    if (blueskyServers.has(did) || !url || !timeLeft(deadline)) continue
    try {
      const pds = parseDidDocumentPds(await fetchJson(url, deadline))
      if (pds) blueskyServers.set(did, pds)
    } catch (e) {
      // Bluesky's own server is asked instead, which has the videos of the accounts it hosts.
      if (isRateLimited(e)) break
      console.warn('watch bluesky server lookup failed', did, e)
    }
  }
  return parseBlueskyFeed(json, handle, (did) => blueskyServers.get(did))
}

// The server each handle was found on, when that is not its domain.
const mastodonServers = new Map<string, string>()

const lookUpMastodon = async (handle: string, server: string, deadline: number) => {
  const account = await fetchJson(mastodonLookupUrl(handle, server), deadline)
  if (!account?.id) throw new WatchFetchError(account?.error || 'no account')
  return account
}

// Asked of the profile's own server; one that only answers with an account fails.
const fetchMastodon = async (handle: string, _cookie: string, _source: WatchRunSource, deadline: number) => {
  let server = mastodonServers.get(handle) || splitMastodonHandle(handle).host
  let account: any
  try {
    account = await lookUpMastodon(handle, server, deadline)
  } catch (e) {
    if (isRateLimited(e) || mastodonServers.has(handle)) throw e
    // The handle's domain may not be the server the account is on.
    server = parseMastodonWebFinger(await fetchJson(mastodonWebFingerUrl(handle), deadline))
    if (server === splitMastodonHandle(handle).host) throw e
    account = await lookUpMastodon(handle, server, deadline)
    mastodonServers.set(handle, server)
  }
  return parseMastodonStatuses(account, await fetchJson(mastodonStatusesUrl(server, account.id), deadline), handle, server)
}

const fetchRedditListing = (handle: string, cookie: string, deadline: number): Promise<WatchFetchResult> =>
  withDeadline(deadline, async (signal) => {
    const res = await watchFetch(redditListingUrl(handle), {
      signal,
      headers: { 'user-agent': DESKTOP_USER_AGENT, accept: 'application/json', cookie },
      credentials: 'omit',
    })
    checkStatus(res, true)
    let json: any
    try {
      json = await res.json()
    } catch (e) {
      if (signal.aborted) throw e
      throw new WatchFetchError('not JSON')
    }
    return parseRedditListing(json, handle)
  })

const hasAvatar = (site: WatchSite, handle: string) =>
  watch$.profiles.peek().some((profile) => profile.site === site && profile.handle === handle && profile.avatar)

/**
 * With an account, Reddit's data for the subreddit or user; without one, or when that fails, the
 * posts as Reddit's own page loads them. A subreddit's picture is not among those, and is read
 * from its card, once.
 */
const fetchReddit = async (handle: string, cookie: string, _source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
  if (cookie) {
    try {
      return await fetchRedditListing(handle, cookie, deadline)
    } catch (e) {
      console.warn('watch reddit listing failed', handle, e)
    }
  }
  const result = parseRedditPosts(await fetchText(redditPostsUrl(handle), { accept: 'text/html' }, deadline), handle)
  if (result.info.avatar || !handle.startsWith('r/') || hasAvatar('reddit', handle) || !timeLeft(deadline)) return result
  try {
    await sleep(REQUEST_GAP_MS)
    return { ...result, info: { ...result.info, avatar: parseRedditCommunityCard(await fetchText(redditCommunityCardUrl(handle), { accept: 'text/html' }, deadline)) } }
  } catch (e) {
    console.warn('watch reddit community card failed', handle, e)
    return result
  }
}

// How many of the parts a Facebook page brings its posts in to wait for, scrolled in the webview
// before the first check, when there is no post kept to read back to.
const FACEBOOK_WEBVIEW_PARTS = 20

// Until when the webview is not used for Facebook, after it was told to slow down there.
let facebookWebViewPausedUntil = 0

/**
 * The page, profile or group's own page, by a plain request: it comes with its newest post or
 * two. With an account, when those do not reach back to the newest post kept, or to where an
 * earlier check could not read back to, posts may have been missed, and the page is loaded in the
 * hidden webview with the cookies of the Nora profile the account is from, and scrolled back to
 * there, or for more before the first check, while Nora is open. What a check could not read back
 * to as it could not scroll is read back to by a later one; what one scroll does not reach back to
 * is given up, as every scroll starts from the newest post again. Without an account Facebook
 * shows no more than a few posts before it asks to log in, and soon stops answering the page at
 * all, so it is not scrolled. Most profiles and all groups show their posts only to an account.
 */
const fetchFacebook = async (
  handle: string,
  cookie: string,
  source: WatchRunSource,
  deadline: number,
  account: SiteAccount | null,
): Promise<WatchFetchResult> => {
  // A group shows the posts it thinks most relevant first, unless asked for the newest.
  const url = watchProfileUrl({ site: 'facebook', handle }) + (handle.startsWith('groups/') ? '?sorting_setting=CHRONOLOGICAL' : '')
  const key = watchKey({ site: 'facebook', handle })
  const kept = getProfilePosts(key)
  const newestKept = kept.reduce<number | undefined>((newest, post) => Math.max(newest ?? 0, post.createdAtMs), undefined)
  const target = watch$.profiles.peek().find((profile) => profile.key === key)?.reachBackTo ?? newestKept
  const reaches = (read: WatchFetchResult) => reachesBackTo(read.posts, target, read.pinnedIds)
  // Scrolling the page in the webview, for more than the plain request brings.
  const canScroll = () =>
    Boolean(cookie && account) && canUseWebView(source) && Date.now() >= facebookWebViewPausedUntil && Boolean(timeLeft(deadline))
  let result: WatchFetchResult | undefined
  try {
    const html = await withDeadline(deadline, async (signal) => {
      const res = await watchFetch(url, {
        signal,
        headers: { 'user-agent': DESKTOP_USER_AGENT, ...INSTAGRAM_PAGE_HEADERS, ...(cookie ? { cookie } : {}) },
        credentials: 'omit',
      })
      checkStatus(res, Boolean(cookie))
      return res.text()
    })
    if (isFacebookErrorPage(html)) {
      throw new WatchFetchError(cookie ? 'not found' : WATCH_ERROR_NEEDS_LOGIN, !cookie)
    }
    result = parseFacebookPage(html, handle)
  } catch (e) {
    if (isRateLimited(e) || !canScroll()) throw e
    console.warn('watch facebook page failed, trying the webview', handle, e)
  }
  if (result && (reaches(result) || !canScroll())) {
    // Nothing to read back to before the first check.
    return { ...result, reachBackTo: target === undefined || reaches(result) ? null : target }
  }
  try {
    // Scrolling takes longer than any one request is given: the webview keeps to its own limit.
    const html = await loadInWatchWebView(url, Math.max(0, deadline - Date.now()), {
      marker: FACEBOOK_POSTS_MARKER,
      more: FACEBOOK_WEBVIEW_PARTS,
      until: target === undefined ? undefined : Math.floor(target / 1000),
      profile: account?.profileId,
    })
    const more = parseFacebookPage(html, handle)
    // The webview sends only the data of the posts, not that of the page's header.
    return {
      info: { name: result?.info.name || more.info.name, avatar: result?.info.avatar || more.info.avatar },
      posts: more.posts,
      pinnedIds: more.pinnedIds,
      reachBackTo: null,
    }
  } catch (e) {
    if (e instanceof Error && e.message === WATCH_WEBVIEW_RATE_LIMITED) {
      facebookWebViewPausedUntil = Date.now() + RETRY_AFTER_MS
      if (!result) throw new WatchFetchError(WATCH_ERROR_RATE_LIMITED, true)
    }
    if (result) {
      console.warn('watch facebook webview failed', handle, e)
      return { ...result, reachBackTo: target ?? null }
    }
    throw e
  }
}

/**
 * The profile's page, as loaded by the hidden webview, which asks TikTok for its posts as a
 * browser does: a plain request can't, as the page signs what it asks with. Its videos work only
 * with the cookie the webview has, which they are kept with.
 */
const fetchTikTok = async (handle: string, _cookie: string, _source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
  const html = await loadInWatchWebView(watchProfileUrl({ site: 'tiktok', handle }), timeLeft(deadline), {
    marker: TIKTOK_POSTS_MARKER,
    // Its posts come after the page, in an answer the script waits for.
    more: 1,
  })
  let chainToken: string | undefined
  try {
    chainToken = parseTikTokChainToken(await NoraViewModule.getCookies(TIKTOK_REFERER, WATCH_WEBVIEW_PROFILE))
  } catch (e) {
    console.warn('watch tiktok getCookies failed', e)
  }
  return parseTikTokItemLists(html, handle, chainToken)
}

const fetchers: Record<
  WatchSite,
  (
    handle: string,
    cookie: string,
    source: WatchRunSource,
    deadline: number,
    account: SiteAccount | null,
  ) => Promise<WatchFetchResult>
> = {
  x: fetchX,
  instagram: fetchInstagram,
  threads: fetchThreads,
  bluesky: fetchBluesky,
  mastodon: fetchMastodon,
  reddit: fetchReddit,
  facebook: fetchFacebook,
  tiktok: fetchTikTok,
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
export const refreshWatched = (source: WatchRunSource, keys?: string[]): Promise<number> => {
  if (!settings$.feedEnabled.peek()) return Promise.resolve(0)
  if (running) {
    // A run on its own is done by the one going on. One by hand waits for it, and then asks
    // for what that one did not just check.
    if (source !== 'manual') return running
    return running.then(() => refreshWatched(source, keys))
  }
  running = runRefresh(source, keys).finally(() => {
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

const runRefresh = async (source: WatchRunSource, keys?: string[]) => {
  const start = Date.now()
  const due = dueWatchProfiles(watch$.profiles.peek(), {
    manual: source === 'manual',
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
