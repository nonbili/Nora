import { beforeEach, describe, expect, it } from 'bun:test'
import { MAX_SEARCH_BATCHES, appendSearchResults, clearMorePostsCache, getContinuation, getMorePostsPage, needsMorePosts, storeSearchResults } from './more-posts'
import { POSTS_PER_PAGE, POSTS_SHOWN_WITHOUT_LOGIN, toEmbedUrl } from './public-posts'

const result = (code: string, day: number) => ({
  url: `https://www.instagram.com/nasa/p/${code}/`,
  title: 'NASA on Instagram',
  snippet: `1K likes, 2 comments - nasa on May ${day}, 2026: "post ${code}"`,
})

const results = (count: number) => Array.from({ length: count }, (_, index) => result(`code${String(index).padStart(3, '0')}`, (index % 28) + 1))

beforeEach(() => clearMorePostsCache())

describe('toEmbedUrl', () => {
  it('points at the embed page of a post or a reel', () => {
    expect(toEmbedUrl({ url: 'https://www.instagram.com/nasa/p/abc-D_1/' })).toBe('https://www.instagram.com/p/abc-D_1/embed/')
    expect(toEmbedUrl({ url: 'https://www.instagram.com/nasa/reel/xyz/' })).toBe('https://www.instagram.com/reel/xyz/embed/')
    expect(toEmbedUrl({ url: 'https://www-fallback.instagram.com/nasa/p/abc/' })).toBe('https://www.instagram.com/p/abc/embed/')
  })

  it('knows the same kinds of post page as the redirect does', () => {
    expect(toEmbedUrl({ url: 'https://www.instagram.com/tv/abc12/' })).toBe('https://www.instagram.com/tv/abc12/embed/')
  })

  it('refuses anything else', () => {
    expect(toEmbedUrl({ url: 'https://example.com/nasa/p/abc/' })).toBeNull()
    expect(toEmbedUrl({ url: 'https://www.instagram.com/nasa/' })).toBeNull()
    expect(toEmbedUrl({ url: 'nope' })).toBeNull()
  })
})

describe('getMorePostsPage', () => {
  it('offers to search until something has been searched for, and searches nothing itself', () => {
    expect(getMorePostsPage('nasa', 0, 0)).toEqual({
      username: 'nasa',
      page: 0,
      status: 'idle',
      posts: [],
      hasMore: false,
      searchUrl: 'https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F#nora',
    })
  })

  it('leaves out the posts the profile already shows and pages the rest', () => {
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN + POSTS_PER_PAGE + 5), null, 0)
    const first = getMorePostsPage('nasa', 0, 1)
    expect(first.status).toBe('ok')
    expect(first.posts).toHaveLength(POSTS_PER_PAGE)
    expect(first.hasMore).toBe(true)

    const second = getMorePostsPage('nasa', 1, 1)
    expect(second.posts).toHaveLength(5)
    expect(second.hasMore).toBe(false)
  })

  it('keeps what was found for any spelling of the name', () => {
    storeSearchResults('NASA', results(POSTS_SHOWN_WITHOUT_LOGIN + 3), null, 0)
    expect(getMorePostsPage('nasa', 0, 1).posts).toHaveLength(3)
  })

  it('leaves out exactly the posts the profile says it shows, however few were found', () => {
    const shown = ['code000', 'code001', ...Array.from({ length: POSTS_SHOWN_WITHOUT_LOGIN - 2 }, (_, i) => `other${i}`)]
    storeSearchResults('nasa', results(10), null, 0, shown)
    const page = getMorePostsPage('nasa', 0, 1)
    expect(page.posts).toHaveLength(8)
    expect(page.posts.some((post) => post.embedUrl.includes('code000'))).toBe(false)
  })

  it('takes the tiles the page could not read to be the newest of what is left', () => {
    // Three of twelve tiles read: the nine newest of the rest are the profile's own too.
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN + 5), null, 0, ['code000', 'code001', 'code002'])
    expect(getMorePostsPage('nasa', 0, 1).posts).toHaveLength(5)
  })

  it('offers to search again once what was found is old', () => {
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN + 3), null, 0)
    expect(getMorePostsPage('nasa', 0, 11 * 60 * 1000).status).toBe('idle')
  })

  it('keeps a list that is being read', () => {
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN + 3), null, 0)
    expect(getMorePostsPage('nasa', 0, 6 * 60 * 1000).status).toBe('ok')
    expect(getMorePostsPage('nasa', 0, 12 * 60 * 1000).status).toBe('ok')
  })

  it('says there is nothing more when the search found no more than the profile shows', () => {
    storeSearchResults('nasa', results(POSTS_SHOWN_WITHOUT_LOGIN), null, 0)
    expect(getMorePostsPage('nasa', 0, 1)).toMatchObject({ status: 'ok', posts: [], hasMore: false })
  })

  it('puts the newest first, after the twelve newest', () => {
    const dated = (code: string, year: number) => ({ ...result(code, 1), snippet: `1K likes, 2 comments - nasa on May 1, ${year}: "post ${code}"` })
    const newest = Array.from({ length: POSTS_SHOWN_WITHOUT_LOGIN }, (_, index) => dated(`top${index}`, 2030 + index))
    storeSearchResults('nasa', [dated('old', 2001), ...newest, dated('new', 2003), dated('mid', 2002)], null, 0)
    expect(getMorePostsPage('nasa', 0, 1).posts.map((post) => post.caption)).toEqual(['post new', 'post mid', 'post old'])
  })
})

describe('storeSearchResults', () => {
  it('ignores results that are not posts of the profile', () => {
    storeSearchResults('nasa', [result('abcde', 1), { url: 'https://example.com/', title: '', snippet: '' }], null, 0)
    expect(getMorePostsPage('nasa', 0, 1)).toMatchObject({ status: 'ok', posts: [], hasMore: false })
  })
})

describe('carrying a search on', () => {
  const next = { offset: 40, dc: 41, vqd: '4-123', kl: 'wt-wt', nextParams: '' }
  const dated = (code: string, year: number) => ({ ...result(code, 1), snippet: `1K likes, 2 comments - nasa on May 1, ${year}: "post ${code}"` })
  const firstBatch = () => Array.from({ length: POSTS_SHOWN_WITHOUT_LOGIN + 3 }, (_, index) => dated(`c${index}`, 2030 - index))

  it('offers to search on while there are pages after the ones found, and says when a page cannot be filled', () => {
    storeSearchResults('nasa', firstBatch(), next, 0)
    expect(getContinuation('nasa', 1)).toEqual(next)
    expect(getMorePostsPage('nasa', 0, 1)).toMatchObject({ hasMore: true })
    expect(needsMorePosts('nasa', 0, 1)).toBe(true)
  })

  it('has nothing to search on when the last page was reached, or the list is long enough', () => {
    storeSearchResults('nasa', firstBatch(), null, 0)
    expect(getContinuation('nasa', 1)).toBeNull()
    expect(needsMorePosts('nasa', 0, 1)).toBe(false)
    storeSearchResults('nasa', Array.from({ length: POSTS_SHOWN_WITHOUT_LOGIN + 3 * POSTS_PER_PAGE }, (_, i) => dated(`d${i}`, 2030 - i)), next, 0)
    expect(needsMorePosts('nasa', 0, 1)).toBe(false)
    expect(needsMorePosts('nasa', 2, 1)).toBe(false)
    expect(needsMorePosts('nasa', 3, 1)).toBe(true)
  })

  it('adds a later batch after what is there, without repeats and without what the profile shows', () => {
    storeSearchResults('nasa', firstBatch(), next, 0)
    const added = appendSearchResults(
      'nasa',
      [dated('c0', 2030), dated('c13', 2017), dated('late', 2005), dated('earlier', 2001), dated('newer', 2031)],
      null,
      1,
    )
    expect(added).toBe(2)
    expect(getMorePostsPage('nasa', 0, 2).posts.map((post) => post.caption)).toEqual(['post c12', 'post c13', 'post c14', 'post late', 'post earlier'])
  })

  it('stops asking for batches after a few, however much there is', () => {
    storeSearchResults('nasa', firstBatch(), next, 0)
    for (let batch = 1; batch < MAX_SEARCH_BATCHES; batch++) {
      expect(getContinuation('nasa', 1)).toEqual(next)
      appendSearchResults('nasa', [dated(`more${batch}`, 1900 + batch)], next, 1)
    }
    expect(getContinuation('nasa', 2)).toBeNull()
  })

  it('ends the search when a batch brings nothing new, and when there is no list to add to', () => {
    storeSearchResults('nasa', firstBatch(), next, 0)
    expect(appendSearchResults('nasa', [dated('c13', 2017)], next, 1)).toBe(0)
    expect(getContinuation('nasa', 2)).toBeNull()
    expect(appendSearchResults('other', [dated('x', 2001)], next, 1)).toBe(0)
  })
})
