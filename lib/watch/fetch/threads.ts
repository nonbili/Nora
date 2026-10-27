import { INSTAGRAM_PAGE_HEADERS, parseThreadsProfilePage, watchProfileUrl, type WatchFetchResult } from '@/lib/watch'
import { loadInWatchWebView, THREADS_POSTS_MARKER } from '@/lib/watch-webview'
import { canUseWebView, fetchText, isRateLimited, timeLeft, type WatchRunSource } from './common'

/** The profile's page, as for Instagram: by a plain request, or else as loaded by the hidden webview. */
export const fetchThreads = async (handle: string, _cookie: string, source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
  const url = watchProfileUrl({ site: 'threads', handle })
  try {
    return parseThreadsProfilePage(await fetchText(url, INSTAGRAM_PAGE_HEADERS, deadline), handle)
  } catch (e) {
    if (isRateLimited(e) || !canUseWebView(source) || !timeLeft(deadline)) throw e
    console.warn('watch threads page failed, trying the webview', handle, e)
  }
  return parseThreadsProfilePage(await loadInWatchWebView(url, timeLeft(deadline), { marker: THREADS_POSTS_MARKER }), handle)
}
