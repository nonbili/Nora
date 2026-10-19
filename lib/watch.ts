/** Watching a profile on X or Instagram: which page is a profile, and reading its latest posts. */

import { getProfileUsername, isInstagramHost } from './instagram'

export type WatchSite = 'x' | 'instagram'

export interface WatchTarget {
  site: WatchSite
  handle: string
}

export interface WatchPost {
  key: string
  id: string
  site: WatchSite
  handle: string
  url: string
  text: string
  image?: string
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
    return again ? { ...post, ...again, key: post.key, firstSeenAt: post.firstSeenAt } : post
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
