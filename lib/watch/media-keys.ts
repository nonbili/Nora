import type { WatchMedia, WatchPost, WatchSite } from './types'

/** Whether the addresses of a post's media expire, so that the post is read again for new ones. */
export const refreshesMedia = (site: WatchSite) =>
  site === 'instagram' || site === 'threads' || site === 'facebook' || site === 'tiktok'

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
