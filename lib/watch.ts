/**
 * Watching a profile on X, Instagram, Threads, Bluesky, Mastodon or TikTok, a subreddit or user
 * on Reddit, or a page, profile or group on Facebook: which page is one, and reading its latest posts.
 */

import { getProfileUsername, isInstagramHost } from './instagram'

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
}

export interface WatchProfileInfo {
  name?: string
  avatar?: string
  // The profile's page, where the site tells it: a Mastodon account can be on a server its handle does not name.
  url?: string
}

export interface WatchFetchResult {
  info: WatchProfileInfo
  posts: Omit<WatchPost, 'key' | 'firstSeenAt'>[]
  // How far back the next check has to read to have missed nothing (see the profile's reachBackTo),
  // or null when nothing was missed; not told by sites whose every check reads far enough.
  reachBackTo?: number | null
  // The posts pinned to the top of the page, apart from the others, which come newest first.
  pinnedIds?: string[]
}

const isXHost = (host: string) => /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/.test(host)

// Paths on x.com that are a page of their own and not somebody's profile.
const xReservedPaths = new Set([
  'compose', 'explore', 'hashtag', 'home', 'i', 'intent', 'jobs', 'login', 'logout', 'messages', 'notifications',
  'privacy', 'search', 'settings', 'share', 'signup', 'tos',
])

const X_PROFILE_PATH = /^\/([A-Za-z0-9_]{1,15})(?:\/(?:media|with_replies))?\/?$/

const isThreadsHost = (host: string) => /^(?:www\.)?threads\.(?:com|net)$/.test(host)

const THREADS_PROFILE_PATH = /^\/@([A-Za-z0-9._]{1,30})(?:\/(?:replies|media|reposts))?\/?$/

const BLUESKY_PROFILE_PATH = /^\/profile\/((?:did:[a-z]+:[A-Za-z0-9._:%-]+)|(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+))\/?$/

const isRedditHost = (host: string) => /^(?:(?:www|old|new|m|np|sh)\.)?reddit\.com$/.test(host)

const SUBREDDIT_PATH = /^\/r\/([A-Za-z0-9_]{2,21})(?:\/(?:hot|new|top|rising))?\/?$/

const REDDIT_USER_PATH = /^\/(?:u|user)\/([A-Za-z0-9_-]{3,20})(?:\/(?:overview|submitted|posts))?\/?$/

const isFacebookHost = (host: string) => /^(?:(?:www|m|web|mbasic|touch|mobile)\.)?facebook\.com$/.test(host)

// Paths on facebook.com that are a page of their own and not a page or profile, besides those of a .php file.
const facebookReservedPaths = new Set([
  'about', 'ads', 'bookmarks', 'business', 'campaign', 'checkpoint', 'composer', 'dialog', 'events', 'feeds',
  'find-friends', 'friends', 'fundraisers', 'games', 'gaming', 'groups', 'hashtag', 'help', 'jobs', 'latest', 'legal',
  'lite', 'live', 'login', 'logout', 'marketplace', 'me', 'memories', 'menu', 'messages', 'mobile', 'news',
  'notifications', 'offers', 'onthisday', 'pages', 'people', 'pg', 'photo', 'photos', 'places', 'plugins', 'policies',
  'privacy', 'recover', 'reel', 'reels', 'reg', 'saved', 'search', 'settings', 'share', 'sharer', 'stories', 'video',
  'videos', 'watch',
])

const isFacebookName = (name: string) => !facebookReservedPaths.has(name.toLowerCase()) && !/\.php$/i.test(name)

// A page or profile by its name, or a profile without one by its number, and its tabs.
const FACEBOOK_NAME_PATH = /^\/([A-Za-z0-9.]{1,50})(?:\/(?:posts|videos|photos|reels|about|featured))?\/?$/

const FACEBOOK_PEOPLE_PATH = /^\/people\/[^/]+\/(\d+)\/?$/

const FACEBOOK_GROUP_PATH = /^\/groups\/([A-Za-z0-9.]+)(?:\/(?:about|media|files|events|members))?\/?$/

const isTikTokHost = (host: string) => /^(?:(?:www|m)\.)?tiktok\.com$/.test(host)

const TIKTOK_PROFILE_PATH = /^\/@([A-Za-z0-9_.]{2,24})\/?$/

// A profile on a Mastodon server, local or as seen from another server: /@user or /@user@host.
const MASTODON_PROFILE_PATH = /^\/@([A-Za-z0-9_]{1,30})(?:@([a-z0-9-]+(?:\.[a-z0-9-]+)+))?\/?$/

// Sites with profiles at /@name too, which are not Mastodon servers.
const notMastodonHost = /(?:^|\.)(?:youtube|tiktok|medium|substack|figma|replit|vimeo|pinterest|bsky)\.(?:com|app)$/

/** The profile a page is of, when it is one that can be watched; null for any other page. */
export function getWatchTarget(url: string | null | undefined): WatchTarget | null {
  if (!url) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const { hostname, pathname } = parsed
  if (isXHost(hostname)) {
    const match = pathname.match(X_PROFILE_PATH)
    return match && !xReservedPaths.has(match[1].toLowerCase()) ? { site: 'x', handle: match[1] } : null
  }
  if (isInstagramHost(hostname)) {
    const handle = getProfileUsername(hostname, pathname)
    return handle ? { site: 'instagram', handle } : null
  }
  if (isThreadsHost(hostname)) {
    const match = pathname.match(THREADS_PROFILE_PATH)
    return match ? { site: 'threads', handle: match[1] } : null
  }
  if (hostname === 'bsky.app') {
    const match = pathname.match(BLUESKY_PROFILE_PATH)
    if (!match) return null
    try {
      return { site: 'bluesky', handle: decodeURIComponent(match[1]) }
    } catch {
      return null
    }
  }
  if (isRedditHost(hostname)) {
    const subreddit = pathname.match(SUBREDDIT_PATH)
    if (subreddit) return { site: 'reddit', handle: `r/${subreddit[1]}` }
    const user = pathname.match(REDDIT_USER_PATH)
    return user ? { site: 'reddit', handle: `u/${user[1]}` } : null
  }
  if (isFacebookHost(hostname)) {
    if (pathname === '/profile.php' || pathname === '/profile.php/') {
      const id = parsed.searchParams.get('id')
      return id && /^\d+$/.test(id) ? { site: 'facebook', handle: id } : null
    }
    const group = pathname.match(FACEBOOK_GROUP_PATH)
    if (group) return { site: 'facebook', handle: `groups/${group[1]}` }
    const person = pathname.match(FACEBOOK_PEOPLE_PATH)
    if (person) return { site: 'facebook', handle: person[1] }
    const match = pathname.match(FACEBOOK_NAME_PATH)
    return match && isFacebookName(match[1]) ? { site: 'facebook', handle: match[1] } : null
  }
  if (isTikTokHost(hostname)) {
    const match = pathname.match(TIKTOK_PROFILE_PATH)
    return match ? { site: 'tiktok', handle: match[1] } : null
  }
  if (!notMastodonHost.test(hostname)) {
    const match = pathname.match(MASTODON_PROFILE_PATH)
    return match ? { site: 'mastodon', handle: `${match[1]}@${match[2] || hostname}` } : null
  }
  return null
}

/** Handles are not case sensitive on any of the sites, so a profile is told by its lower case handle. */
export const watchKey = ({ site, handle }: WatchTarget) => `${site}:${handle.toLowerCase()}`

/** The user and server of a Mastodon handle, user@host. */
export const splitMastodonHandle = (handle: string) => {
  const at = handle.lastIndexOf('@')
  return { user: handle.slice(0, at), host: handle.slice(at + 1) }
}

export const watchProfileUrl = ({ site, handle, url }: WatchTarget & { url?: string }) => {
  if (url) return url
  switch (site) {
    case 'x':
      return `https://x.com/${handle}`
    case 'instagram':
      return `https://www.instagram.com/${handle}/`
    case 'threads':
      return `https://www.threads.com/@${handle}`
    case 'bluesky':
      return `https://bsky.app/profile/${handle}`
    case 'mastodon': {
      const { user, host } = splitMastodonHandle(handle)
      return `https://${host}/@${user}`
    }
    case 'reddit':
      return `https://www.reddit.com/${handle.replace(/^u\//, 'user/')}/`
    case 'facebook':
      return /^\d+$/.test(handle) ? `https://www.facebook.com/profile.php?id=${handle}` : `https://www.facebook.com/${handle}/`
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`
  }
}

/**
 * How a source is named to the user: @handle, but a subreddit or user of Reddit as Reddit has it,
 * r/name or u/name, and a group on Facebook as its address has it, groups/name.
 */
export const watchSourceLabel = ({ site, handle }: WatchTarget) =>
  site === 'reddit' || (site === 'facebook' && handle.startsWith('groups/')) ? handle : `@${handle}`

// --- X ----------------------------------------------------------------------

/** The page that embeds a profile's timeline; it needs no account, but may be behind. */
export const xTimelineUrl = (handle: string) =>
  `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/

const xImage = (tweet: any): string | undefined => {
  const media = tweet?.extended_entities?.media || tweet?.entities?.media
  return Array.isArray(media) ? media[0]?.media_url_https : undefined
}

// A video is kept at up to about 720p: what a phone shows well, at a fraction of the largest file.
const X_VIDEO_MAX_BITRATE = 2_500_000

/** The mp4 to keep of a video: the best one up to the bitrate above, or the smallest there is. */
export const pickXVideoVariant = (variants: { content_type?: string; bitrate?: number; url?: string }[] | undefined) => {
  const mp4s = (variants || []).filter((variant) => variant.content_type === 'video/mp4' && variant.url)
  const fitting = mp4s.filter((variant) => (variant.bitrate || 0) <= X_VIDEO_MAX_BITRATE)
  const sorted = (fitting.length ? fitting : mp4s).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
  return (fitting.length ? sorted[0] : sorted[sorted.length - 1])?.url
}

const xMedia = (tweet: any): WatchMedia[] => {
  const media = tweet?.extended_entities?.media || tweet?.entities?.media
  const items: WatchMedia[] = []
  for (const item of Array.isArray(media) ? media : []) {
    const thumb: string | undefined = item?.media_url_https
    if (!thumb) continue
    const width = item.original_info?.width
    const height = item.original_info?.height
    if (item.type === 'video' || item.type === 'animated_gif') {
      const url = pickXVideoVariant(item.video_info?.variants)
      if (url) items.push({ type: 'video', url, thumb, width, height })
    } else {
      // "large" is up to 2048px; the original can be several times that.
      items.push({ type: 'image', url: `${thumb}?name=large`, thumb, width, height })
    }
  }
  return items
}

// The text comes with its links shortened, and a link to the post's own media at the end.
const xText = (tweet: any): string => {
  let text: string = tweet?.full_text || tweet?.text || ''
  for (const url of tweet?.entities?.urls || []) {
    if (url?.url && url?.expanded_url) {
      text = text.split(url.url).join(url.expanded_url)
    }
  }
  for (const media of tweet?.entities?.media || []) {
    if (media?.url) {
      text = text.split(media.url).join('')
    }
  }
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** X's dates, as "Fri Oct 16 19:42:20 +0000 2026": not a format every engine's Date.parse reads. */
export function parseXDate(value: string | undefined): number {
  const match = value?.match(/^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2}) (\d{4})$/)
  if (!match) return 0
  const [, month, day, hours, minutes, seconds, sign, offsetHours, offsetMinutes, year] = match
  const monthIndex = MONTHS.indexOf(month)
  if (monthIndex === -1) return 0
  const offsetMs = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60000 * (sign === '-' ? -1 : 1)
  return Date.UTC(Number(year), monthIndex, Number(day), Number(hours), Number(minutes), Number(seconds)) - offsetMs
}

export function parseXTimeline(html: string, handle: string): WatchFetchResult {
  const match = html.match(NEXT_DATA)
  if (!match) {
    throw new Error('no timeline data')
  }
  const data = JSON.parse(match[1])
  const entries = data?.props?.pageProps?.timeline?.entries
  if (!Array.isArray(entries)) {
    throw new Error('no timeline entries')
  }
  const info: WatchProfileInfo = {}
  const posts: WatchFetchResult['posts'] = []
  for (const entry of entries) {
    const tweet = entry?.content?.tweet
    if (entry?.type !== 'tweet' || !tweet?.id_str) {
      continue
    }
    const user = tweet.user
    if (!info.name && user?.screen_name?.toLowerCase() === handle.toLowerCase()) {
      info.name = user.name
      info.avatar = user.profile_image_url_https
    }
    const shown = tweet.retweeted_status || tweet
    posts.push({
      id: tweet.id_str,
      site: 'x',
      handle,
      url: `https://x.com${tweet.permalink || `/${user?.screen_name || handle}/status/${tweet.id_str}`}`,
      text: xText(shown),
      image: xImage(shown),
      media: xMedia(shown),
      mediaComplete: true,
      createdAtMs: parseXDate(tweet.created_at),
      repostOf: tweet.retweeted_status ? shown.user?.screen_name : undefined,
    })
  }
  return { info, posts }
}

// --- Instagram --------------------------------------------------------------

export const INSTAGRAM_APP_ID = '936619743392459'

export const instagramProfileInfoUrl = (handle: string) =>
  `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`

const graphItem = (node: any): WatchMedia | null => {
  if (!node?.display_url) return null
  const size = { width: node.dimensions?.width, height: node.dimensions?.height }
  if (node.is_video) {
    return node.video_url ? { type: 'video', url: node.video_url, thumb: node.display_url, ...size } : null
  }
  return { type: 'image', url: node.display_url, ...size }
}

/** The media of a post in the shape of Instagram's older API: on its embed page, and in a profile's data with an account. */
const instagramGraphMedia = (node: any): { media: WatchMedia[]; mediaComplete: boolean } => {
  const children = node?.edge_sidecar_to_children?.edges
  const nodes = Array.isArray(children) && children.length ? children.map((edge: any) => edge?.node) : [node]
  const media = nodes.map(graphItem)
  // A video without its file, or a carousel without its photos, still has to be read from the embed page.
  const complete = media.every(Boolean) && !(node?.__typename === 'GraphSidecar' && !children?.length)
  return { media: media.filter((item: WatchMedia | null): item is WatchMedia => Boolean(item)), mediaComplete: complete }
}

/** The page Instagram embeds a post with: needs no account, and has the post's photos and video. */
export const instagramEmbedUrl = (code: string) => `https://www.instagram.com/p/${encodeURIComponent(code)}/embed/captioned/`

/**
 * Reads the media of a post from its embed page. A video or a carousel comes as data for the
 * page's player; a single photo only as the page's picture, the largest of its sizes.
 */
export function parseInstagramEmbed(html: string): WatchMedia[] {
  const context = html.match(/"contextJSON":"((?:[^"\\]|\\.)*)"/)
  if (context) {
    let shortcodeMedia: any
    try {
      shortcodeMedia = JSON.parse(JSON.parse(`"${context[1]}"`))?.gql_data?.shortcode_media
    } catch {}
    if (shortcodeMedia) {
      const { media } = instagramGraphMedia(shortcodeMedia)
      if (media.length) return media
    }
  }
  const image = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/)?.[0]
  if (image) {
    const srcset = image.match(/srcset="([^"]*)"/)?.[1]
    const candidates = (srcset ? decodeEntities(srcset).split(',') : [])
      .map((entry) => entry.trim().split(/\s+/))
      .map(([url, size]) => ({ url, width: parseInt(size, 10) || 0 }))
      .filter((candidate) => candidate.url)
      .sort((a, b) => b.width - a.width)
    const src = image.match(/src="([^"]*)"/)?.[1]
    const url = candidates[0]?.url || (src ? decodeEntities(src) : undefined)
    if (url) return [{ type: 'image', url }]
  }
  throw new Error('no media in the embed page')
}

export function parseInstagramProfileInfo(json: any, handle: string): WatchFetchResult {
  const user = json?.data?.user
  if (!user) {
    throw new Error(json?.message || 'no profile data')
  }
  const edges = user.edge_owner_to_timeline_media?.edges
  const posts: WatchFetchResult['posts'] = []
  for (const edge of Array.isArray(edges) ? edges : []) {
    const node = edge?.node
    if (!node?.shortcode) {
      continue
    }
    posts.push({
      id: node.shortcode,
      site: 'instagram',
      handle,
      url: `https://www.instagram.com/${node.product_type === 'clips' ? 'reel' : 'p'}/${node.shortcode}/`,
      text: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
      image: node.thumbnail_src || node.display_url,
      ...instagramGraphMedia(node),
      createdAtMs: (node.taken_at_timestamp || 0) * 1000,
    })
  }
  return { info: { name: user.full_name || undefined, avatar: user.profile_pic_url || undefined }, posts }
}

/**
 * What a browser sends for a page it navigates to. Instagram leaves the posts out of a
 * profile page it is asked for without these.
 */
export const INSTAGRAM_PAGE_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
}

// The ids of posts are made from the time they were made: milliseconds since Instagram's own epoch, in the bits above the lowest 23.
const INSTAGRAM_EPOCH_MS = 1314220021721

export const instagramPostTime = (pk: string) => {
  try {
    return Number(BigInt(pk) >> BigInt(23)) + INSTAGRAM_EPOCH_MS
  } catch {
    return 0
  }
}

export const decodeEntities = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const metaContent = (html: string, property: string) => {
  const match = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`))
  return match ? decodeEntities(match[1]) : undefined
}

const TIMELINE_KEY = 'polaris_ordered_timeline_connection'

const findWithKey = (value: any, key: string): any => {
  if (!value || typeof value !== 'object') return undefined
  if (!Array.isArray(value) && key in value) return value
  for (const child of Object.values(value)) {
    const found = findWithKey(child, key)
    if (found) return found
  }
  return undefined
}

/**
 * Reads the posts a profile page comes with, in the data it carries for its grid; the page
 * is the same with or without an account. The name and picture are read from its preview tags.
 */
export function parseInstagramProfilePage(html: string, handle: string): WatchFetchResult {
  let connection: any
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes(TIMELINE_KEY)) continue
    try {
      connection = findWithKey(JSON.parse(match[1]), TIMELINE_KEY)?.[TIMELINE_KEY]
    } catch {}
    if (connection) break
  }
  if (!Array.isArray(connection?.edges)) {
    throw new Error('no posts in the page')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const edge of connection.edges) {
    const node = edge?.node
    if (!node?.code) continue
    posts.push({
      id: node.code,
      site: 'instagram',
      handle,
      url: `https://www.instagram.com/${node.product_type === 'clips' ? 'reel' : 'p'}/${node.code}/`,
      text: node.caption?.text || '',
      image: node.display_uri || undefined,
      // Only the cover: the photos of a carousel and a video's file are on the post's embed page.
      media: node.display_uri
        ? [{ type: node.product_type === 'clips' || node.media_type === 2 ? 'video' : 'image', url: node.display_uri, thumb: node.display_uri }]
        : [],
      mediaComplete: false,
      createdAtMs: node.pk ? instagramPostTime(String(node.pk)) : 0,
    })
  }
  const title = metaContent(html, 'og:title')
  const name = title?.match(/^(.*?) \(@[^)]+\)/)?.[1]
  return { info: { name: name || undefined, avatar: metaContent(html, 'og:image') }, posts }
}

/** The text of a post given as HTML: paragraphs and line breaks kept, a link as its address, made whole with `origin`. */
export const htmlToText = (html: string, origin = '') =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      // A mention or a hashtag reads as it is shown; any other link is shortened, so its address is given.
      .replace(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi, (_, attributes: string, inner: string) => {
        const href = attributes.match(/href="([^"]*)"/)?.[1]
        if (!href || /class="[^"]*\b(?:mention|hashtag)\b/.test(attributes)) return inner
        return href.startsWith('/') ? `${origin}${href}` : href
      })
      .replace(/<[^>]+>/g, ''),
  ).trim()

// --- Threads ----------------------------------------------------------------

const THREADS_MEDIA_KEY = 'mediaData'

const threadsItem = (item: any): WatchMedia | null => {
  const image: string | undefined = item?.image_versions2?.candidates?.[0]?.url
  const size = { width: item?.original_width || undefined, height: item?.original_height || undefined }
  const video: string | undefined = item?.video_versions?.[0]?.url
  if (video) return { type: 'video', url: video, thumb: image, ...size }
  return image ? { type: 'image', url: image, ...size } : null
}

const threadsMedia = (post: any): WatchMedia[] => {
  const items = Array.isArray(post?.carousel_media) && post.carousel_media.length ? post.carousel_media : [post]
  return items.map(threadsItem).filter((item: WatchMedia | null): item is WatchMedia => Boolean(item))
}

/**
 * Reads the posts a Threads profile page comes with, the same with or without an account. Each is
 * the first of its thread: the others are the author's replies to it.
 */
export function parseThreadsProfilePage(html: string, handle: string): WatchFetchResult {
  let mediaData: any
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes(`"${THREADS_MEDIA_KEY}"`)) continue
    try {
      mediaData = findWithKey(JSON.parse(match[1]), THREADS_MEDIA_KEY)?.[THREADS_MEDIA_KEY]
    } catch {}
    if (Array.isArray(mediaData?.edges)) break
  }
  if (!Array.isArray(mediaData?.edges)) {
    throw new Error('no posts in the page')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const edge of mediaData.edges) {
    const post = edge?.node?.thread_items?.[0]?.post
    if (!post?.code) continue
    const reposted = post.text_post_app_info?.share_info?.reposted_post
    const shown = reposted?.code ? reposted : post
    const media = threadsMedia(shown)
    posts.push({
      id: shown.code,
      site: 'threads',
      handle,
      url: `https://www.threads.com/@${shown.user?.username || handle}/post/${shown.code}`,
      text: shown.caption?.text || '',
      image: media[0]?.thumb || media[0]?.url,
      media,
      mediaComplete: true,
      // A repost shows up when it was reposted.
      createdAtMs: (post.taken_at || shown.taken_at || 0) * 1000,
      repostOf: shown !== post ? shown.user?.username : undefined,
    })
  }
  const title = metaContent(html, 'og:title')
  const name = title?.match(/^(.*?) \(@[^)]+\)/)?.[1]
  return { info: { name: name || undefined, avatar: metaContent(html, 'og:image') }, posts }
}

/** The page of one post, which has all its photos and videos, as a profile page does for its newest; on Facebook too. */
export const threadsPostUrl = (post: Pick<WatchPost, 'url'>) => post.url

const findPostWithCode = (value: any, code: string): any => {
  if (!value || typeof value !== 'object') return undefined
  if (!Array.isArray(value) && value.code === code && (value.image_versions2 || value.carousel_media || value.video_versions)) {
    return value
  }
  for (const child of Object.values(value)) {
    const found = findPostWithCode(child, code)
    if (found) return found
  }
  return undefined
}

/** Reads the photos and videos of a post from its own page, which needs no account. */
export function parseThreadsPostPage(html: string, code: string): WatchMedia[] {
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes(`"code":"${code}"`)) continue
    let post: any
    try {
      post = findPostWithCode(JSON.parse(match[1]), code)
    } catch {}
    const media = post ? threadsMedia(post) : []
    if (media.length) return media
  }
  throw new Error('no media in the post page')
}

/** Whether the addresses of a post's media expire, so that the post is read again for new ones. */
export const refreshesMedia = (site: WatchSite) =>
  site === 'instagram' || site === 'threads' || site === 'facebook' || site === 'tiktok'

// --- Bluesky ----------------------------------------------------------------

/** A profile's posts and reposts, without its replies, from Bluesky's public API: it needs no account. */
export const blueskyFeedUrl = (handle: string) =>
  `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=30&filter=posts_no_replies`

// Bluesky's own server, which sends a request on to the server of an account it hosts.
const BLUESKY_PDS = 'https://bsky.social'

/**
 * A video's own file, as it was uploaded, from the server of the account it is in, its PDS. The feed
 * has it only as a stream, which can't be kept on the phone.
 */
export const blueskyVideoUrl = (did: string, cid: string, pds = BLUESKY_PDS) =>
  `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`

/** Where the document of an account's id is, which tells the server it is on. */
export const didDocumentUrl = (did: string): string | undefined => {
  if (did.startsWith('did:plc:')) return `https://plc.directory/${did}`
  if (!did.startsWith('did:web:')) return undefined
  try {
    const [host, ...path] = did.slice('did:web:'.length).split(':').map(decodeURIComponent)
    return path.length ? `https://${host}/${path.join('/')}/did.json` : `https://${host}/.well-known/did.json`
  } catch {
    return undefined
  }
}

/** The server an account is on, its PDS, from the document of its id. */
export function parseDidDocumentPds(json: any): string | undefined {
  const service = (Array.isArray(json?.service) ? json.service : []).find(
    (entry: any) => typeof entry?.id === 'string' && entry.id.endsWith('#atproto_pds'),
  )
  const endpoint = service?.serviceEndpoint
  return typeof endpoint === 'string' && /^https:\/\/[^/]+/.test(endpoint) ? endpoint.replace(/\/+$/, '') : undefined
}

const AT_POST_URI = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/

const utf8Length = (codePoint: number) => (codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4)

/** The text of a post with its links in full: Bluesky shortens them, and tells where each is in bytes of UTF-8. */
export function expandBlueskyLinks(text: string, facets: any): string {
  const links = (Array.isArray(facets) ? facets : [])
    .map((facet: any) => ({
      start: facet?.index?.byteStart,
      end: facet?.index?.byteEnd,
      uri: facet?.features?.find((feature: any) => feature?.$type === 'app.bsky.richtext.facet#link')?.uri,
    }))
    .filter((link) => typeof link.uri === 'string' && Number.isInteger(link.start) && link.end > link.start)
    .sort((a, b) => a.start - b.start)
  if (!links.length) return text
  let out = ''
  let byte = 0
  let next = 0
  let written = -1
  for (const char of text) {
    while (links[next] && byte >= links[next].end) next += 1
    const link = links[next]
    if (!link || byte < link.start) {
      out += char
    } else if (written !== next) {
      out += link.uri
      written = next
    }
    byte += utf8Length(char.codePointAt(0)!)
  }
  return out
}

const embeddedMedia = (embed: any) => (embed?.$type === 'app.bsky.embed.recordWithMedia#view' ? embed.media : embed)

/** The accounts whose videos are in a feed: the server each is on is asked for before the feed is read. */
export function blueskyVideoDids(json: any): string[] {
  const dids = new Set<string>()
  for (const item of Array.isArray(json?.feed) ? json.feed : []) {
    const did = typeof item?.post?.uri === 'string' ? item.post.uri.match(AT_POST_URI)?.[1] : undefined
    if (did && embeddedMedia(item.post.embed)?.$type === 'app.bsky.embed.video#view') dids.add(did)
  }
  return [...dids]
}

const blueskyMedia = (embed: any, did: string, pds?: string): WatchMedia[] => {
  const media = embeddedMedia(embed)
  const size = (aspectRatio: any) => ({ width: aspectRatio?.width, height: aspectRatio?.height })
  if (media?.$type === 'app.bsky.embed.images#view') {
    return (media.images || [])
      .filter((image: any) => image?.fullsize)
      .map((image: any): WatchMedia => ({ type: 'image', url: image.fullsize, thumb: image.thumb, ...size(image.aspectRatio) }))
  }
  if (media?.$type === 'app.bsky.embed.video#view' && media.cid) {
    return [{ type: 'video', url: blueskyVideoUrl(did, media.cid, pds), thumb: media.thumbnail, ...size(media.aspectRatio) }]
  }
  return []
}

/** `pdsOf` tells the server of an account, where its videos are; Bluesky's own when it is not known. */
export function parseBlueskyFeed(json: any, handle: string, pdsOf: (did: string) => string | undefined = () => undefined): WatchFetchResult {
  if (!Array.isArray(json?.feed)) {
    throw new Error(json?.message || 'no feed')
  }
  const info: WatchProfileInfo = {}
  const posts: WatchFetchResult['posts'] = []
  for (const item of json.feed) {
    const post = item?.post
    const parts = typeof post?.uri === 'string' ? post.uri.match(AT_POST_URI) : null
    if (!parts) continue
    const [, did, rkey] = parts
    const repost = item.reason?.$type === 'app.bsky.feed.defs#reasonRepost'
    // Everything in the feed is the profile's own post or its repost.
    const owner = repost ? item.reason.by : post.author
    if (!info.name && !info.avatar && owner) {
      info.name = owner.displayName || undefined
      info.avatar = owner.avatar || undefined
    }
    const media = blueskyMedia(post.embed, did, pdsOf(did))
    const external = post.embed?.$type === 'app.bsky.embed.external#view' ? post.embed.external : undefined
    let text = expandBlueskyLinks(post.record?.text || '', post.record?.facets)
    if (external?.uri && !text.includes(external.uri)) text = text ? `${text}\n${external.uri}` : external.uri
    posts.push({
      // A record's key is only unique within its author's repository.
      id: `${did}/${rkey}`,
      site: 'bluesky',
      handle,
      url: `https://bsky.app/profile/${post.author?.handle || did}/post/${rkey}`,
      text,
      image: media[0]?.thumb || media[0]?.url || external?.thumb,
      media,
      link: !media.length && external?.thumb ? external.uri : undefined,
      mediaComplete: true,
      // A repost shows up in the feed when it was reposted.
      createdAtMs: Date.parse((repost ? item.reason.indexedAt : post.record?.createdAt) || post.indexedAt) || 0,
      repostOf: repost ? post.author?.handle : undefined,
    })
  }
  return { info, posts }
}

// --- Mastodon ---------------------------------------------------------------

/** The account of a handle on the server it is on; its posts are asked for by the account's id. */
export const mastodonLookupUrl = (handle: string, server = splitMastodonHandle(handle).host) =>
  `https://${server}/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`

export const mastodonStatusesUrl = (server: string, id: string) =>
  `https://${server}/api/v1/accounts/${encodeURIComponent(id)}/statuses?limit=30&exclude_replies=true`

/**
 * Where an account is asked about, which a handle's domain may only name: a server can give its
 * accounts the handles of another domain. Its WebFinger answer links the account on its own server.
 */
export const mastodonWebFingerUrl = (handle: string) =>
  `https://${splitMastodonHandle(handle).host}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${handle}`)}`

export function parseMastodonWebFinger(json: any): string {
  const self = (Array.isArray(json?.links) ? json.links : []).find(
    (link: any) => link?.rel === 'self' && typeof link.href === 'string',
  )
  try {
    return new URL(self.href).host
  } catch {
    throw new Error('no account')
  }
}

const mastodonMedia = (attachment: any): WatchMedia | null => {
  const url: string | undefined = attachment?.url || attachment?.remote_url
  if (!url) return null
  const original = attachment.meta?.original
  const size = { width: original?.width, height: original?.height }
  if (attachment.type === 'image') return { type: 'image', url, thumb: attachment.preview_url || undefined, ...size }
  if (attachment.type === 'video' || attachment.type === 'gifv') return { type: 'video', url, thumb: attachment.preview_url || undefined, ...size }
  return null
}

/** The posts of an account, as the server it is on, `server`, has them. */
export function parseMastodonStatuses(account: any, statuses: any, handle: string, server = splitMastodonHandle(handle).host): WatchFetchResult {
  if (!Array.isArray(statuses)) {
    throw new Error(statuses?.error || 'no posts')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const status of statuses) {
    const shown = status?.reblog || status
    if (!shown?.id) continue
    const media = (shown.media_attachments || []).map(mastodonMedia).filter((item: WatchMedia | null): item is WatchMedia => Boolean(item))
    const content = htmlToText(shown.content || '')
    posts.push({
      // The same post has an id of its own on each server; its address is the same everywhere.
      id: shown.uri || shown.id,
      site: 'mastodon',
      handle,
      // On the profile's own server, where the post has this id.
      url: `https://${server}/@${shown.account?.acct || splitMastodonHandle(handle).user}/${shown.id}`,
      text: [shown.spoiler_text, content].filter(Boolean).join('\n\n'),
      image: media[0]?.thumb || media[0]?.url || shown.card?.image || undefined,
      media,
      link: !media.length && shown.card?.image ? shown.card.url || undefined : undefined,
      mediaComplete: true,
      createdAtMs: Date.parse(status.created_at) || 0,
      repostOf: status.reblog ? shown.account?.acct : undefined,
    })
  }
  const url = typeof account?.url === 'string' && /^https:\/\//.test(account.url) ? account.url : undefined
  return { info: { name: account?.display_name || undefined, avatar: account?.avatar || undefined, url }, posts }
}

// --- Facebook ---------------------------------------------------------------

// Parts of a post that are not of it: its likes and comments, and the pictures of who made it.
const FACEBOOK_SKIPPED_KEYS = new Set(['feedback', 'comet_feed_ufi_container', 'actors', 'profile_picture', 'owner'])

/**
 * The data documents of a page that have any of `markers` in them, by default those with posts or
 * the page's header: its own, and the answers kept as it was scrolled.
 */
const facebookDocuments = (html: string, markers = ['"post_id"', '"profile_header_renderer"']): any[] => {
  const documents: any[] = []
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!markers.some((marker) => match[1].includes(marker))) continue
    try {
      documents.push(JSON.parse(match[1]))
    } catch {}
  }
  return documents
}

// Where a page has the posts pinned to its top, and a group those it features, whatever their age.
const FACEBOOK_PINNED_KEYS = new Set(['profile_pinned_post', 'highlight_units'])

/**
 * The posts in some data, each once, in the order they come: what is inside a post, as what it
 * shares, is part of it. Those pinned to the top of the page are told in `pinned`.
 */
const facebookStories = (value: any, found: Map<string, any>, pinned = new Set<string>(), inPinned = false) => {
  if (!value || typeof value !== 'object') return
  if (!Array.isArray(value) && value.__typename === 'Story' && value.post_id) {
    const id = String(value.post_id)
    if (!found.has(id)) found.set(id, value)
    if (inPinned) pinned.add(id)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) facebookStories(item, found, pinned, inPinned)
    return
  }
  for (const [key, item] of Object.entries(value)) facebookStories(item, found, pinned, inPinned || FACEBOOK_PINNED_KEYS.has(key))
}

/** The first value under `key` in some data that `accept` takes, not looking into the keys of `skip`. */
const facebookFind = (value: any, key: string, accept: (found: any) => boolean, skip: Set<string>): any => {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = facebookFind(item, key, accept, skip)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (key in value && accept(value[key])) return value[key]
  for (const [name, item] of Object.entries(value)) {
    if (skip.has(name)) continue
    const found = facebookFind(item, key, accept, skip)
    if (found !== undefined) return found
  }
  return undefined
}

const OWN_PART = new Set([...FACEBOOK_SKIPPED_KEYS, 'attached_story'])

const isText = (value: any) => typeof value?.text === 'string' && Boolean(value.text)

/** The text of a post, or of a post it shares. */
const facebookText = (story: any, shared: boolean) =>
  facebookFind(shared ? story : story.comet_sections?.content?.story || story, 'message', isText, shared ? FACEBOOK_SKIPPED_KEYS : OWN_PART)?.text || ''

const facebookPhoto = (media: any): WatchMedia | null => {
  // The largest of the sizes given with an address: the one for the photo viewer can come without.
  const sizes = [media.viewer_image, media.photo_image, media.image].filter((size) => size?.uri)
  const full = sizes.sort((a, b) => (b.width || 0) - (a.width || 0))[0]
  if (!full) return null
  const thumb = media.image?.uri || media.photo_image?.uri || full.uri
  return { type: 'image', url: full.uri, thumb, width: full.width, height: full.height }
}

/** A video as a file to play; a video Facebook only streams is shown by its cover. */
const facebookVideo = (media: any): { item: WatchMedia | null; cover?: string } => {
  const delivery = media.videoDeliveryLegacyFields || media
  const url = delivery.browser_native_hd_url || delivery.browser_native_sd_url || media.playable_url_quality_hd || media.playable_url
  const cover = media.preferred_thumbnail?.image?.uri || media.thumbnailImage?.uri || media.image?.uri
  if (!url) return { item: null, cover }
  const size = { width: media.original_width || media.width, height: media.original_height || media.height }
  return { item: { type: 'video', url, thumb: cover, ...size }, cover }
}

/** The photos and videos of a post, and of a post it shares, each once and in order. */
const facebookMedia = (story: any): { media: WatchMedia[]; cover?: string } => {
  const media: WatchMedia[] = []
  const seen = new Set<string>()
  let cover: string | undefined
  const walk = (value: any) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    const type = value.__typename
    if (type === 'Photo' || type === 'Video') {
      // The same photo is there more than once, at times only by its id.
      const { item, cover: videoCover } = type === 'Photo' ? { item: facebookPhoto(value), cover: undefined } : facebookVideo(value)
      cover = cover || videoCover
      const key = value.id || item?.url
      if (item && !seen.has(key)) {
        seen.add(key)
        media.push(item)
      }
    }
    for (const [name, item] of Object.entries(value)) {
      if (!FACEBOOK_SKIPPED_KEYS.has(name)) walk(item)
    }
  }
  walk(story)
  return { media, cover: media[0]?.thumb || media[0]?.url || cover }
}

/** The name in the address of a page or profile, when it has one. */
const facebookName = (url: unknown) => {
  if (typeof url !== 'string') return undefined
  try {
    const { hostname, pathname } = new URL(url)
    const name = isFacebookHost(hostname) ? pathname.match(FACEBOOK_NAME_PATH)?.[1] : undefined
    return name && isFacebookName(name) ? name : undefined
  } catch {
    return undefined
  }
}

const hasActors = (value: any) => Array.isArray(value) && Boolean(value[0]?.id)

/**
 * The name and picture of a page, profile or group, from the header of its page: with an account
 * the page has no preview tags. A group has no picture of its own, and is shown by its cover.
 */
const facebookInfo = (documents: any[], html: string): WatchProfileInfo => {
  const header = facebookFind(documents, 'profile_header_renderer', (value) => Boolean(value?.user || value?.group), new Set())
  const profile = header?.user || header?.group
  const avatar =
    profile?.profilePicLarge?.uri ||
    profile?.profile_picture_for_sticky_bar?.uri ||
    profile?.cover_renderer?.cover_photo_content?.photo?.image?.uri
  return { name: profile?.name || metaContent(html, 'og:title'), avatar: avatar || metaContent(html, 'og:image') }
}

/**
 * Reads the posts of a page, profile or group on Facebook from the data its page comes with, and
 * that it brings as it is scrolled. Ads are left out.
 */
export function parseFacebookPage(html: string, handle: string): WatchFetchResult {
  const documents = facebookDocuments(html)
  const stories = new Map<string, any>()
  const pinned = new Set<string>()
  for (const document of documents) facebookStories(document, stories, pinned)
  const posts: WatchFetchResult['posts'] = []
  for (const [id, story] of stories) {
    if (story.sponsored_data) continue
    const createdAt = facebookFind(story, 'creation_time', (value) => typeof value === 'number', OWN_PART)
    const url = facebookFind(story, 'permalink_url', (value) => typeof value === 'string', OWN_PART)
    if (!createdAt || !url) continue
    const shared = story.attached_story || story.comet_sections?.content?.story?.attached_story
    const author = facebookFind(story, 'actors', hasActors, FACEBOOK_SKIPPED_KEYS)?.[0]
    const sharedAuthor = shared ? facebookFind(shared, 'actors', hasActors, new Set())?.[0] : undefined
    const { media, cover } = facebookMedia(story)
    posts.push({
      id,
      site: 'facebook',
      handle,
      url,
      // A post that shares another without a word of its own shows the other's.
      text: facebookText(story, false) || (shared ? facebookText(shared, true) : ''),
      image: cover,
      media,
      mediaComplete: true,
      createdAtMs: createdAt * 1000,
      repostOf: sharedAuthor && sharedAuthor.id !== author?.id ? facebookName(sharedAuthor.url) : undefined,
    })
  }
  if (!posts.length) {
    throw new Error('no posts')
  }
  return { info: facebookInfo(documents, html), posts, pinnedIds: posts.filter((post) => pinned.has(post.id)).map((post) => post.id) }
}

// A video's address, as a reel or on a page: /reel/id/ or /name/videos/title/id/; or /watch/?v=id.
const FACEBOOK_VIDEO_PATH = /\/(?:reel|videos)\/(?:[^/?#]+\/)?(\d+)\/?(?:[?#]|$)|\/watch\/?\?(?:[^#]*&)?v=(\d+)/

/** The video with this id in some data, with the addresses it is played from, or its cover at least. */
const facebookVideoById = (value: any, id: string): any => {
  if (!value || typeof value !== 'object') return undefined
  if (!Array.isArray(value) && value.__typename === 'Video' && value.id === id) {
    const { item, cover } = facebookVideo(value)
    if (item || cover) return value
  }
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const found = facebookVideoById(item, id)
    if (found) return found
  }
  return undefined
}

/**
 * The photos and videos of one post at addresses that work now, from the post's own page, with
 * its cover, which is all there is of a video Facebook only streams. A video or reel is sent on
 * to the video's page, which has the video, not the post.
 */
export function parseFacebookPostPage(html: string, post: Pick<WatchPost, 'id' | 'url'>): { media: WatchMedia[]; cover?: string } {
  const stories = new Map<string, any>()
  for (const document of facebookDocuments(html)) facebookStories(document, stories)
  const story = stories.get(post.id)
  if (story) return facebookMedia(story)
  const match = post.url.match(FACEBOOK_VIDEO_PATH)
  const videoId = match?.[1] || match?.[2]
  if (videoId) {
    for (const document of facebookDocuments(html, [`"${videoId}"`])) {
      const video = facebookVideoById(document, videoId)
      if (video) {
        const { item, cover } = facebookVideo(video)
        return { media: item ? [item] : [], cover }
      }
    }
  }
  throw new Error('no post in the page')
}

/**
 * Whether the posts read from a page reach back to a time: the last of them, the furthest down
 * the page, is no newer. A pinned post comes first whatever its age, and does not tell.
 */
export const reachesBackTo = (posts: Pick<WatchPost, 'id' | 'createdAtMs'>[], time: number | undefined, pinnedIds: string[] = []) => {
  const listed = posts.filter((post) => !pinnedIds.includes(post.id))
  return time !== undefined && listed.length > 0 && listed[listed.length - 1].createdAtMs <= time
}

/** Whether Facebook answered with a page that is not the one asked for: what it shows without an account, for most. */
export const isFacebookErrorPage = (html: string) => html.includes('"comet.fbweb.CometErrorRoute"')

// --- Reddit -----------------------------------------------------------------

const redditName = (handle: string) => encodeURIComponent(handle.slice(2))

/** The newest posts of a subreddit, r/name, or of a user, u/name, as Reddit's own pages load them: it needs no account. */
export const redditPostsUrl = (handle: string) =>
  handle.startsWith('u/')
    ? `https://www.reddit.com/svc/shreddit/profiles/profile_posts-more-posts/new/?name=${redditName(handle)}`
    : `https://www.reddit.com/svc/shreddit/community-more-posts/new/?name=${redditName(handle)}`

/** The same posts as data, which Reddit answers only with an account. */
export const redditListingUrl = (handle: string) =>
  handle.startsWith('u/')
    ? `https://www.reddit.com/user/${redditName(handle)}/submitted.json?sort=new&raw_json=1&sr_detail=1`
    : `https://www.reddit.com/r/${redditName(handle)}/new.json?raw_json=1&sr_detail=1`

/** The card a subreddit's name shows when pointed at, which has its picture. */
export const redditCommunityCardUrl = (handle: string) => `https://www.reddit.com/svc/shreddit/community-hover-card/${redditName(handle)}`

const REDDIT_IMAGE = /^https:\/\/(?:i\.redd\.it|i\.imgur\.com)\/[^?#]+\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i

// Links that are of the post itself, not one it shares.
const REDDIT_OWN_LINK = /^(?:\/|https:\/\/(?:(?:www\.)?reddit\.com|v\.redd\.it|i\.redd\.it|preview\.redd\.it)\/)/

// The subreddit a user's own posts are in.
const redditHome = (handle: string) => (handle.startsWith('u/') ? `u_${handle.slice(2)}` : handle.slice(2)).toLowerCase()

const redditPostText = (title: string, body: string, link: string | undefined) => {
  const shared = link && !REDDIT_OWN_LINK.test(link) ? link : undefined
  return [title, body, shared].filter(Boolean).join('\n\n')
}

// Marks where an item of a list starts, until the text is made: a line of the post may start with "- " itself.
const LIST_ITEM = '\u0001'

/**
 * The text of a post's body given as HTML, whose line breaks are only its layout: paragraphs,
 * headings and the items of lists are each a block of their own, and a block of code keeps its
 * lines and their indents.
 */
const redditBodyText = (html: string) => {
  const code: string[] = []
  const flowing = html
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, block: string) => {
      code.push(decodeEntities(block.replace(/<[^>]+>/g, '')).replace(/^\n+|\s+$/g, ''))
      return `<p>\u0000${code.length - 1}\u0000</p>`
    })
    .replace(/\s+/g, ' ')
    .replace(/<li\b[^>]*>/gi, `\n\n${LIST_ITEM}`)
    .replace(/<\/?(?:p|div|ul|ol|li|h[1-6]|blockquote|table|tr)\b[^>]*>|<hr\b[^>]*>/gi, '\n\n')
  return htmlToText(flowing, 'https://www.reddit.com')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    // The items of a list are a line each, the first right under what leads to it.
    .replace(new RegExp(`(?:^|\\n+)${LIST_ITEM}\\n*`, 'g'), '\n- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\u0000(\d+)\u0000/g, (_, index: string) => code[Number(index)])
}

/** A post's media as Reddit's data has it: all the photos of a gallery; a video only as its cover, which opens the post. */
const redditListingMedia = (post: any): { media: WatchMedia[]; cover?: string } => {
  const preview = post.preview?.images?.[0]
  const cover: string | undefined = preview?.resolutions?.findLast((size: any) => size.width <= 640)?.url || preview?.source?.url
  if (post.is_gallery) {
    const media: WatchMedia[] = []
    for (const item of post.gallery_data?.items || []) {
      const meta = post.media_metadata?.[item?.media_id]
      if (meta?.status !== 'valid') continue
      const thumb = meta.p?.findLast((size: any) => size.x <= 640)?.u
      const size = { width: meta.s?.x, height: meta.s?.y }
      if (meta.e === 'AnimatedImage' && meta.s?.mp4) media.push({ type: 'video', url: meta.s.mp4, thumb, ...size })
      else if (meta.s?.u || meta.s?.gif) media.push({ type: 'image', url: meta.s.u || meta.s.gif, thumb, ...size })
    }
    return { media, cover: media[0]?.thumb || media[0]?.url }
  }
  const size = { width: preview?.source?.width, height: preview?.source?.height }
  const gif = preview?.variants?.mp4?.source?.url
  if (gif && !post.is_video) return { media: [{ type: 'video', url: gif, thumb: cover, ...size }], cover }
  if (REDDIT_IMAGE.test(post.url || '')) return { media: [{ type: 'image', url: post.url, thumb: cover, ...size }], cover }
  return { media: [], cover }
}

/** Reads the posts of a subreddit or a user from Reddit's data, as asked for with an account. */
export function parseRedditListing(json: any, handle: string): WatchFetchResult {
  const children = json?.data?.children
  if (!Array.isArray(children)) {
    throw new Error(json?.message || 'no posts')
  }
  const posts: WatchFetchResult['posts'] = []
  let avatar: string | undefined
  for (const child of children) {
    const post = child?.data
    if (child?.kind !== 't3' || !post?.id || !post.permalink) continue
    const home = post.sr_detail
    if (!avatar && home && String(post.subreddit).toLowerCase() === redditHome(handle)) {
      avatar = home.community_icon || home.icon_img || undefined
    }
    // A crosspost shows the post it shares.
    const shown = post.crosspost_parent_list?.[0] || post
    const { media, cover } = redditListingMedia(shown)
    posts.push({
      id: post.id,
      site: 'reddit',
      handle,
      url: `https://www.reddit.com${post.permalink}`,
      text: redditPostText(post.title || '', shown.selftext_html ? redditBodyText(shown.selftext_html) : shown.selftext || '', shown.is_self || shown.is_gallery ? undefined : shown.url),
      image: cover || media[0]?.url,
      media,
      mediaComplete: true,
      createdAtMs: (post.created_utc || 0) * 1000,
    })
  }
  return { info: { avatar }, posts }
}

const htmlAttribute = (tag: string, attribute: string) => {
  const value = tag.match(new RegExp(`\\s${attribute}="([^"]*)"`))?.[1]
  return value === undefined ? undefined : decodeEntities(value)
}

const htmlTags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\s[^>]*>`, 'g')) || []

// Reddit's times have microseconds and an offset without a colon, which not every engine reads.
const redditTime = (value = '') => Date.parse(value.replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) || 0

/** A post's media as its card on Reddit's page shows it, as `redditListingMedia` does. */
const redditCardMedia = (card: string, link: string | undefined): { media: WatchMedia[]; cover?: string } => {
  const gallery = card.match(/<gallery-carousel[\s\S]*?<\/gallery-carousel>/)?.[0]
  if (gallery) {
    const media: WatchMedia[] = []
    for (const [page] of gallery.matchAll(/<li[\s\S]*?<\/li>/g)) {
      const images = htmlTags(page, 'img')
      const full = images.map((image) => htmlAttribute(image, 'src')).find((src) => src && REDDIT_IMAGE.test(src))
      const first = images[0] || ''
      const thumb = first && (htmlAttribute(first, 'src') || htmlAttribute(first, 'data-lazy-src'))
      const url = full || thumb
      if (!url) continue
      media.push({ type: 'image', url, thumb, width: Number(htmlAttribute(first, 'width')) || undefined, height: Number(htmlAttribute(first, 'height')) || undefined })
    }
    return { media, cover: media[0]?.thumb || media[0]?.url }
  }
  const player = htmlTags(card, 'shreddit-player')[0]
  if (player) {
    const cover = htmlAttribute(player, 'poster')
    const src = htmlAttribute(player, 'src')
    // A gif is played from a file; a video is streamed, so it is only shown by its cover.
    if (/\sgif[\s>]/.test(player) && src && /[?&]format=mp4\b/.test(src)) return { media: [{ type: 'video', url: src, thumb: cover }], cover }
    return { media: [], cover }
  }
  const images = htmlTags(card, 'img')
  // The pictures of the post are named after it, "r/name - title"; an author's picture is not.
  const shown = images.filter((image) => / - /.test(htmlAttribute(image, 'alt') || ''))
  const primary = images.find((image) => /\sdata-post-media-primary[\s>=]/.test(image)) || shown[0]
  const cover = primary && htmlAttribute(primary, 'src')
  const full = link && REDDIT_IMAGE.test(link) ? link : shown.map((image) => htmlAttribute(image, 'src')).find((src) => src && REDDIT_IMAGE.test(src))
  if (!full) return { media: [], cover }
  const sized = images.find((image) => htmlAttribute(image, 'width') && htmlAttribute(image, 'height'))
  const size = sized ? { width: Number(htmlAttribute(sized, 'width')) || undefined, height: Number(htmlAttribute(sized, 'height')) || undefined } : {}
  return { media: [{ type: 'image', url: full, thumb: cover, ...size }], cover }
}

/** Reads the posts of a subreddit or a user from the cards of Reddit's page, which leaves out its ads. */
export function parseRedditPosts(html: string, handle: string): WatchFetchResult {
  const posts: WatchFetchResult['posts'] = []
  let avatar: string | undefined
  for (const [card] of html.matchAll(/<shreddit-post\s[\s\S]*?<\/shreddit-post>/g)) {
    const tag = card.match(/^<shreddit-post\s[^>]*>/)?.[0] || ''
    const id = htmlAttribute(tag, 'id')?.replace(/^t3_/, '')
    const permalink = htmlAttribute(tag, 'permalink')
    if (!id || !permalink || /\s(?:post-)?promoted[\s>=]/.test(tag)) continue
    // A user's own picture is on each of their posts.
    if (!avatar && handle.startsWith('u/') && htmlAttribute(tag, 'author')?.toLowerCase() === handle.slice(2).toLowerCase()) {
      avatar = htmlAttribute(tag, 'icon')
    }
    const link = htmlAttribute(tag, 'content-href')
    const body = card.match(/-post-rtjson-content"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    const text = body ? redditBodyText(body) : ''
    const { media, cover } = redditCardMedia(card, link)
    posts.push({
      id,
      site: 'reddit',
      handle,
      url: `https://www.reddit.com${permalink}`,
      text: redditPostText(htmlAttribute(tag, 'post-title') || '', text, link),
      image: cover || media[0]?.url,
      media,
      mediaComplete: true,
      createdAtMs: redditTime(htmlAttribute(tag, 'created-timestamp')),
    })
  }
  // A page without posts is what Reddit answers with for a name it does not have.
  if (!posts.length) {
    throw new Error('no posts')
  }
  return { info: { avatar }, posts }
}

/** A subreddit's picture, from its card; none when it has the one Reddit gives all. */
export const parseRedditCommunityCard = (html: string) => {
  const src = html.match(/<img\s[^>]*src="(https:\/\/styles\.redditmedia\.com\/[^"]*communityIcon[^"]*)"/)?.[1]
  return src ? decodeEntities(src) : undefined
}

// --- TikTok -----------------------------------------------------------------

// What TikTok's video files are asked for with: the cookie of the page they were read from, as the
// address is made for it, and its site as the referer.
export const TIKTOK_REFERER = 'https://www.tiktok.com/'

export const tiktokVideoHeaders = (chainToken: string | undefined): Record<string, string> | undefined =>
  chainToken ? { cookie: `tt_chain_token=${chainToken}`, referer: TIKTOK_REFERER } : undefined

/** The cookie TikTok makes its video addresses for, from a cookie header or the set-cookie of an answer. */
export const parseTikTokChainToken = (cookies: string | null | undefined) =>
  cookies?.match(/(?:^|[;,]\s*)tt_chain_token=([^;,\s]+)/)?.[1]

/** The page of one post, which has all its photos or its video: /video/ for both, as a photo's own page comes without them. */
export const tiktokPostPageUrl = (post: Pick<WatchPost, 'handle' | 'id'>) =>
  `https://www.tiktok.com/@${post.handle}/video/${post.id}`

const tiktokImageUrl = (image: any): string | undefined => {
  const list = image?.imageURL?.urlList
  return Array.isArray(list) && typeof list[0] === 'string' ? list[0] : undefined
}

/** The photos of a photo post, or its video, with its cover. */
const tiktokMedia = (item: any, headers?: Record<string, string>): WatchMedia[] => {
  const images = item?.imagePost?.images
  if (Array.isArray(images) && images.length) {
    return images.flatMap((image: any): WatchMedia[] => {
      const url = tiktokImageUrl(image)
      return url ? [{ type: 'image', url, width: image.imageWidth || undefined, height: image.imageHeight || undefined }] : []
    })
  }
  const video = item?.video
  if (!video?.playAddr) return []
  return [
    {
      type: 'video',
      url: video.playAddr,
      thumb: video.cover || video.originCover || undefined,
      width: video.width || undefined,
      height: video.height || undefined,
      ...(headers ? { headers } : {}),
    },
  ]
}

const tiktokPost = (item: any, handle: string, headers?: Record<string, string>): WatchFetchResult['posts'][number] | null => {
  if (!item?.id || item.isAd) return null
  const media = tiktokMedia(item, headers)
  const photo = Boolean(item.imagePost)
  const author = item.author?.uniqueId || handle
  return {
    id: String(item.id),
    site: 'tiktok',
    handle,
    url: `https://www.tiktok.com/@${author}/${photo ? 'photo' : 'video'}/${item.id}`,
    // Its lines are apart by line separators, which are not drawn as such.
    text: (item.desc || '').replace(/[\u2028\u2029]/g, '\n'),
    image: item.imagePost?.cover ? tiktokImageUrl(item.imagePost.cover) : media[0]?.thumb || media[0]?.url,
    media,
    mediaComplete: true,
    createdAtMs: (Number(item.createTime) || 0) * 1000,
  }
}

/**
 * Reads the posts of a TikTok profile from the answers its page asked for them with, as the hidden
 * webview keeps them: newest first, but those pinned to the top. `chainToken` is the cookie
 * the webview had, which its video addresses only work with.
 */
export function parseTikTokItemLists(html: string, handle: string, chainToken?: string): WatchFetchResult {
  const headers = tiktokVideoHeaders(chainToken)
  const posts: WatchFetchResult['posts'] = []
  const pinnedIds: string[] = []
  const seen = new Set<string>()
  let info: WatchProfileInfo = {}
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let json: any
    try {
      json = JSON.parse(match[1])
    } catch {
      continue
    }
    if (!Array.isArray(json?.itemList)) continue
    for (const item of json.itemList) {
      const post = tiktokPost(item, handle, headers)
      if (!post || seen.has(post.id)) continue
      seen.add(post.id)
      posts.push(post)
      if (item.isPinnedItem) pinnedIds.push(post.id)
      if (!info.name && item.author?.uniqueId?.toLowerCase() === handle.toLowerCase()) {
        info = { name: item.author.nickname || undefined, avatar: item.author.avatarLarger || item.author.avatarMedium || undefined }
      }
    }
  }
  if (!posts.length) {
    throw new Error('no posts in the page')
  }
  return { info, posts, pinnedIds }
}

/** The media of one post, and its cover, from its own page, read without the webview; `chainToken` is the cookie that page set. */
export function parseTikTokPostPage(html: string, chainToken?: string): { media: WatchMedia[]; cover?: string } {
  const data = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  let item: any
  try {
    item = data ? JSON.parse(data)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct : undefined
  } catch {}
  const post = item ? tiktokPost(item, item.author?.uniqueId || '', tiktokVideoHeaders(chainToken)) : null
  if (!post?.media?.length) {
    throw new Error('no media in the post page')
  }
  return { media: post.media, cover: post.image }
}

/** How long ago a post was made, short as the sites show it: 5m, 3h, 2d, or its date after a week. */
export function formatPostAge(createdAtMs: number, now: number, locale?: string) {
  const minutes = Math.max(0, Math.floor((now - createdAtMs) / 60000))
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(createdAtMs).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

// --- how often --------------------------------------------------------------

/** The choices for how often a profile is checked, in minutes. */
export const WATCH_INTERVAL_OPTIONS = [15, 30, 60, 180, 360, 720, 1440]

export const DEFAULT_WATCH_INTERVAL_MINUTES = 60

// The system does not run a background task more often than this.
export const MIN_BACKGROUND_INTERVAL_MINUTES = 15

/** How often a profile is checked: its own choice, or else the one for all. */
export const watchIntervalMinutes = (profile: { checkIntervalMinutes?: number }, defaultMinutes: number) =>
  profile.checkIntervalMinutes || defaultMinutes

/** How often the background task has to run for the profile checked most often. */
export const backgroundIntervalMinutes = (profiles: { checkIntervalMinutes?: number }[], defaultMinutes: number) =>
  Math.max(MIN_BACKGROUND_INTERVAL_MINUTES, Math.min(...profiles.map((profile) => watchIntervalMinutes(profile, defaultMinutes))))

// A refresh by hand does not ask again for a profile checked this recently, however often it is tapped.
export const MANUAL_REFRESH_COOLDOWN_MS = 30 * 1000

interface DueProfile {
  key: string
  checkIntervalMinutes?: number
  lastCheckedAt?: number
  retryAfter?: number
}

/**
 * The profiles a run checks, the ones checked longest ago first: by hand, all of those asked
 * for (all when none are named) unless just checked; otherwise those whose interval is up.
 */
export function dueWatchProfiles<T extends DueProfile>(
  profiles: T[],
  { manual, keys, now, defaultMinutes }: { manual: boolean; keys?: string[]; now: number; defaultMinutes: number },
): T[] {
  return (
    profiles
      .filter((profile) => !keys || keys.includes(profile.key))
      // A refresh by hand tries again even a profile the site asked to wait with.
      .filter((profile) => manual || !profile.retryAfter || profile.retryAfter <= now)
      .filter((profile) => {
        if (!profile.lastCheckedAt) return true
        const since = now - profile.lastCheckedAt
        return manual ? since >= MANUAL_REFRESH_COOLDOWN_MS : since >= watchIntervalMinutes(profile, defaultMinutes) * 60000
      })
      .sort((a, b) => (a.lastCheckedAt || 0) - (b.lastCheckedAt || 0))
  )
}

/** An interval as the largest unit it is a whole number of. */
export function splitInterval(minutes: number): { unit: 'minutes' | 'hours' | 'days'; count: number } {
  if (minutes % 1440 === 0) return { unit: 'days', count: minutes / 1440 }
  if (minutes % 60 === 0) return { unit: 'hours', count: minutes / 60 }
  return { unit: 'minutes', count: minutes }
}

// --- kept media -------------------------------------------------------------

/** When a signed Instagram media address stops working: its `oe` parameter, seconds in hex. */
export const instagramUrlExpiresAt = (url: string): number | undefined => {
  const match = url.match(/[?&]oe=([0-9A-Fa-f]{8})(?:&|$)/)
  return match ? parseInt(match[1], 16) * 1000 : undefined
}

/** When a signed TikTok address stops working: its `expire` parameter for a video, `x-expires` for a photo, in seconds. */
export const tiktokUrlExpiresAt = (url: string): number | undefined => {
  const match = url.match(/[?&](?:x-)?expires?=(\d{9,11})(?:&|$)/)
  return match ? Number(match[1]) * 1000 : undefined
}

// A little ahead of the time itself: an address that works now may not by the time it is used.
const EXPIRY_MARGIN_MS = 10 * 60 * 1000

/** Whether an address of these media no longer works, or is about to stop: within `margin` of it. */
export const mediaExpired = (media: WatchMedia[] | undefined, now: number, margin = EXPIRY_MARGIN_MS) =>
  (media || []).some((item) =>
    [item.url, item.thumb].some((url) => {
      const expiresAt = url ? (instagramUrlExpiresAt(url) ?? tiktokUrlExpiresAt(url)) : undefined
      return expiresAt !== undefined && expiresAt - margin <= now
    }),
  )

/** The name a photo or video of a post is kept under. */
export const mediaKey = (postKey: string, index: number) => `${postKey}#${index}`

export const mediaPostKey = (key: string) => key.slice(0, key.lastIndexOf('#'))

export interface KeptMediaEntry {
  key: string
  bytes: number
  postCreatedAt: number
  usedAt: number
}

/**
 * What to delete of the kept media: that of posts no longer kept, and, while it all takes more
 * than the limit, that of the oldest posts, down to a little under the limit so it is not done
 * again at the next file.
 */
export function mediaToEvict(
  entries: KeptMediaEntry[],
  limitBytes: number,
  livePostKeys: Set<string>,
  // Files in use, being shown or saved, which are kept whatever they are.
  inUse: Set<string> = new Set(),
): string[] {
  const evict = entries
    .filter((entry) => !livePostKeys.has(mediaPostKey(entry.key)) && !inUse.has(entry.key))
    .map((entry) => entry.key)
  const live = entries.filter((entry) => livePostKeys.has(mediaPostKey(entry.key)))
  let total = live.reduce((sum, entry) => sum + entry.bytes, 0)
  if (total <= limitBytes) return evict
  const target = limitBytes * 0.9
  const oldestFirst = [...live].sort((a, b) => a.postCreatedAt - b.postCreatedAt || a.usedAt - b.usedAt)
  for (const entry of oldestFirst) {
    if (total <= target) break
    if (inUse.has(entry.key)) continue
    evict.push(entry.key)
    total -= entry.bytes
  }
  return evict
}

/** A name for a saved file that tells where it is from. */
export const mediaFileName = (post: Pick<WatchPost, 'site' | 'handle' | 'id'>, index: number, item: WatchMedia) =>
  // A handle can have a / (r/name) or an @ (user@host) in it, and an id be an address (Mastodon).
  `${post.site}_${fileSafe(post.handle)}_${fileSafe(post.id)}_${index + 1}.${mediaExtension(item)}`

const fileSafe = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, '_')

export const mediaExtension = (item: WatchMedia) => {
  if (item.type === 'video') return 'mp4'
  const match = item.url.match(/\.(png|webp|gif|jpe?g)(?:[?#]|$)/i)
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

export const mediaMimeType = (item: WatchMedia) => {
  const extension = mediaExtension(item)
  return extension === 'mp4' ? 'video/mp4' : `image/${extension === 'jpg' ? 'jpeg' : extension}`
}

/** How the list of watched sources is ordered: by name, or by the newest post, when watched, or the last good check. */
export type WatchSourceSort = 'name' | 'updated' | 'added' | 'synced'

export const WATCH_SOURCE_SORTS: WatchSourceSort[] = ['name', 'updated', 'added', 'synced']

/**
 * The sources in the order asked for: A to Z by name, newest first by time, or the other way round when
 * reversed. A source with no such time yet, as one never checked, comes last either way.
 */
export function sortWatchSources<
  T extends WatchTarget & { name?: string; addedAt: number; lastSuccessAt?: number; key: string },
>(sources: T[], newestPostAt: Record<string, number | undefined>, sort: WatchSourceSort, reversed = false): T[] {
  const time = (source: T): number | undefined => {
    if (sort === 'added') return source.addedAt
    if (sort === 'synced') return source.lastSuccessAt
    return newestPostAt[source.key]
  }
  const label = (source: T) => source.name || source.handle
  const direction = reversed ? -1 : 1
  return [...sources].sort((a, b) => {
    if (sort === 'name') return direction * label(a).localeCompare(label(b), undefined, { sensitivity: 'base' })
    const ta = time(a)
    const tb = time(b)
    if (ta === undefined || tb === undefined) return ta === tb ? 0 : ta === undefined ? 1 : -1
    return direction * (tb - ta)
  })
}

/**
 * The sources a feed has chips for, so that a long list stays short: those with unread posts first,
 * then the latest to post, up to the limit; the one shown is kept even when it is past it.
 */
export function feedChipSources<T extends WatchTarget & { name?: string; addedAt: number; lastSuccessAt?: number; key: string }>(
  sources: T[],
  newestPostAt: Record<string, number | undefined>,
  unreadSourceKeys: Set<string>,
  limit: number,
  selectedKey?: string,
): { shown: T[]; hidden: number } {
  const hasUnread = (source: T) => unreadSourceKeys.has(source.key)
  const byPost = sortWatchSources(sources, newestPostAt, 'updated')
  const ordered = [...byPost.filter(hasUnread), ...byPost.filter((source) => !hasUnread(source))]
  if (ordered.length <= limit) return { shown: ordered, hidden: 0 }
  const shown = ordered.slice(0, limit)
  const selected = selectedKey ? ordered.slice(limit).find((source) => source.key === selectedKey) : undefined
  if (selected) shown.push(selected)
  return { shown, hidden: ordered.length - shown.length }
}

/** The sources whose name, handle or site has the words typed, all of them, and that are on the site chosen, if any. */
export function filterWatchSources<T extends WatchTarget & { name?: string }>(sources: T[], query: string, site?: WatchSite): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return sources.filter((source) => {
    if (site && source.site !== site) return false
    const text = [source.name || '', source.handle, watchSiteLabels[source.site]].join(' ').toLowerCase()
    return words.every((word) => text.includes(word.replace(/^@/, '')))
  })
}

/** Some of the watched profiles, which a feed tab can show on their own. */
export interface WatchTimeline {
  id: string
  name: string
  profileKeys: string[]
  // Shown on the new tab page, next to the whole feed.
  pinned?: boolean
  // Only the posts with photos or videos, shown as a grid.
  mediaOnly?: boolean
}

// --- merging ----------------------------------------------------------------

// How many of a profile's latest posts are kept, unless another number is chosen.
export const DEFAULT_POSTS_PER_SOURCE = 100

// The sites whose sources are checked better with an account, taken from a Nora profile logged in to them.
export const WATCH_ACCOUNT_SITES: WatchSite[] = ['x', 'instagram', 'reddit', 'facebook']

export const POSTS_PER_SOURCE_OPTIONS = [50, 100, 200, 500, 1000]

export const postKey = (post: Pick<WatchPost, 'site' | 'id'>) => `${post.site}:${post.id}`

/**
 * Adds what a fetch found to what was already kept of one profile. The first fetch of a
 * profile only fills the feed: its posts were there before it was watched, so none is new.
 * A pinned post, which comes first whatever its age, is new only if it was never seen.
 */
export function mergeWatchPosts(
  existing: WatchPost[],
  fetched: WatchFetchResult['posts'],
  { now, initial, max = DEFAULT_POSTS_PER_SOURCE }: { now: number; initial: boolean; max?: number },
): { posts: WatchPost[]; fresh: WatchPost[] } {
  const fetchedByKey = new Map(fetched.map((post) => [postKey(post), post]))
  // What is kept of a post that was fetched again is brought up to date: its text can be edited.
  const updated = existing.map((post) => {
    const again = fetchedByKey.get(post.key)
    if (!again) return post
    // What the embed page told of a post is not lost to a fetch that only knows its cover: the
    // photos of a carousel kept on the phone stay reachable. Expired addresses of photos that are
    // not kept have the post read from its embed page again when they are needed.
    const keepMedia = post.mediaComplete && !again.mediaComplete
    return {
      ...post,
      ...again,
      key: post.key,
      firstSeenAt: post.firstSeenAt,
      ...(keepMedia ? { media: post.media, mediaComplete: true } : {}),
    }
  })
  const known = new Set(existing.map((post) => post.key))
  const newest = existing.reduce((max, post) => Math.max(max, post.createdAtMs), 0)
  const fresh: WatchPost[] = []
  for (const post of fetched) {
    const key = postKey(post)
    if (known.has(key)) {
      continue
    }
    known.add(key)
    // An old post that only now shows up (unpinned, or the list was cut short before) is
    // kept, but is not news.
    const isNew = !initial && post.createdAtMs >= newest
    fresh.push({ ...post, key, firstSeenAt: isNew ? now : 0 })
  }
  const posts = [...updated, ...fresh].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, max)
  const keptKeys = new Set(posts.map((post) => post.key))
  return { posts, fresh: fresh.filter((post) => post.firstSeenAt && keptKeys.has(post.key)) }
}
