export type WatchSite = 'x' | 'instagram' | 'threads' | 'bluesky' | 'mastodon' | 'reddit' | 'facebook' | 'tiktok'

export const watchSiteLabels: Record<WatchSite, string> = {
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  reddit: 'Reddit',
  facebook: 'Facebook',
  tiktok: 'TikTok',
}

export interface WatchTarget {
  site: WatchSite
  handle: string
}

/** A photo or a video of a post. */
export interface WatchMedia {
  type: 'image' | 'video'
  // The full size photo, or the video file.
  url: string
  // A smaller picture to show for it: a video's cover.
  thumb?: string
  width?: number
  height?: number
  // What the file has to be asked for with: a TikTok video works only with the cookie it was made for.
  headers?: Record<string, string>
}

export interface WatchPost {
  key: string
  id: string
  site: WatchSite
  handle: string
  url: string
  text: string
  // The picture shown for the post in the feed.
  image?: string
  media?: WatchMedia[]
  // The page a post's cover is of, as the card of a link it shares: a tap on the cover opens it.
  link?: string
  // False while only the post's cover is known: Instagram tells the rest on the post's own embed page.
  mediaComplete?: boolean
  createdAtMs: number
  // When Nora first saw it; 0 for the posts a profile already had when it was watched.
  firstSeenAt: number
  repostOf?: string
  quote?: WatchQuote
}

/** The post a post quotes, shown inside it as the site does; its media is not kept on the phone. */
export interface WatchQuote {
  handle: string
  name?: string
  avatar?: string
  url: string
  text: string
  media?: WatchMedia[]
  createdAtMs?: number
}

export interface WatchProfileInfo {
  name?: string
  avatar?: string
  // The profile's page, where the site tells it: a Mastodon account can be on a server its handle does not name.
  url?: string
}

export interface WatchFetchResult {
  info: WatchProfileInfo
  // In the order the site shows them: newest first, but for pinned posts. `repostedAtUnknown` when
  // a repost's time is the post it shares, as a site that knows no other tells it.
  posts: (Omit<WatchPost, 'key' | 'firstSeenAt'> & { repostedAtUnknown?: boolean })[]
  // How far back the next check has to read to have missed nothing (see the profile's reachBackTo),
  // or null when nothing was missed; not told by sites whose every check reads far enough.
  reachBackTo?: number | null
  // The posts pinned to the top of the page, apart from the others, which come newest first.
  pinnedIds?: string[]
}
