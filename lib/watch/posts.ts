import type { WatchFetchResult, WatchPost, WatchSite } from './types'

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
