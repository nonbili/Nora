/** Watching a profile on X or Instagram: which page is a profile, and reading its latest posts. */

import { getProfileUsername, isInstagramHost } from './instagram'

export type WatchSite = 'x' | 'instagram'

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
  return null
}

/** Handles are not case sensitive on either site, so a profile is told by its lower case handle. */
export const watchKey = ({ site, handle }: WatchTarget) => `${site}:${handle.toLowerCase()}`

export const watchProfileUrl = ({ site, handle }: WatchTarget) =>
  site === 'x' ? `https://x.com/${handle}` : `https://www.instagram.com/${handle}/`

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

const decodeEntities = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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
  `${post.site}_${post.handle}_${post.id}_${index + 1}.${mediaExtension(item)}`

export const mediaExtension = (item: WatchMedia) => {
  if (item.type === 'video') return 'mp4'
  const match = item.url.match(/\.(png|webp|gif|jpe?g)(?:[?#]|$)/i)
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

export const mediaMimeType = (item: WatchMedia) => {
  const extension = mediaExtension(item)
  return extension === 'mp4' ? 'video/mp4' : `image/${extension === 'jpg' ? 'jpeg' : extension}`
}

/**
 * A post as the given profile's list has it: a post two profiles share is in both lists, and each
 * copy is brought up to date with its own profile. Any profile's copy when that one has none.
 */
export function findWatchPost(postsByProfile: Record<string, WatchPost[] | undefined>, profileKey: string, key: string) {
  const own = postsByProfile[profileKey]?.find((post) => post.key === key)
  if (own) return own
  for (const posts of Object.values(postsByProfile)) {
    const post = posts?.find((candidate) => candidate.key === key)
    if (post) return post
  }
  return undefined
}

/**
 * The posts of several profiles as one list, newest first. A post two watched profiles share,
 * as a collaboration on Instagram, is in both their lists; it is shown once, as the first has it.
 */
export function uniquePostsNewestFirst(lists: (WatchPost[] | undefined)[]): WatchPost[] {
  const byKey = new Map<string, WatchPost>()
  for (const post of lists.flatMap((list) => list || [])) {
    if (!byKey.has(post.key)) byKey.set(post.key, post)
  }
  return [...byKey.values()].sort((a, b) => b.createdAtMs - a.createdAtMs)
}

/** Some of the watched profiles, which a feed tab can show on their own. */
export interface WatchTimeline {
  id: string
  name: string
  profileKeys: string[]
}

/**
 * The posts of these profiles not shown yet: first seen after a tab last showed one of the profiles
 * that have it, whichever view that was.
 */
export function unreadPostKeys(
  posts: Record<string, WatchPost[] | undefined>,
  profileKeys: string[],
  seenAtOf: (profileKey: string) => number,
): Set<string> {
  const wanted = new Set(profileKeys)
  const unread = new Set<string>()
  const read = new Set<string>()
  // Every profile is looked at: a post these share with another was read where that other was shown.
  for (const [profileKey, list] of Object.entries(posts)) {
    const seenAt = seenAtOf(profileKey)
    for (const post of list || []) {
      if (post.firstSeenAt <= seenAt) read.add(post.key)
      else if (wanted.has(profileKey)) unread.add(post.key)
    }
  }
  for (const key of read) unread.delete(key)
  return unread
}

// --- merging ----------------------------------------------------------------

export const MAX_POSTS_PER_PROFILE = 50

export const postKey = (post: Pick<WatchPost, 'site' | 'id'>) => `${post.site}:${post.id}`

/**
 * Adds what a fetch found to what was already kept of one profile. The first fetch of a
 * profile only fills the feed: its posts were there before it was watched, so none is new.
 * A pinned post, which comes first whatever its age, is new only if it was never seen.
 */
export function mergeWatchPosts(
  existing: WatchPost[],
  fetched: WatchFetchResult['posts'],
  { now, initial }: { now: number; initial: boolean },
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
  const posts = [...updated, ...fresh].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, MAX_POSTS_PER_PROFILE)
  const keptKeys = new Set(posts.map((post) => post.key))
  return { posts, fresh: fresh.filter((post) => post.firstSeenAt && keptKeys.has(post.key)) }
}
