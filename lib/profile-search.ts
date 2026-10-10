import {
  appendSearchResults,
  getContinuation,
  getMorePostsPage,
  needsMorePosts,
  storeSearchResults,
  type MorePostsPayload,
} from './more-posts'
import { buildContinuationPageUrl, parseContinuation, parseProfileSearchRequest, type SearchResult } from './public-posts'
import { isInstagramUsername } from './instagram'

/**
 * A search for a profile's posts runs in a tab of its own that the person does not see unless
 * DuckDuckGo asks for a check, which only they can pass. This is the part that decides what a
 * page may ask for, which tab the posts go to, and when to give up. The tabs, the timers and the
 * pages are reached through `ProfileSearchPorts`, so none of it needs a browser to be tested.
 */
export interface ProfileSearchPorts {
  /** Opens the search page without switching to it. Undefined when no tab was opened. */
  openSearchTab: (url: string, parentTabId: string) => string | undefined
  /** Closes a search tab, which is not one to offer for reopening. */
  closeTab: (tabId: string) => void
  tabExists: (tabId: string) => boolean
  activeTabId: () => string | undefined
  activateTab: (tabId: string) => void
  sendToTab: (tabId: string, payload: MorePostsPayload) => void
  setInterval: (callback: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  now: () => number
}

/** A check the search page reports brings its tab forward at once; this is for one it does not recognise. */
export const SEARCH_CHECK_AFTER_MS = 20_000
export const SEARCH_GIVE_UP_AFTER_MS = 120_000
/** How many search tabs one tab may have opened for it within a minute, whatever its page asks for. */
export const MAX_SEARCHES_PER_MINUTE = 10
const MINUTE_MS = 60_000
const TICK_MS = 2_000

interface PendingSearch {
  parentTabId: string
  username: string
  startedAt: number
  timer: unknown
  shown: boolean
  /** Set for a search that carries an earlier one on, and the page of the list it is for. */
  continuationFor?: number
  /** The posts the profile shows itself, as its page read them off its grid. */
  shownShortcodes: string[]
}

const MAX_SHOWN_SHORTCODES = 60

/** The codes of the posts a profile page says it shows: a page's word, cut down to what a code can be. */
export function sanitizeShownShortcodes(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((code): code is string => typeof code === 'string' && /^[A-Za-z0-9_-]{5,40}$/.test(code))
    .slice(0, MAX_SHOWN_SHORTCODES)
}

export const MAX_SEARCH_RESULTS = 60
export const MAX_MORE_POSTS_PAGE = 50

/** What a search page reports is a page's word, and is cut down to what the list is made from. */
export function sanitizeSearchResults(value: unknown): SearchResult[] {
  return (Array.isArray(value) ? value : [])
    .slice(0, MAX_SEARCH_RESULTS)
    .filter((result) => typeof result?.url === 'string' && typeof result?.snippet === 'string')
    .map((result) => ({
      url: String(result.url).slice(0, 500),
      title: String(result.title ?? '').slice(0, 300),
      snippet: String(result.snippet).slice(0, 1500),
    }))
}

/** A request for a page of the list: a profile-shaped name and a page number in range. */
export function parseLoadMoreRequest(data: unknown) {
  const { username, page } = (data || {}) as { username?: unknown; page?: unknown }
  if (!isInstagramUsername(username)) {
    return null
  }
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > MAX_MORE_POSTS_PAGE) {
    return null
  }
  return { username, page }
}

export const isSearchHost = (host: string) => host === 'html.duckduckgo.com'

export function createProfileSearch(ports: ProfileSearchPorts) {
  const pending = new Map<string, PendingSearch>()
  // When search tabs were opened for a tab, to keep a page from having them opened without end.
  const opened = new Map<string, number[]>()

  const sendError = (parentTabId: string, username: string, page: number) =>
    ports.sendToTab(parentTabId, { ...getMorePostsPage(username, page), status: 'error' })

  const finish = (searchTabId: string) => {
    const entry = pending.get(searchTabId)
    if (entry) {
      ports.clearInterval(entry.timer)
      pending.delete(searchTabId)
    }
    return entry
  }

  // Closing the search tab is the end of it, and the person is only moved if it was the one in front:
  // anyone who has gone to another tab is left where they are.
  const close = (searchTabId: string, entry: PendingSearch) => {
    const wasInFront = ports.activeTabId() === searchTabId
    if (ports.tabExists(searchTabId)) {
      ports.closeTab(searchTabId)
    }
    if (wasInFront && ports.tabExists(entry.parentTabId)) {
      ports.activateTab(entry.parentTabId)
    }
  }

  const fail = (searchTabId: string) => {
    const entry = finish(searchTabId)
    if (!entry) {
      return
    }
    close(searchTabId, entry)
    if (ports.tabExists(entry.parentTabId)) {
      ports.sendToTab(entry.parentTabId, { ...getMorePostsPage(entry.username, entry.continuationFor ?? 0), status: 'error' })
    }
  }

  const tick = (searchTabId: string) => {
    const entry = pending.get(searchTabId)
    if (!entry) {
      return
    }
    // The person closed it, or the tab the posts were for: nothing is left to wait for.
    if (!ports.tabExists(searchTabId) || !ports.tabExists(entry.parentTabId)) {
      fail(searchTabId)
      return
    }
    // A tab the person was sent to and is still on is theirs to finish or close.
    if (entry.shown && ports.activeTabId() === searchTabId) {
      return
    }
    const elapsed = ports.now() - entry.startedAt
    if (elapsed >= SEARCH_GIVE_UP_AFTER_MS) {
      fail(searchTabId)
    } else if (elapsed >= SEARCH_CHECK_AFTER_MS) {
      show(searchTabId, entry)
    }
  }

  const show = (searchTabId: string, entry: PendingSearch) => {
    if (!entry.shown) {
      entry.shown = true
      ports.activateTab(searchTabId)
    }
  }

  const open = (parentTabId: string, username: string, url: string, continuationFor?: number, shownShortcodes: string[] = []) => {
    const now = ports.now()
    const recent = (opened.get(parentTabId) ?? []).filter((at) => now - at < MINUTE_MS)
    const searchTabId = recent.length < MAX_SEARCHES_PER_MINUTE ? ports.openSearchTab(url, parentTabId) : undefined
    if (!searchTabId) {
      opened.set(parentTabId, recent)
      sendError(parentTabId, username, continuationFor ?? 0)
      return false
    }
    opened.set(parentTabId, [...recent, now])
    const entry: PendingSearch = { parentTabId, username, startedAt: ports.now(), timer: undefined, shown: false, continuationFor, shownShortcodes }
    entry.timer = ports.setInterval(() => tick(searchTabId), TICK_MS)
    pending.set(searchTabId, entry)
    return true
  }

  /**
   * Whether a tab is already being searched for, for this profile. A search left over from another profile
   * the tab has since moved on from is dropped, so that the one asked for now can start.
   */
  const findSearch = (parentTabId: string, username: string) => {
    for (const [searchTabId, entry] of pending) {
      if (entry.parentTabId !== parentTabId) {
        continue
      }
      if (entry.username.toLowerCase() === username.toLowerCase()) {
        return entry
      }
      finish(searchTabId)
      close(searchTabId, entry)
      // Said to the tab all the same, for a page that is still, or again, on that profile.
      sendError(parentTabId, entry.username, entry.continuationFor ?? 0)
    }
    return undefined
  }

  /**
   * Carries the search on for a page of the list that what was found cannot fill. False when there is
   * nothing to carry on; true once the tab has been answered for, also when that answer is an error.
   */
  const more = (parentTabId: string, username: string, page: number) => {
    const continuation = getContinuation(username)
    const url = continuation && buildContinuationPageUrl(username, continuation)
    if (!url) {
      return false
    }
    // One at a time: the search under way answers the tab when it is done, for the page that is asked for now.
    const searching = findSearch(parentTabId, username)
    if (!searching) {
      open(parentTabId, username, url, page)
    } else if (searching.continuationFor !== undefined) {
      searching.continuationFor = page
    }
    return true
  }

  return {
    more,

    /**
     * A page asks for the search of a profile's posts. `allowed` is the app's side of it: the setting is
     * on, the tab is in the Anonymous profile and the page is Instagram.
     */
    start(parentTabId: string, data: unknown, allowed: boolean) {
      const request = allowed ? parseProfileSearchRequest((data as { url?: unknown } | null)?.url) : null
      if (!request) {
        return false
      }
      // One at a time for a tab: a page that asks again is not given more tabs.
      if (findSearch(parentTabId, request.username)) {
        return false
      }
      const shown = sanitizeShownShortcodes((data as { shown?: unknown }).shown)
      return open(parentTabId, request.username, request.url, undefined, shown)
    },

    /** The search tab reports what it found. Only the page of a search the app started is listened to. */
    complete(searchTabId: string, data: unknown, fromSearchPage: boolean) {
      const entry = pending.get(searchTabId)
      const { username, results, next } = (data || {}) as { username?: unknown; results?: unknown; next?: unknown }
      // Names are compared without case, as Instagram does.
      if (!entry || !fromSearchPage || typeof username !== 'string' || username.toLowerCase() !== entry.username.toLowerCase()) {
        return false
      }
      finish(searchTabId)
      const continuation = parseContinuation(next)
      const page = entry.continuationFor ?? 0
      if (entry.continuationFor === undefined) {
        storeSearchResults(entry.username, sanitizeSearchResults(results), continuation, undefined, entry.shownShortcodes)
      } else {
        appendSearchResults(entry.username, sanitizeSearchResults(results), continuation)
      }
      close(searchTabId, entry)
      if (!ports.tabExists(entry.parentTabId)) {
        return true
      }
      // A batch that left the page short is followed by the next one rather than showing half a page
      // that the list would then skip the rest of.
      if (needsMorePosts(entry.username, page) && more(entry.parentTabId, entry.username, page)) {
        return true
      }
      ports.sendToTab(entry.parentTabId, getMorePostsPage(entry.username, page))
      return true
    },

    /** The search page says it is a check, which only the person can pass. */
    challenge(searchTabId: string, fromSearchPage: boolean) {
      const entry = pending.get(searchTabId)
      if (!entry || !fromSearchPage) {
        return false
      }
      show(searchTabId, entry)
      return true
    },

  }
}
