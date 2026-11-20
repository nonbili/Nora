import { observable } from '@legendapp/state'
import {
  imginnProfileUrl,
  INSTAGRAM_PAGE_HEADERS,
  INSTAGRAM_APP_ID,
  instagramEmbedUrl,
  instagramProfileInfoUrl,
  parseImginnProfilePage,
  parseInstagramEmbedWithProduct,
  parseInstagramProfileInfo,
  parseInstagramProfilePage,
  watchProfileUrl,
  type WatchFetchResult,
} from '@/lib/watch'
import { parseCookieHeader } from '@/lib/watch-account'
import { watchFetch } from '@/lib/watch-fetch'
import { IMGINN_PAGE_SELECTOR, loadInWatchWebView, WATCH_WEBVIEW_CHALLENGE } from '@/lib/watch-webview'
import { watch$ } from '@/states/watch'
import {
  canUseWebView,
  checkStatus,
  DESKTOP_USER_AGENT,
  isNeedsVerification,
  isRateLimited,
  RETRY_AFTER_MS,
  sleep,
  timeLeft,
  WATCH_ERROR_NEEDS_VERIFICATION,
  WatchFetchError,
  withDeadline,
  type WatchRunSource,
} from './common'
import { getProfilePosts } from '@/lib/watch-db'

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

/**
 * With an account, Instagram's own API for the profile. Without one, or when that fails, the
 * profile's page; and when a plain request for that is not answered with its posts, the page
 * as loaded by a real browser, in a webview out of sight.
 */
const fetchFromInstagram = async (
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

/**
 * The profile's page on imginn, in the webview, as a plain request is stopped by Cloudflare's
 * check for a browser. The check often passes by itself there; when it does not, it is for the
 * user to pass, shown the page `visible`.
 */
export const fetchImginn = async (handle: string, timeoutMs: number, visible = false): Promise<WatchFetchResult> => {
  try {
    const html = await loadInWatchWebView(imginnProfileUrl(handle), timeoutMs, {
      selector: IMGINN_PAGE_SELECTOR,
      visible,
      ownUserAgent: true,
    })
    return parseImginnProfilePage(html, handle)
  } catch (e) {
    if (e instanceof Error && e.message === WATCH_WEBVIEW_CHALLENGE) throw new WatchFetchError(WATCH_ERROR_NEEDS_VERIFICATION, true)
    throw e
  }
}

// The handle imginn's check last stopped, for the user to pass the check on; empty while none did.
export const imginnBlocked$ = observable('')
// Until when imginn is not asked after its check stopped it, as each page waits for the check a while.
let imginnPausedUntil = 0

/** After the user passed imginn's check: it is asked again right away. */
export const resumeImginn = () => {
  imginnBlocked$.set('')
  imginnPausedUntil = 0
}

watch$.imginnMode.onChange(({ value }) => {
  if (value === 'off') imginnBlocked$.set('')
})

const canUseImginn = (source: WatchRunSource, deadline: number) =>
  watch$.imginnMode.peek() !== 'off' && canUseWebView(source) && Date.now() >= imginnPausedUntil && Boolean(timeLeft(deadline))

const EMBED_CHECK_GAP_MS = 200
const EMBED_CHECK_TIMEOUT_MS = 8000

/**
 * Imginn's profile page tells neither whether a post is a reel nor the rest of its media. When
 * reels are skipped, any post not already classified in the database is checked on its embed page
 * before the fetch returns, so reels get their `/reel/` address and never enter the feed or
 * trigger notifications.
 */
const classifyImginnPosts = async (
  handle: string,
  result: WatchFetchResult,
  deadline: number,
): Promise<WatchFetchResult> => {
  if (watch$.instagramIncludeReels.peek()) return result
  const profileKey = `instagram:${handle.toLowerCase()}`
  const existingById = new Map(getProfilePosts(profileKey).map((post) => [post.id, post]))
  const posts: WatchFetchResult['posts'] = []
  let checked = 0
  for (const post of result.posts) {
    const known = existingById.get(post.id)
    if (known?.url.startsWith('https://www.instagram.com/reel/')) {
      posts.push({ ...post, url: known.url, ...(known.mediaComplete ? { media: known.media, mediaComplete: true } : {}) })
      continue
    }
    if (known?.mediaComplete) {
      const isKnownReel = known.media?.length === 1 && known.media[0].type === 'video'
      posts.push({
        ...post,
        url: isKnownReel ? `https://www.instagram.com/reel/${post.id}/` : post.url,
        media: known.media,
        mediaComplete: true,
      })
      continue
    }
    if (!timeLeft(deadline)) {
      throw new WatchFetchError('could not classify imginn posts')
    }
    if (checked > 0) await sleep(EMBED_CHECK_GAP_MS)
    checked += 1
    try {
      const embedDeadline = Math.min(deadline, Date.now() + EMBED_CHECK_TIMEOUT_MS)
      const embed = await withDeadline(embedDeadline, async (signal) => {
        const res = await watchFetch(instagramEmbedUrl(post.id), {
          signal,
          headers: {
            'user-agent': DESKTOP_USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            'sec-fetch-dest': 'iframe',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'cross-site',
          },
          credentials: 'omit',
        })
        if (!res.ok) throw new Error(`embed HTTP ${res.status}`)
        return parseInstagramEmbedWithProduct(await res.text())
      })
      posts.push({
        ...post,
        url: embed.isReel ? `https://www.instagram.com/reel/${post.id}/` : post.url,
        media: embed.media,
        mediaComplete: true,
      })
    } catch {
      throw new WatchFetchError('could not classify imginn posts')
    }
  }
  return { ...result, posts }
}

const readImginn = async (handle: string, deadline: number) => {
  try {
    const result = await fetchImginn(handle, timeLeft(deadline))
    imginnBlocked$.set('')
    return await classifyImginnPosts(handle, result, deadline)
  } catch (e) {
    if (isNeedsVerification(e)) {
      imginnBlocked$.set(handle)
      imginnPausedUntil = Date.now() + RETRY_AFTER_MS
    }
    console.warn('watch imginn failed', handle, e)
    throw e
  }
}

/**
 * As the user chose: as Instagram shows the profile, and as imginn does when Instagram does not;
 * or as imginn does first, and as Instagram does when imginn can't, as in the background.
 */
export const fetchInstagram = async (
  handle: string,
  cookie: string,
  source: WatchRunSource,
  deadline: number,
): Promise<WatchFetchResult> => {
  const mode = watch$.imginnMode.peek()
  if (mode === 'first' && canUseImginn(source, deadline)) {
    try {
      return await readImginn(handle, deadline)
    } catch {}
  }
  try {
    return await fetchFromInstagram(handle, cookie, source, deadline)
  } catch (e) {
    if (mode === 'fallback' && canUseImginn(source, deadline)) {
      console.warn('watch instagram failed, trying imginn', handle, e)
      try {
        return await readImginn(handle, deadline)
      } catch {}
    }
    // What Instagram said, unless what is left to do is to pass imginn's check.
    throw mode !== 'off' && imginnBlocked$.peek() ? new WatchFetchError(WATCH_ERROR_NEEDS_VERIFICATION, true) : e
  }
}
