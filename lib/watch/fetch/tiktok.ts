import {
  parseTikTokChainToken,
  parseTikTokItemLists,
  TIKTOK_REFERER,
  watchProfileUrl,
  type WatchFetchResult,
} from '@/lib/watch'
import { loadInWatchWebView, TIKTOK_POSTS_MARKER, WATCH_WEBVIEW_PROFILE } from '@/lib/watch-webview'
import NoraViewModule from '@/modules/nora-view'
import { timeLeft, type WatchRunSource } from './common'

/**
 * The profile's page, as loaded by the hidden webview, which asks TikTok for its posts as a
 * browser does: a plain request can't, as the page signs what it asks with. Its videos work only
 * with the cookie the webview has, which they are kept with.
 */
export const fetchTikTok = async (handle: string, _cookie: string, _source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
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
