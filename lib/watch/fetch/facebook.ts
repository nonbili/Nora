import {
  isFacebookErrorPage,
  INSTAGRAM_PAGE_HEADERS,
  parseFacebookPage,
  reachesBackTo,
  watchKey,
  watchProfileUrl,
  type WatchFetchResult,
} from '@/lib/watch'
import type { SiteAccount } from '@/lib/watch-account'
import { getProfilePosts } from '@/lib/watch-db'
import { watchFetch } from '@/lib/watch-fetch'
import { FACEBOOK_POSTS_MARKER, loadInWatchWebView, WATCH_WEBVIEW_RATE_LIMITED } from '@/lib/watch-webview'
import { watch$ } from '@/states/watch'
import {
  canUseWebView,
  checkStatus,
  DESKTOP_USER_AGENT,
  isRateLimited,
  RETRY_AFTER_MS,
  timeLeft,
  WATCH_ERROR_NEEDS_LOGIN,
  WATCH_ERROR_RATE_LIMITED,
  WatchFetchError,
  withDeadline,
  type WatchRunSource,
} from './common'

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
export const fetchFacebook = async (
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
