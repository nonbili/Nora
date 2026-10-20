/**
 * Watching a profile on X, Instagram, Threads, Bluesky or Mastodon, or a subreddit or user on
 * Reddit: which page is one, and reading its latest posts.
 */

import { getProfileUsername, isInstagramHost } from './instagram'

export type WatchSite = 'x' | 'instagram' | 'threads' | 'bluesky' | 'mastodon' | 'reddit'

export const watchSiteLabels: Record<WatchSite, string> = {
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  reddit: 'Reddit',
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
  }
}

/** How a source is named to the user: @handle, but a subreddit or user of Reddit as Reddit has it, r/name or u/name. */
export const watchSourceLabel = ({ site, handle }: WatchTarget) => (site === 'reddit' ? handle : `@${handle}`)

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

/** The page of one post, which has all its photos and videos, as a profile page does for its newest. */
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
export const refreshesMedia = (site: WatchSite) => site === 'instagram' || site === 'threads'

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
      mediaComplete: true,
      createdAtMs: Date.parse(status.created_at) || 0,
      repostOf: status.reblog ? shown.account?.acct : undefined,
    })
  }
  const url = typeof account?.url === 'string' && /^https:\/\//.test(account.url) ? account.url : undefined
  return { info: { name: account?.display_name || undefined, avatar: account?.avatar || undefined, url }, posts }
}

// --- Reddit -----------------------------------------------------------------

/** The newest posts of a subreddit, r/name, or of a user, u/name, as a feed: it needs no account. */
export const redditFeedUrl = (handle: string) =>
  handle.startsWith('u/')
    ? `https://www.reddit.com/user/${encodeURIComponent(handle.slice(2))}/submitted/.rss`
    : `https://www.reddit.com/r/${encodeURIComponent(handle.slice(2))}/new/.rss`

const xmlTag = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]

const xmlAttribute = (xml: string, tag: string, attribute: string) => {
  const value = xml.match(new RegExp(`<${tag}\\s[^>]*${attribute}="([^"]*)"`))?.[1]
  return value === undefined ? undefined : decodeEntities(value)
}

const REDDIT_IMAGE = /^https:\/\/(?:i\.redd\.it|i\.imgur\.com)\/[^?#]+\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i

// Links that are of the post itself, not one it shares.
const REDDIT_OWN_LINK = /^https:\/\/(?:(?:www\.)?reddit\.com|v\.redd\.it|i\.redd\.it)\//

/**
 * Reads the posts of a feed of Reddit. Only a single photo comes as the post's media; a gallery
 * or a video only as its cover, which opens the post.
 */
export function parseRedditFeed(xml: string, handle: string): WatchFetchResult {
  if (!/<feed[\s>]/.test(xml)) {
    throw new Error('no feed')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const [entry] of xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
    const id = xmlTag(entry, 'id')?.replace(/^t3_/, '')
    const url = xmlAttribute(entry, 'link', 'href')
    if (!id || !url) continue
    // The content is HTML, given as text of the feed.
    const html = decodeEntities(xmlTag(entry, 'content') || '')
    const link = html.match(/<a href="([^"]*)">\[link\]<\/a>/)?.[1]
    const linkUrl = link ? decodeEntities(link) : undefined
    const body = html.match(/<div class="md">([\s\S]*?)<\/div>/)?.[1]
    const thumb = xmlAttribute(entry, 'media:thumbnail', 'url')
    const media: WatchMedia[] = linkUrl && REDDIT_IMAGE.test(linkUrl) ? [{ type: 'image', url: linkUrl, thumb }] : []
    const title = decodeEntities(xmlTag(entry, 'title') || '')
    const shared = linkUrl && !REDDIT_OWN_LINK.test(linkUrl) ? linkUrl : undefined
    posts.push({
      id,
      site: 'reddit',
      handle,
      url,
      text: [title, body ? htmlToText(body, 'https://www.reddit.com') : '', shared].filter(Boolean).join('\n\n'),
      image: thumb || media[0]?.url,
      media,
      mediaComplete: true,
      createdAtMs: Date.parse(xmlTag(entry, 'published') || xmlTag(entry, 'updated') || '') || 0,
    })
  }
  const feedHead = xml.split('<entry>')[0]
  return { info: { avatar: xmlTag(feedHead, 'logo')?.trim() || undefined }, posts }
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

// A little ahead of the time itself: an address that works now may not by the time it is used.
const EXPIRY_MARGIN_MS = 10 * 60 * 1000

/** Whether an address of these media no longer works, or is about to stop. */
export const mediaExpired = (media: WatchMedia[] | undefined, now: number) =>
  (media || []).some((item) =>
    [item.url, item.thumb].some((url) => {
      const expiresAt = url ? instagramUrlExpiresAt(url) : undefined
      return expiresAt !== undefined && expiresAt - EXPIRY_MARGIN_MS <= now
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
}

// --- merging ----------------------------------------------------------------

// How many of a profile's latest posts are kept, unless another number is chosen.
export const DEFAULT_POSTS_PER_SOURCE = 100

// The sites whose sources are checked better with an account, taken from a Nora profile logged in to them.
export const WATCH_ACCOUNT_SITES: WatchSite[] = ['x', 'instagram']

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
