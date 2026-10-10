import {
  POSTS_PER_PAGE,
  POSTS_SHOWN_WITHOUT_LOGIN,
  buildProfileSearchPageUrl,
  continuePosts,
  toEmbedUrl,
  toInstagramPost,
  type PublicPost,
  type SearchContinuation,
  type SearchResult,
} from './public-posts'

export interface MorePostCard {
  embedUrl: string
  caption: string
}

/** The words the list shows, resolved by the app so that the page needs no translation. */
export interface MorePostsLabels {
  title: string
  more: string
  openPost: string
  note: string
  error: string
  empty: string
  continue: string
  continueHint: string
  searching: string
  unavailable: string
  retry: string
}

export interface MorePostsPayload {
  username: string
  page: number
  /** `idle`: nothing has been searched for yet, and the list offers to. */
  status: 'idle' | 'ok' | 'error'
  posts: MorePostCard[]
  hasMore: boolean
  /** DuckDuckGo's page for the search, which the page asks the app to open. */
  searchUrl: string | null
}

const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  at: number
  posts: PublicPost[]
  /** Where the search stopped, when DuckDuckGo has pages after it. */
  next: SearchContinuation | null
  /** The newest posts of the first search, which the profile shows itself, and how far back they go. */
  skipped: Set<string>
  cutoff: number | null
  /** How many batches of pages have been read, which is capped so that a long profile is not searched without end. */
  batches: number
}

export const MAX_SEARCH_BATCHES = 5

const cache = new Map<string, CacheEntry>()

const freshEntry = (username: string, now: number) => {
  const entry = cache.get(username.toLowerCase())
  return entry && now - entry.at <= CACHE_TTL_MS ? entry : undefined
}

/**
 * One page of what to show below a profile, from what a search found. Nothing is searched for
 * here: the person asks for that, and what it finds is kept for a while so that showing more
 * reads from it. Until then, and once it has gone stale, the list offers to search.
 */
export function getMorePostsPage(username: string, page: number, now = Date.now()): MorePostsPayload {
  const searchUrl = buildProfileSearchPageUrl(username)
  const entry = freshEntry(username, now)
  if (!entry) {
    return { username, page, status: 'idle', posts: [], hasMore: false, searchUrl }
  }
  // A list that is being read does not go stale under the person.
  entry.at = now

  const start = Math.max(0, page) * POSTS_PER_PAGE
  const cards: MorePostCard[] = []
  for (const post of entry.posts.slice(start, start + POSTS_PER_PAGE)) {
    const embedUrl = toEmbedUrl(post)
    if (embedUrl) {
      cards.push({ embedUrl, caption: post.caption })
    }
  }
  return { username, page, status: 'ok', posts: cards, hasMore: start + POSTS_PER_PAGE < entry.posts.length || entry.next !== null, searchUrl }
}

/** What the search found for a profile, read in the same way for any way of getting it. */
export function storeSearchResults(
  username: string,
  results: SearchResult[],
  next: SearchContinuation | null = null,
  now = Date.now(),
  shownShortcodes: string[] = [],
) {
  const posts = results.map((result) => toInstagramPost(result, username)).filter((post): post is PublicPost => post !== null)
  // The posts the profile shows itself are left out by their codes, which the page reads off its grid.
  const shown = new Set(shownShortcodes)
  const sorted = continuePosts(posts, shown)
  // Tiles the page could not read are taken to be as many of the newest that are left.
  const assumed = sorted.slice(0, Math.max(0, POSTS_SHOWN_WITHOUT_LOGIN - shown.size))
  const dates = assumed.map((post) => post.date).filter((date): date is number => date !== null)
  cache.set(username.toLowerCase(), {
    at: now,
    posts: sorted.slice(assumed.length),
    next,
    skipped: new Set([...shown, ...assumed.map((post) => post.shortcode)]),
    cutoff: dates.length ? Math.min(...dates) : null,
    batches: 1,
  })
}

/**
 * Adds what a later search of the same profile found, after what is there: the list is not
 * reshuffled under the person, so each batch is newest first by itself. Posts the first search left
 * out for the profile's own, and any newer than the oldest of those, are the profile's and stay out.
 * Returns how many were added; a batch with none ends the search.
 */
export function appendSearchResults(username: string, results: SearchResult[], next: SearchContinuation | null, now = Date.now()) {
  const entry = freshEntry(username, now)
  if (!entry) {
    return 0
  }
  const known = new Set([...entry.skipped, ...entry.posts.map((post) => post.shortcode)])
  const posts = results
    .map((result) => toInstagramPost(result, username))
    .filter((post): post is PublicPost => post !== null)
    .filter((post) => !known.has(post.shortcode) && (post.date === null || entry.cutoff === null || post.date < entry.cutoff))
  const added = continuePosts(posts, [])
  entry.posts.push(...added)
  entry.batches += 1
  entry.next = added.length && entry.batches < MAX_SEARCH_BATCHES ? next : null
  entry.at = now
  return added.length
}

/** Where to carry the search on from, when the list is at its end and DuckDuckGo has more. */
export function getContinuation(username: string, now = Date.now()) {
  return freshEntry(username, now)?.next ?? null
}

/** Whether a page of the list cannot be filled from what was found and a search may find the rest. */
export function needsMorePosts(username: string, page: number, now = Date.now()) {
  const entry = freshEntry(username, now)
  return Boolean(entry?.next) && (Math.max(0, page) + 1) * POSTS_PER_PAGE > (entry?.posts.length ?? 0)
}

export function clearMorePostsCache() {
  cache.clear()
}

/** What the app hands the page: a page of the list and the words to show it with. */
export type MorePostsMessage = MorePostsPayload & { labels: MorePostsLabels }
