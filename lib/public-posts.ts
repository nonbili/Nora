/**
 * Public posts of a profile found through DuckDuckGo, for the places where a site
 * only shows the first screenful of a profile without an account. They are what the
 * search engine has indexed, not the profile's feed: no media, no guarantee that
 * every post is there, and the order is the engine's -- so the date is read from
 * the result and the list is sorted by it here.
 */

import { INSTAGRAM_POST_KINDS, INSTAGRAM_USERNAME_PATTERN, isInstagramHost, isInstagramUsername } from './instagram'

export interface SearchResult {
  url: string
  title: string
  snippet: string
}

export interface PublicPost {
  url: string
  shortcode: string
  /** Epoch milliseconds, UTC, or null when the result carries no date. */
  date: number | null
  caption: string
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return entities[entity.toLowerCase()] ?? match
  })
}

const stripTags = (value: string) => decodeEntities(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

/** DuckDuckGo wraps every result link in a redirect that carries the real address. */
export function unwrapResultUrl(href: string) {
  try {
    const url = new URL(decodeEntities(href), 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg')
    return target ?? url.toString()
  } catch {
    return null
  }
}

/** Reads the results out of the HTML page of DuckDuckGo (`html.duckduckgo.com/html/`). */
export function parseSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = []
  const blocks = html.split(/<div class="result results_links/).slice(1)
  for (const block of blocks) {
    const link = block.match(/<a [^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/)
    if (!link) {
      continue
    }
    const url = unwrapResultUrl(link[1])
    if (!url) {
      continue
    }
    const snippet = block.match(/<a [^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
    results.push({ url, title: stripTags(link[2]), snippet: snippet ? stripTags(snippet[1]) : '' })
  }
  return results
}

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function parseSnippetDate(text: string) {
  const match = text.match(/\bon ([A-Z][a-z]+) (\d{1,2}), (\d{4})\b/)
  if (!match) {
    return null
  }
  const month = months.indexOf(match[1].toLowerCase())
  return month === -1 ? null : Date.UTC(Number(match[3]), month, Number(match[2]))
}

/**
 * Whether a text names a profile, as a whole name: `john.doe` is not named by `john_doe`, nor `john` by
 * `john.doe`. A full stop that ends a sentence after the name does not count against it.
 */
export function mentionsUsername(text: string, username: string) {
  const name = username.replace(/[^\w.]/g, '').replace(/\./g, '\\.')
  return Boolean(name) && new RegExp(`(^|[^\\w.])${name}(?!\\w|\\.\\w)`, 'i').test(text)
}

/** The post a result points at, with what its description says about it. Null for anything else. */
export function toInstagramPost(result: SearchResult, username: string): PublicPost | null {
  let path: string[]
  try {
    const url = new URL(result.url)
    if (!isInstagramHost(url.hostname)) {
      return null
    }
    path = url.pathname.split('/').filter(Boolean)
  } catch {
    return null
  }

  // /<username>/p/<code>, /<username>/reel/<code>, or the profile-less /p/<code>.
  const offset = path[0]?.toLowerCase() === username.toLowerCase() ? 1 : 0
  const kind = path[offset]
  const shortcode = path[offset + 1]
  if (!INSTAGRAM_POST_KINDS.includes(kind) || !shortcode || path.length !== offset + 2) {
    return null
  }
  // A result for another account's post that merely mentions this one is not this profile's.
  if (offset === 0 && !mentionsUsername(result.snippet.slice(0, 160), username)) {
    return null
  }

  const caption = result.snippet.match(/: "([\s\S]*?)"?$/)
  return {
    url: result.url,
    shortcode,
    date: parseSnippetDate(result.snippet),
    caption: caption?.[1]?.trim() ?? '',
  }
}

/**
 * What to add below a profile: the posts that are not already on the page, once
 * each, newest first. A post without a date goes last rather than being dropped.
 */
export function continuePosts(posts: PublicPost[], shownShortcodes: Iterable<string>) {
  const shown = new Set(shownShortcodes)
  const seen = new Set<string>()
  const fresh = posts.filter((post) => {
    if (shown.has(post.shortcode) || seen.has(post.shortcode)) {
      return false
    }
    seen.add(post.shortcode)
    return true
  })
  return fresh.sort((a, b) => {
    if (a.date === b.date) {
      return 0
    }
    if (a.date === null) {
      return 1
    }
    if (b.date === null) {
      return -1
    }
    return b.date - a.date
  })
}

const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/'
// On the address of a search the app opened, so that the same search typed by hand is left alone.
const SEARCH_MARK = '#nora'

/** The search that lists a profile's posts, or null for a name that is not a profile name. */
export function buildProfileSearchQuery(username: string) {
  return isInstagramUsername(username) ? `site:instagram.com/${username}/` : null
}

/**
 * The same search on DuckDuckGo's own page, in a tab of the browser, which is where a person
 * can deal with a check themselves. It is the HTML page of the search, the one that is read
 * for the results, and so the posts found there can be added to the profile once it has loaded.
 */
export function buildProfileSearchPageUrl(username: string) {
  const query = buildProfileSearchQuery(username)
  return query ? `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}${SEARCH_MARK}` : null
}

const PROFILE_QUERY = new RegExp(`^site:instagram\\.com/(${INSTAGRAM_USERNAME_PATTERN})/$`)

/** The profile a search page of `buildProfileSearchPageUrl` is for, or null for any other address. */
export function getSearchPageUsername(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.origin + parsed.pathname !== SEARCH_ENDPOINT || parsed.hash !== SEARCH_MARK) {
      return null
    }
    const match = parsed.searchParams.get('q')?.match(PROFILE_QUERY)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** The offset a page of results starts at: DuckDuckGo's own `s`, which a search of a profile starts without. */
export function getSearchPageOffset(url: string) {
  try {
    const offset = Number(new URL(url).searchParams.get('s') ?? 0)
    return Number.isInteger(offset) && offset >= 0 ? offset : 0
  } catch {
    return 0
  }
}

/**
 * Which of the forms on a page of results goes on to the next one, as an index, or -1 at the last page.
 * A page after the first has a Previous form as well as a Next one, and what tells them apart is where
 * they lead: the next page starts further than the one on screen, the previous one before it.
 */
export function pickNextForm(offsets: number[], currentOffset: number) {
  let best = -1
  offsets.forEach((offset, index) => {
    if (Number.isFinite(offset) && offset > currentOffset && (best === -1 || offset < offsets[best])) {
      best = index
    }
  })
  return best
}

/** Where a search stopped, which is what DuckDuckGo needs to give the pages after it. */
export interface SearchContinuation {
  offset: number
  dc: number
  vqd: string
  kl: string
  nextParams: string
}

/** A continuation as a search page reports it, or null for anything that is not one. */
export function parseContinuation(value: unknown): SearchContinuation | null {
  const { offset, dc, vqd, kl, nextParams } = (value || {}) as Record<string, unknown>
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 1 || offset > 1000) {
    return null
  }
  if (typeof dc !== 'number' || !Number.isInteger(dc) || dc < 1 || dc > 1100) {
    return null
  }
  if (typeof vqd !== 'string' || !/^[\w-]{1,120}$/.test(vqd) || typeof kl !== 'string' || !/^[A-Za-z-]{2,12}$/.test(kl)) {
    return null
  }
  if (typeof nextParams !== 'string' || !/^[\w.=&%-]{0,200}$/.test(nextParams)) {
    return null
  }
  return { offset, dc, vqd, kl, nextParams }
}

/** The address of the page of results a search stopped before, for the same search of a profile. */
export function buildContinuationPageUrl(username: string, continuation: SearchContinuation) {
  const query = buildProfileSearchQuery(username)
  if (!query) {
    return null
  }
  const params = new URLSearchParams({
    q: query,
    s: String(continuation.offset),
    nextParams: continuation.nextParams,
    v: 'l',
    o: 'json',
    dc: String(continuation.dc),
    api: 'd.js',
    vqd: continuation.vqd,
    kl: continuation.kl,
  })
  return `${SEARCH_ENDPOINT}?${params}${SEARCH_MARK}`
}

/**
 * Whether the page is a page of results, or says there are none, as opposed to anything else that
 * could be in its place: a check in a form this does not know, an error, a redesign. Only a page
 * that is one or the other is reported, so a page that is neither is left in front of the person.
 */
export function isResultsPage(html: string) {
  return parseSearchResults(html).length > 0 || /class="no-results"|No results found/i.test(html)
}

/**
 * Whether the page is DuckDuckGo asking for proof of a person instead of results.
 * It is never answered or worked around: the caller sends the person to the page.
 */
export function isChallengePage(html: string) {
  // Without the query the page echoes: a profile can be called `captcha.memes`.
  const page = html.replace(/site(?::|%3A)instagram\.com(?:\/|%2F)[A-Za-z0-9._]+/gi, '')
  return parseSearchResults(html).length === 0 && /anomaly|captcha|challenge-form|unusual traffic/i.test(page)
}

/** How many posts of a profile Instagram shows without an account, and so how many of the newest results are left out. */
export const POSTS_SHOWN_WITHOUT_LOGIN = 12
export const POSTS_PER_PAGE = 12

/**
 * Instagram's own embed page for a post, which is how other sites show one with its
 * picture. Null for an address that is not a post of Instagram.
 */
export function toEmbedUrl(post: Pick<PublicPost, 'url'>) {
  try {
    const url = new URL(post.url)
    const path = url.pathname.split('/').filter(Boolean)
    const kindIndex = path.findIndex((part) => INSTAGRAM_POST_KINDS.includes(part))
    const shortcode = path[kindIndex + 1]
    if (kindIndex === -1 || !shortcode || !isInstagramHost(url.hostname)) {
      return null
    }
    return `https://www.instagram.com/${path[kindIndex]}/${encodeURIComponent(shortcode)}/embed/`
  } catch {
    return null
  }
}

/**
 * What a page may ask the app to open in a tab of its own, from the Anonymous profile: DuckDuckGo's
 * page that searches for the posts of one profile. Anything else a page asks for is refused, so a
 * page cannot use this to open whatever address it likes in that profile.
 */
export function parseProfileSearchRequest(url: unknown) {
  if (typeof url !== 'string') {
    return null
  }
  const username = getSearchPageUsername(url)
  if (!username) {
    return null
  }
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return null
  }
  return { url: parsed.toString(), username }
}
