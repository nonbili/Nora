/** The feed of watched profiles is shown in a tab of its own, at this address. */
export const FEED_TAB_URL = 'nora://feed'

export const isFeedTabUrl = (url: string | null | undefined) =>
  !!url && (url === FEED_TAB_URL || url.startsWith(`${FEED_TAB_URL}?`))

/** What the header's reload and scroll to top do in a feed tab, which has no webview to do them. */
export interface FeedTabActions {
  refresh: () => void
  scrollToTop: () => void
}

export const feedTabActions = new Map<string, FeedTabActions>()
