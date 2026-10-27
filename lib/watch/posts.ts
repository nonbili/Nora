import type { WatchFetchResult, WatchMedia, WatchPost, WatchSite } from './types'
import { xPostTime } from './sites/x'

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
  // A post is kept by the key it was first kept with, which its id may since have changed from.
  const knownKeys = new Set(existing.map((post) => post.key))
  const keptByIdentity = new Map(existing.map((post) => [postKey(post), post.key]))
  // An X repost kept by its own id, as before both readers told it by the post it shares, is the
  // same repost as one fetched now that shares a post of the same profile with the same text, made
  // before it was reposted, with the same photos. Only such a one, and only when no other is like it
  // on either side: it is told so once, and its id is then the post it shares.
  // A photo or a cover by its address on X, whatever size is asked of it.
  const pictures = (media: WatchMedia[] | undefined) => (media || []).map((item) => (item.thumb || item.url).replace(/\?.*$/, '')).sort()
  // Its text and photos: one of photos only has no text.
  const repostKey = (post: { site: WatchSite; repostOf?: string; text: string; media?: WatchMedia[] }) =>
    post.site === 'x' && post.repostOf && (post.text || post.media?.length)
      ? `${post.repostOf.toLowerCase()}|${post.text}|${pictures(post.media).join(' ')}`
      : ''
  const isOldRepost = (post: WatchPost) =>
    Boolean(repostKey(post)) && post.url.toLowerCase() !== `https://x.com/${post.repostOf!.toLowerCase()}/status/${post.id}`
  const countBy = (keys: string[]) => keys.reduce((counts, key) => counts.set(key, (counts.get(key) || 0) + 1), new Map<string, number>())
  const oldRepostCounts = countBy(existing.filter(isOldRepost).map(repostKey))
  const unknownRepostCounts = countBy(
    fetched.filter((post) => !keptByIdentity.has(postKey(post)) && repostKey(post)).map(repostKey),
  )
  const oldReposts = new Map(
    existing
      .filter((post) => isOldRepost(post) && oldRepostCounts.get(repostKey(post)) === 1 && unknownRepostCounts.get(repostKey(post)) === 1)
      .map((post) => [repostKey(post), post]),
  )
  // The post it shares was made before it was reposted.
  const isOldRepostOf = (old: WatchPost | undefined, post: WatchFetchResult['posts'][number]) =>
    Boolean(old) && xPostTime(post.id) <= old!.createdAtMs
  const keyOf = (post: WatchFetchResult['posts'][number]) => {
    const key = postKey(post)
    if (knownKeys.has(key)) return key
    const old = oldReposts.get(repostKey(post))
    return keptByIdentity.get(key) || (isOldRepostOf(old, post) ? old!.key : key)
  }
  // A repost whose time is the post it shares was made after what comes after it: the timeline is
  // in the order things were posted or reposted. It is told as just after that, so it keeps its
  // place when sorted and when the oldest go; or as the time it was kept with, as a site that knows
  // when it was reposted told it. A pinned post, first whatever its age, comes after nothing.
  const keptTimes = new Map(existing.map((post) => [post.key, post.createdAtMs]))
  let after = 0
  const timed = fetched.map((post) => post)
  for (let i = fetched.length - 1; i >= 0; i--) {
    const { repostedAtUnknown, ...post } = fetched[i]
    const keptAt = keptTimes.get(keyOf(post))
    if (repostedAtUnknown) post.createdAtMs = keptAt ?? Math.max(post.createdAtMs, after + 1)
    timed[i] = post
    // As kept, too, which another reader may have told more exactly.
    after = Math.max(after, post.createdAtMs, keptAt ?? 0)
  }
  fetched = timed
  const fetchedByKey = new Map(fetched.map((post) => [keyOf(post), post]))
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
  const known = new Set(knownKeys)
  const newest = existing.reduce((max, post) => Math.max(max, post.createdAtMs), 0)
  const fresh: WatchPost[] = []
  for (const post of fetched) {
    const key = keyOf(post)
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
