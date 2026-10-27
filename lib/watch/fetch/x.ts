import {
  nitterProfileUrl,
  nitterRssUrl,
  parseNitterProfilePage,
  parseNitterRss,
  parseXTimeline,
  xTimelineUrl,
  type WatchFetchResult,
} from '@/lib/watch'
import { watchFetch } from '@/lib/watch-fetch'
import { loadInWatchWebView, NITTER_PAGE_SELECTOR } from '@/lib/watch-webview'
import { watch$ } from '@/states/watch'
import { canUseWebView, checkStatus, DESKTOP_USER_AGENT, timeLeft, WatchFetchError, withDeadline, type WatchRunSource } from './common'

const fetchFromX = (handle: string, cookie: string, deadline: number): Promise<WatchFetchResult> =>
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

// As a feed reader asks: many instances check what says it is a browser, as Anubis does, but let others by.
const NITTER_USER_AGENT = 'RSS reader'

// An instance that failed is not asked again for a while, so a run does not wait on it for every profile:
// by plain requests, or with the webview too, which can read one that failed without it.
const NITTER_PAUSE_MS = 10 * 60 * 1000
const nitterPausedUntil = new Map<string, number>()
const pauseKey = (instance: string, webview: boolean) => `${webview ? 'webview' : 'plain'} ${instance}`

const fetchNitter = (url: string, accept: string, deadline: number): Promise<string> =>
  withDeadline(deadline, async (signal) => {
    const res = await watchFetch(url, { signal, headers: { 'user-agent': NITTER_USER_AGENT, accept }, credentials: 'omit' })
    // An account would not help: a 401 or 403 is a failure like any other.
    checkStatus(res, true)
    return res.text()
  })

type NitterWay = 'rss' | 'page' | 'webview'

/**
 * The ways an instance is read: its RSS, which not every instance serves; its profile page; and that
 * page in the webview, as a browser that passes the instance's check for one, while Nora is open.
 */
const nitterWays: Record<NitterWay, (instance: string, handle: string, source: WatchRunSource, deadline: number) => Promise<WatchFetchResult> | null> = {
  rss: async (instance, handle, _source, deadline) =>
    parseNitterRss(await fetchNitter(nitterRssUrl(instance, handle), 'application/rss+xml, application/xml;q=0.9, */*;q=0.8', deadline), handle, instance),
  page: async (instance, handle, _source, deadline) =>
    parseNitterProfilePage(await fetchNitter(nitterProfileUrl(instance, handle), 'text/html', deadline), handle, instance),
  webview: (instance, handle, source, deadline) =>
    canUseWebView(source)
      ? loadInWatchWebView(nitterProfileUrl(instance, handle), timeLeft(deadline), { selector: NITTER_PAGE_SELECTOR, ownUserAgent: true }).then(
          (html) => parseNitterProfilePage(html, handle, instance),
        )
      : null,
}

const NITTER_WAYS: NitterWay[] = ['rss', 'page', 'webview']

// The way each instance was last read, tried first: an instance without RSS is not asked for it each time.
const nitterWay = new Map<string, NitterWay>()

// What says the profile is not there, or that the instance's own request to X failed for it: not the
// instance's failure. Told by its page: an instance without RSS answers a request for it as not there.
const isNitterMiss = (way: NitterWay, e: unknown) =>
  way !== 'rss' &&
  ((e instanceof WatchFetchError && e.message === 'HTTP 404') || (e instanceof Error && e.message === 'no posts on the instance'))

const readNitterInstance = async (instance: string, handle: string, source: WatchRunSource, deadline: number) => {
  const first = nitterWay.get(instance) || 'rss'
  let error: unknown
  let missed = false
  for (const way of [first, ...NITTER_WAYS.filter((other) => other !== first)]) {
    if (!timeLeft(deadline)) break
    const read = nitterWays[way](instance, handle, source, deadline)
    if (!read) continue
    try {
      const result = await read
      nitterWay.set(instance, way)
      return result
    } catch (e) {
      console.warn('watch nitter failed', instance, way, handle, e)
      missed ||= isNitterMiss(way, e)
      error = e
    }
  }
  if (!missed) {
    // Failed with every way, the plain ones too; or with those only, which leaves the webview to try.
    const until = Date.now() + NITTER_PAUSE_MS
    nitterPausedUntil.set(pauseKey(instance, false), until)
    if (canUseWebView(source)) nitterPausedUntil.set(pauseKey(instance, true), until)
  }
  throw error ?? new WatchFetchError('no way to read Nitter')
}

/** The profile's posts from the first of the user's Nitter instances that has them. */
const fetchFromNitter = async (handle: string, source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
  let error: unknown = new WatchFetchError('no Nitter instance')
  const webview = canUseWebView(source)
  for (const instance of watch$.nitterInstances.peek()) {
    if (!timeLeft(deadline)) break
    if ((nitterPausedUntil.get(pauseKey(instance, webview)) || 0) > Date.now()) continue
    try {
      const result = await readNitterInstance(instance, handle, source, deadline)
      nitterPausedUntil.delete(pauseKey(instance, false))
      nitterPausedUntil.delete(pauseKey(instance, true))
      return result
    } catch (e) {
      error = e
    }
  }
  throw error
}

watch$.nitterInstances.onChange(() => {
  nitterPausedUntil.clear()
  nitterWay.clear()
})

/**
 * As the user chose: as X's embedded timeline shows the profile, and as a Nitter instance does
 * when X does not; or as an instance does first, and as X does when none can.
 */
export const fetchX = async (handle: string, cookie: string, source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
  const mode = watch$.nitterInstances.peek().length ? watch$.nitterMode.peek() : 'off'
  if (mode === 'first') {
    try {
      return await fetchFromNitter(handle, source, deadline)
    } catch {}
  }
  try {
    return await fetchFromX(handle, cookie, deadline)
  } catch (e) {
    if (mode === 'fallback' && timeLeft(deadline)) {
      console.warn('watch x failed, trying nitter', handle, e)
      try {
        return await fetchFromNitter(handle, source, deadline)
      } catch {}
    }
    throw e
  }
}
