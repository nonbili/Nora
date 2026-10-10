import { beforeEach, describe, expect, it } from 'bun:test'
import {
  MAX_SEARCH_RESULTS,
  MAX_SEARCHES_PER_MINUTE,
  SEARCH_CHECK_AFTER_MS,
  SEARCH_GIVE_UP_AFTER_MS,
  createProfileSearch,
  isSearchHost,
  parseLoadMoreRequest,
  sanitizeSearchResults,
  sanitizeShownShortcodes,
  type ProfileSearchPorts,
} from './profile-search'
import { clearMorePostsCache, getMorePostsPage, needsMorePosts } from './more-posts'
import { buildProfileSearchPageUrl, POSTS_PER_PAGE, POSTS_SHOWN_WITHOUT_LOGIN } from './public-posts'
import type { MorePostsPayload } from './more-posts'
import { isInstagramHost } from './instagram'

const SEARCH_URL = buildProfileSearchPageUrl('nasa')!

function setup() {
  const state = {
    now: 0,
    tabs: new Set(['parent']),
    active: 'parent' as string | undefined,
    nextId: 1,
    openUrls: [] as string[],
    sent: [] as { tabId: string; payload: MorePostsPayload }[],
    activated: [] as string[],
    timers: new Map<number, () => void>(),
    openReturnsNothing: false,
  }
  let timerId = 0
  const ports: ProfileSearchPorts = {
    openSearchTab: (url) => {
      if (state.openReturnsNothing) return undefined
      const id = `search${state.nextId++}`
      state.tabs.add(id)
      state.openUrls.push(url)
      return id
    },
    closeTab: (tabId) => {
      state.tabs.delete(tabId)
      if (state.active === tabId) state.active = undefined
    },
    tabExists: (tabId) => state.tabs.has(tabId),
    activeTabId: () => state.active,
    activateTab: (tabId) => {
      state.active = tabId
      state.activated.push(tabId)
    },
    sendToTab: (tabId, payload) => state.sent.push({ tabId, payload }),
    setInterval: (callback) => {
      state.timers.set(++timerId, callback)
      return timerId
    },
    clearInterval: (handle) => void state.timers.delete(handle as number),
    now: () => state.now,
  }
  const search = createProfileSearch(ports)
  const advance = (ms: number) => {
    state.now += ms
    for (const callback of [...state.timers.values()]) callback()
  }
  return { state, search, advance }
}

const results = [
  { url: 'https://www.instagram.com/nasa/p/abc12/', title: '', snippet: '1K likes, 2 comments - nasa on May 1, 2026: "x"' },
]

beforeEach(() => clearMorePostsCache())

describe('start', () => {
  it('opens the search page for a profile, out of sight', () => {
    const { state, search } = setup()
    expect(search.start('parent', { url: SEARCH_URL }, true)).toBe(true)
    expect(state.openUrls).toEqual([SEARCH_URL])
    expect(state.active).toBe('parent')
    expect(state.tabs.has('search1')).toBe(true)
  })

  it('does nothing unless the app allows it', () => {
    const { state, search } = setup()
    expect(search.start('parent', { url: SEARCH_URL }, false)).toBe(false)
    expect(state.openUrls).toEqual([])
  })

  it('does nothing for an address that is not the search of a profile', () => {
    const { state, search } = setup()
    for (const url of ['https://evil.net/', 'https://html.duckduckgo.com/html/?q=hello', 42, undefined]) {
      expect(search.start('parent', { url }, true)).toBe(false)
    }
    expect(search.start('parent', null, true)).toBe(false)
    expect(state.openUrls).toEqual([])
  })

  it('gives a tab one search at a time, however often the page asks', () => {
    const { state, search } = setup()
    for (let i = 0; i < 5; i++) search.start('parent', { url: SEARCH_URL }, true)
    expect(state.openUrls).toHaveLength(1)
  })

  it('drops the search of a profile the tab has left, and starts the one asked for', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    expect(search.start('parent', { url: buildProfileSearchPageUrl('esa')! }, true)).toBe(true)
    expect(state.tabs.has('search1')).toBe(false)
    expect(state.tabs.has('search2')).toBe(true)
    // The dropped one is said to the tab too, for a page that is still on that profile.
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].payload).toMatchObject({ username: 'nasa', status: 'error' })
    // The answer goes to the profile that is on screen now.
    expect(search.complete('search2', { username: 'esa', results: [] }, true)).toBe(true)
    expect(state.sent.at(-1)?.payload).toMatchObject({ username: 'esa', status: 'ok' })
  })

  it('leaves out the posts the page says the profile shows', () => {
    const { state, search } = setup()
    const shown = ['abc12', 7, '<x>', ...Array.from({ length: POSTS_SHOWN_WITHOUT_LOGIN }, (_, i) => `shown${i}`)]
    search.start('parent', { url: SEARCH_URL, shown }, true)
    search.complete('search1', { username: 'nasa', results: [...results, { ...results[0], url: 'https://www.instagram.com/nasa/p/xyz89/' }] }, true)
    expect(state.sent.at(-1)?.payload.posts.map((post) => post.embedUrl)).toEqual(['https://www.instagram.com/p/xyz89/embed/'])
  })

  it('takes the same profile in another spelling for the same search, and its answer for that tab', () => {
    const { state, search } = setup()
    search.start('parent', { url: buildProfileSearchPageUrl('NASA')! }, true)
    expect(search.start('parent', { url: SEARCH_URL }, true)).toBe(false)
    expect(state.openUrls).toHaveLength(1)
    expect(search.complete('search1', { username: 'nasa', results }, true)).toBe(true)
    expect(state.sent).toHaveLength(1)
  })

  it('stops opening search tabs for a page that keeps asking for another profile', () => {
    const { state, search, advance } = setup()
    for (let i = 0; i < MAX_SEARCHES_PER_MINUTE * 3; i++) {
      search.start('parent', { url: buildProfileSearchPageUrl(i % 2 ? 'esa' : 'nasa')! }, true)
    }
    expect(state.openUrls).toHaveLength(MAX_SEARCHES_PER_MINUTE)
    expect(state.sent.at(-1)?.payload.status).toBe('error')
    advance(61_000)
    expect(search.start('parent', { url: SEARCH_URL }, true)).toBe(true)
  })

  it('tells the tab so when no search tab could be opened', () => {
    const { state, search } = setup()
    state.openReturnsNothing = true
    expect(search.start('parent', { url: SEARCH_URL }, true)).toBe(false)
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0]).toMatchObject({ tabId: 'parent', payload: { status: 'error', username: 'nasa' } })
  })
})

describe('complete', () => {
  it('keeps what was found, closes the search tab and carries on in the tab it was for', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    expect(search.complete('search1', { username: 'nasa', results }, true)).toBe(true)
    expect(state.tabs.has('search1')).toBe(false)
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].tabId).toBe('parent')
    expect(state.sent[0].payload.status).toBe('ok')
    expect(getMorePostsPage('nasa', 0).status).toBe('ok')
    expect(state.timers.size).toBe(0)
  })

  it('moves the person back only if the search tab was the one in front', () => {
    const a = setup()
    a.search.start('parent', { url: SEARCH_URL }, true)
    a.search.complete('search1', { username: 'nasa', results }, true)
    expect(a.state.activated).toEqual([])

    const b = setup()
    b.state.tabs.add('other')
    b.search.start('parent', { url: SEARCH_URL }, true)
    b.state.active = 'other'
    b.search.complete('search1', { username: 'nasa', results }, true)
    expect(b.state.active).toBe('other')

    const c = setup()
    c.search.start('parent', { url: SEARCH_URL }, true)
    c.state.active = 'search1'
    c.search.complete('search1', { username: 'nasa', results }, true)
    expect(c.state.active).toBe('parent')
  })

  it('refuses a report from a page that is not the search page, and keeps waiting', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    expect(search.complete('search1', { username: 'nasa', results }, false)).toBe(false)
    expect(state.tabs.has('search1')).toBe(true)
    expect(state.sent).toEqual([])
  })

  it('refuses a report for another profile, and from a tab that is not a search tab', () => {
    const { search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    expect(search.complete('search1', { username: 'other', results }, true)).toBe(false)
    expect(search.complete('parent', { username: 'nasa', results }, true)).toBe(false)
    expect(search.complete('search1', null, true)).toBe(false)
  })
})

describe('waiting', () => {
  it('brings the search tab forward once, after a while without results', () => {
    const { state, search, advance } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    advance(SEARCH_CHECK_AFTER_MS - 1000)
    expect(state.activated).toEqual([])
    advance(2000)
    advance(2000)
    expect(state.activated).toEqual(['search1'])
  })

  it('brings the search tab forward at once when its page reports a check, and only its own page', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    expect(search.challenge('search1', false)).toBe(false)
    expect(search.challenge('parent', true)).toBe(false)
    expect(state.activated).toEqual([])
    expect(search.challenge('search1', true)).toBe(true)
    search.challenge('search1', true)
    expect(state.activated).toEqual(['search1'])
  })

  it('does not close a search tab the person was sent to and is still on', () => {
    const { state, search, advance } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.challenge('search1', true)
    advance(SEARCH_GIVE_UP_AFTER_MS + 2000)
    expect(state.tabs.has('search1')).toBe(true)
    expect(state.sent).toEqual([])
    state.active = 'parent'
    advance(2000)
    expect(state.tabs.has('search1')).toBe(false)
    expect(state.sent.at(-1)?.payload.status).toBe('error')
  })

  it('gives up after two minutes, closes the tab and says so', () => {
    const { state, search, advance } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    advance(SEARCH_GIVE_UP_AFTER_MS + 2000)
    expect(state.tabs.has('search1')).toBe(false)
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].payload.status).toBe('error')
    expect(state.timers.size).toBe(0)
  })

  it('does not move a person who went to another tab when it gives up', () => {
    const { state, search, advance } = setup()
    state.tabs.add('other')
    search.start('parent', { url: SEARCH_URL }, true)
    state.active = 'other'
    advance(SEARCH_GIVE_UP_AFTER_MS + 2000)
    expect(state.active).toBe('other')
    expect(state.activated.filter((id) => id === 'parent')).toEqual([])
  })

  it('stops at once when the person closes the search tab, and tells the tab', () => {
    const { state, search, advance } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    state.tabs.delete('search1')
    advance(2000)
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].payload.status).toBe('error')
    expect(state.timers.size).toBe(0)
    expect(state.activated).toEqual([])
  })

  it('stops quietly when the tab the posts were for is gone', () => {
    const { state, search, advance } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    state.tabs.delete('parent')
    advance(2000)
    expect(state.sent).toEqual([])
    expect(state.tabs.has('search1')).toBe(false)
    expect(state.timers.size).toBe(0)
  })

  it('lets a tab search again once the last search is over', () => {
    const { state, search, advance } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    advance(SEARCH_GIVE_UP_AFTER_MS + 2000)
    expect(search.start('parent', { url: SEARCH_URL }, true)).toBe(true)
    expect(state.openUrls).toHaveLength(2)
  })
})

describe('sanitizeSearchResults', () => {
  it('keeps the fields the list is made from, cut to size', () => {
    const [result] = sanitizeSearchResults([{ url: 'u'.repeat(900), title: 't'.repeat(900), snippet: 's'.repeat(3000), extra: 1 }])
    expect(result.url).toHaveLength(500)
    expect(result.title).toHaveLength(300)
    expect(result.snippet).toHaveLength(1500)
    expect(Object.keys(result)).toEqual(['url', 'title', 'snippet'])
  })

  it('drops what is not a result and caps how many there are', () => {
    expect(sanitizeSearchResults(null)).toEqual([])
    expect(sanitizeSearchResults('x')).toEqual([])
    expect(sanitizeSearchResults([null, 1, { url: 'a' }, { url: 1, snippet: 's' }, { url: 'a', snippet: 's' }])).toHaveLength(1)
    expect(sanitizeSearchResults(Array.from({ length: 500 }, () => ({ url: 'a', snippet: 's' })))).toHaveLength(MAX_SEARCH_RESULTS)
  })
})

describe('sanitizeShownShortcodes', () => {
  it('keeps what a post code can be', () => {
    expect(sanitizeShownShortcodes(['DeKe4mpkipT', 'abc-D_1', 'ab', 5, null, 'a b c d e'])).toEqual(['DeKe4mpkipT', 'abc-D_1'])
    expect(sanitizeShownShortcodes('x')).toEqual([])
    expect(sanitizeShownShortcodes(Array.from({ length: 200 }, (_, i) => `code${i}x`))).toHaveLength(60)
  })
})

describe('parseLoadMoreRequest', () => {
  it('takes a profile-shaped name and a page in range', () => {
    expect(parseLoadMoreRequest({ username: 'nasa', page: 0 })).toEqual({ username: 'nasa', page: 0 })
    expect(parseLoadMoreRequest({ username: 'nasa.gov_1', page: 50 })).toEqual({ username: 'nasa.gov_1', page: 50 })
  })

  it('refuses anything else', () => {
    for (const data of [null, undefined, {}, { username: 'nasa' }, { username: 'nasa', page: -1 }, { username: 'nasa', page: 51 }, { username: 'nasa', page: 1.5 }, { username: 'nasa', page: '1' }, { username: 'a b', page: 0 }, { username: 'x'.repeat(31), page: 0 }, { username: 5, page: 0 }]) {
      expect(parseLoadMoreRequest(data)).toBeNull()
    }
  })
})

describe('hosts', () => {
  it('knows Instagram and the search page, and nothing that only looks like them', () => {
    expect(isInstagramHost('instagram.com')).toBe(true)
    expect(isInstagramHost('www.instagram.com')).toBe(true)
    expect(isInstagramHost('instagram.com.evil.net')).toBe(false)
    expect(isInstagramHost('notinstagram.com')).toBe(false)
    expect(isSearchHost('html.duckduckgo.com')).toBe(true)
    expect(isSearchHost('duckduckgo.com')).toBe(false)
    expect(isSearchHost('html.duckduckgo.com.evil.net')).toBe(false)
  })
})

describe('carrying a search on', () => {
  const next = { offset: 40, dc: 41, vqd: '4-123', kl: 'wt-wt', nextParams: '' }
  const dated = (code: string, year: number) => ({
    url: `https://www.instagram.com/nasa/p/${code}/`,
    title: '',
    snippet: `1K likes, 2 comments - nasa on May 1, ${year}: "post ${code}"`,
  })
  const batch = (prefix: string, count: number, from: number) => Array.from({ length: count }, (_, i) => dated(`${prefix}${i}`, from - i))

  it('opens the page after the ones read and fills the page of the list with what it finds', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE + 5, 2030), next }, true)
    expect(state.sent.at(-1)?.payload).toMatchObject({ page: 0, hasMore: true })
    expect(needsMorePosts('nasa', 1)).toBe(true)

    expect(search.more('parent', 'nasa', 1)).toBe(true)
    expect(new URL(state.openUrls.at(-1)!).searchParams.get('s')).toBe('40')
    expect(state.tabs.has('search2')).toBe(true)

    search.complete('search2', { username: 'nasa', results: batch('b', POSTS_PER_PAGE, 2010), next: null }, true)
    expect(state.tabs.has('search2')).toBe(false)
    const last = state.sent.at(-1)!
    expect(last.tabId).toBe('parent')
    expect(last.payload).toMatchObject({ page: 1, status: 'ok', hasMore: true })
    expect(last.payload.posts).toHaveLength(POSTS_PER_PAGE)
  })

  it('goes on to a further batch when the one it found still leaves the page short', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + 2, 2030), next }, true)
    search.more('parent', 'nasa', 0)
    const sentBefore = state.sent.length
    search.complete('search2', { username: 'nasa', results: batch('b', 3, 2010), next }, true)
    expect(state.sent).toHaveLength(sentBefore)
    expect(state.tabs.has('search3')).toBe(true)
  })

  it('does not search on for a list that is not there, from a tab that already searches, or when there is nothing after it', () => {
    const { state, search } = setup()
    expect(search.more('parent', 'nasa', 1)).toBe(false)
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + 2, 2030), next: null }, true)
    expect(search.more('parent', 'nasa', 1)).toBe(false)
    expect(state.openUrls).toHaveLength(1)
  })

  it('tells the tab which page failed, and can be asked again', () => {
    const { state, search, advance } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE + 2, 2030), next }, true)
    search.more('parent', 'nasa', 1)
    advance(SEARCH_GIVE_UP_AFTER_MS)
    expect(state.sent.at(-1)?.payload).toMatchObject({ page: 1, status: 'error' })
    expect(search.more('parent', 'nasa', 1)).toBe(true)
  })

  it('opens nothing more while a search for the same profile is under way, and lets it answer', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE + 2, 2030), next }, true)
    expect(search.more('parent', 'nasa', 1)).toBe(true)
    const sentBefore = state.sent.length
    expect(search.more('parent', 'nasa', 1)).toBe(true)
    expect(state.openUrls).toHaveLength(2)
    expect(state.sent).toHaveLength(sentBefore)
  })

  it('answers for the page asked for last, not the one the search was started for', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE * 2 + 2, 2030), next }, true)
    search.more('parent', 'nasa', 2)
    // The page was loaded again and starts over from the page before.
    search.more('parent', 'nasa', 1)
    search.complete('search2', { username: 'nasa', results: batch('b', POSTS_PER_PAGE, 2010), next: null }, true)
    expect(state.sent.at(-1)?.payload).toMatchObject({ page: 1, status: 'ok' })
  })

  it('answers once, with the error, when the next search tab cannot be opened', () => {
    const { state, search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE + 2, 2030), next }, true)
    const sentBefore = state.sent.length
    state.openReturnsNothing = true
    expect(search.more('parent', 'nasa', 1)).toBe(true)
    expect(state.sent).toHaveLength(sentBefore + 1)
    expect(state.sent.at(-1)?.payload).toMatchObject({ page: 1, status: 'error' })
  })

  it('ignores a continuation a page made up', () => {
    const { search } = setup()
    search.start('parent', { url: SEARCH_URL }, true)
    search.complete('search1', { username: 'nasa', results: batch('a', POSTS_SHOWN_WITHOUT_LOGIN + 2, 2030), next: { ...next, vqd: '<x>' } }, true)
    expect(search.more('parent', 'nasa', 1)).toBe(false)
  })
})
