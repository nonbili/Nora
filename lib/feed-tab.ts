/** The feed of watched profiles is shown in a tab of its own, at this address. */
export const FEED_TAB_URL = 'nora://feed'

export const isFeedTabUrl = (url: string | null | undefined) =>
  !!url && (url === FEED_TAB_URL || url.startsWith(`${FEED_TAB_URL}?`))

/** The address of a feed tab showing a timeline; the whole feed when there is none. */
export const feedTabUrl = (timelineId?: string) =>
  timelineId ? `${FEED_TAB_URL}?timeline=${encodeURIComponent(timelineId)}` : FEED_TAB_URL

/** The timeline a feed tab shows; undefined for the whole feed. */
export const getFeedTimelineId = (url: string | null | undefined): string | undefined => {
  if (!isFeedTabUrl(url)) return undefined
  const query = url!.slice(FEED_TAB_URL.length + 1)
  return new URLSearchParams(query).get('timeline') || undefined
}

/** What the header's reload and scroll to top do in a feed tab, which has no webview to do them. */
export interface FeedTabActions {
  refresh: () => void
  scrollToTop: () => void
}

export const feedTabActions = new Map<string, FeedTabActions>()
