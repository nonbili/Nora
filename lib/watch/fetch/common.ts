import { AppState, Platform } from 'react-native'
import { watchFetch } from '@/lib/watch-fetch'
import { isWatchWebViewAvailable } from '@/lib/watch-webview'

export type WatchRunSource = 'foreground' | 'manual' | 'background'

export const WATCH_ERROR_NEEDS_LOGIN = 'needsLogin'
export const WATCH_ERROR_RATE_LIMITED = 'rateLimited'
// Imginn's page was still at Cloudflare's check for a browser, for the user to pass.
export const WATCH_ERROR_NEEDS_VERIFICATION = 'needsVerification'

// After the site said to slow down, or that it wants an account.
export const RETRY_AFTER_MS = 60 * 60 * 1000

// Between two requests, so a long list does not arrive at a site as a burst.
export const REQUEST_GAP_MS = 1500

export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class WatchFetchError extends Error {
  constructor(
    message: string,
    readonly retry = false,
  ) {
    super(message)
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const checkStatus = (res: Response, signedIn: boolean) => {
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
export const REQUEST_TIMEOUT_MS = 30 * 1000

export const timeLeft = (deadline: number) => Math.max(0, Math.min(deadline - Date.now(), REQUEST_TIMEOUT_MS))

/** Runs a request, reading its answer included, with a signal that cancels it when its time is up. */
export const withDeadline = async <T>(deadline: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeLeft(deadline))
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

// The hidden webview needs the app's UI, so a background run goes without it.
// The desktop's webview reads a page with its window minimized too.
export const canUseWebView = (source: WatchRunSource) =>
  source !== 'background' && (Platform.OS === 'web' || AppState.currentState === 'active') && isWatchWebViewAvailable()

export const isRateLimited = (e: unknown) => e instanceof WatchFetchError && e.message === WATCH_ERROR_RATE_LIMITED

export const isNeedsVerification = (e: unknown) => e instanceof WatchFetchError && e.message === WATCH_ERROR_NEEDS_VERIFICATION

/** A page or an API's answer from a site that is read without an account, as text. */
export const fetchText = (url: string, headers: Record<string, string>, deadline: number): Promise<string> =>
  withDeadline(deadline, async (signal) => {
    const res = await watchFetch(url, { signal, headers: { 'user-agent': DESKTOP_USER_AGENT, ...headers }, credentials: 'omit' })
    // An account would not help: a 401 or 403 is a failure like any other.
    checkStatus(res, true)
    return res.text()
  })

export const fetchJson = async (url: string, deadline: number): Promise<any> => {
  const text = await fetchText(url, { accept: 'application/json' }, deadline)
  try {
    return JSON.parse(text)
  } catch {
    throw new WatchFetchError('not JSON')
  }
}
