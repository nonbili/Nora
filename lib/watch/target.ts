import { getProfileUsername, isInstagramHost } from '@/lib/instagram'
import type { WatchTarget } from './types'

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

export const isFacebookHost = (host: string) => /^(?:(?:www|m|web|mbasic|touch|mobile)\.)?facebook\.com$/.test(host)

// Paths on facebook.com that are a page of their own and not a page or profile, besides those of a .php file.
const facebookReservedPaths = new Set([
  'about', 'ads', 'bookmarks', 'business', 'campaign', 'checkpoint', 'composer', 'dialog', 'events', 'feeds',
  'find-friends', 'friends', 'fundraisers', 'games', 'gaming', 'groups', 'hashtag', 'help', 'jobs', 'latest', 'legal',
  'lite', 'live', 'login', 'logout', 'marketplace', 'me', 'memories', 'menu', 'messages', 'mobile', 'news',
  'notifications', 'offers', 'onthisday', 'pages', 'people', 'pg', 'photo', 'photos', 'places', 'plugins', 'policies',
  'privacy', 'recover', 'reel', 'reels', 'reg', 'saved', 'search', 'settings', 'share', 'sharer', 'stories', 'video',
  'videos', 'watch',
])

export const isFacebookName = (name: string) => !facebookReservedPaths.has(name.toLowerCase()) && !/\.php$/i.test(name)

// A page or profile by its name, or a profile without one by its number, and its tabs.
export const FACEBOOK_NAME_PATH = /^\/([A-Za-z0-9.]{1,50})(?:\/(?:posts|videos|photos|reels|about|featured))?\/?$/

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
