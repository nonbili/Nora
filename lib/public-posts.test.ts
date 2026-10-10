import { describe, expect, it } from 'bun:test'
import {
  buildContinuationPageUrl,
  buildProfileSearchPageUrl,
  getSearchPageOffset,
  getSearchPageUsername,
  buildProfileSearchQuery,
  continuePosts,
  isChallengePage,
  mentionsUsername,
  isResultsPage,
  parseContinuation,
  parseProfileSearchRequest,
  pickNextForm,
  parseSearchResults,
  toInstagramPost,
  unwrapResultUrl,
  type PublicPost,
} from './public-posts'

// The shape of a real result page of html.duckduckgo.com, cut down to three results.
const page = `
<div id="links" class="results">
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freels%2F&amp;rut=aa">NASA (@nasa) • Instagram photos and videos</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freels%2F&amp;rut=aa">104M Followers, 94 Following, 4,955 Posts - NASA (@nasa) on Instagram: &quot;Making the seemingly impossible, possible. &quot;</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freel%2FDbbSK7rD%2DSW%2F&amp;rut=bb">NASA on Instagram</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Freel%2FDbbSK7rD%2DSW%2F&amp;rut=bb">160K likes, 1,187 comments - nasa on July 30, 2026: &quot;We&#x27;re about to see the bigger picture. 🌌 On Aug. 30, our telescope will lift off ...</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result ">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww%2Dfallback.instagram.com%2Fnasa%2Fp%2FDWwjA6qFG8G%2F&amp;rut=cc">NASA on Instagram</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww%2Dfallback.instagram.com%2Fnasa%2Fp%2FDWwjA6qFG8G%2F&amp;rut=cc">2M likes, 8,744 comments - nasa on April 5, 2026: &quot;Unbeatable aura Swipe right to meet our astronauts! ...</a>
    </div>
  </div>
</div>`

const post = (shortcode: string, date: number | null): PublicPost => ({
  url: `https://www.instagram.com/nasa/p/${shortcode}/`,
  shortcode,
  date,
  caption: '',
})

describe('unwrapResultUrl', () => {
  it('reads the real address out of the redirect', () => {
    expect(unwrapResultUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Fnasa%2Fp%2Fabc%2F&amp;rut=1')).toBe(
      'https://www.instagram.com/nasa/p/abc/',
    )
  })

  it('keeps an address that is not wrapped', () => {
    expect(unwrapResultUrl('https://example.com/a')).toBe('https://example.com/a')
  })
})

describe('parseSearchResults', () => {
  it('reads every result with its address, title and description', () => {
    const results = parseSearchResults(page)
    expect(results.map((result) => result.url)).toEqual([
      'https://www.instagram.com/nasa/reels/',
      'https://www.instagram.com/nasa/reel/DbbSK7rD-SW/',
      'https://www-fallback.instagram.com/nasa/p/DWwjA6qFG8G/',
    ])
    expect(results[1].title).toBe('NASA on Instagram')
    expect(results[1].snippet).toContain('160K likes, 1,187 comments - nasa on July 30, 2026: "We\'re about to see')
  })

  it('gives nothing for a page without results', () => {
    expect(parseSearchResults('<html><body>No results.</body></html>')).toEqual([])
  })
})

describe('mentionsUsername', () => {
  it('finds a name as a whole name', () => {
    expect(mentionsUsername('1K likes - nasa on May 1', 'nasa')).toBe(true)
    expect(mentionsUsername('1K likes - NASA on May 1', 'nasa')).toBe(true)
    expect(mentionsUsername('1K likes - john.doe on May 1', 'john.doe')).toBe(true)
    expect(mentionsUsername('A post by nasa.', 'nasa')).toBe(true)
    expect(mentionsUsername('1K likes - john.doe. on May 1', 'john.doe.')).toBe(true)
  })

  it('does not take another name for it', () => {
    expect(mentionsUsername('1K likes - john_doe on May 1', 'john.doe')).toBe(false)
    expect(mentionsUsername('1K likes - john.doe on May 1', 'john')).toBe(false)
    expect(mentionsUsername('1K likes - nasahq on May 1', 'nasa')).toBe(false)
    expect(mentionsUsername('1K likes - my.nasa on May 1', 'nasa')).toBe(false)
  })
})

describe('toInstagramPost', () => {
  const [profile, reel, photo] = parseSearchResults(page)

  it('reads a reel and a post, with date, counts and caption', () => {
    expect(toInstagramPost(reel, 'nasa')).toEqual({
      url: 'https://www.instagram.com/nasa/reel/DbbSK7rD-SW/',
      shortcode: 'DbbSK7rD-SW',
      date: Date.UTC(2026, 6, 30),
      caption: expect.stringContaining("We're about to see the bigger picture."),
    })
    expect(toInstagramPost(photo, 'nasa')).toMatchObject({ shortcode: 'DWwjA6qFG8G', date: Date.UTC(2026, 3, 5) })
  })

  it('skips the profile page and other things that are not a post', () => {
    expect(toInstagramPost(profile, 'nasa')).toBeNull()
    expect(toInstagramPost({ url: 'https://www.instagram.com/nasa/embed/', title: '', snippet: '' }, 'nasa')).toBeNull()
    expect(toInstagramPost({ url: 'https://example.com/nasa/p/abc/', title: '', snippet: '' }, 'nasa')).toBeNull()
    expect(toInstagramPost({ url: 'not a url', title: '', snippet: '' }, 'nasa')).toBeNull()
  })

  it('skips the posts of another account', () => {
    expect(toInstagramPost({ url: 'https://www.instagram.com/other/p/abc/', title: '', snippet: '1 likes, 2 comments - other on May 1, 2026: "x"' }, 'nasa')).toBeNull()
  })

  it('takes a profile-less link only when the description names the profile', () => {
    const mine = { url: 'https://www.instagram.com/p/abc/', title: '', snippet: '1K likes, 2 comments - nasa on May 1, 2026: "x"' }
    const theirs = { url: 'https://www.instagram.com/p/abc/', title: '', snippet: '1K likes, 2 comments - other on May 1, 2026: "x"' }
    expect(toInstagramPost(mine, 'nasa')).toMatchObject({ shortcode: 'abc' })
    expect(toInstagramPost(theirs, 'nasa')).toBeNull()
  })

  it('keeps a post with no date, with no date', () => {
    const undated = toInstagramPost({ url: 'https://www.instagram.com/nasa/p/abc/', title: '', snippet: 'nasa on Instagram' }, 'nasa')
    expect(undated).toMatchObject({ shortcode: 'abc', date: null })
  })

  it('does not take an impossible date', () => {
    const odd = toInstagramPost({ url: 'https://www.instagram.com/nasa/p/abc/', title: '', snippet: '1 likes, 2 comments - nasa on Foo 3, 2026: "x"' }, 'nasa')
    expect(odd!.date).toBeNull()
  })
})

describe('continuePosts', () => {
  it('leaves out what the page already shows', () => {
    expect(continuePosts([post('a', 1), post('b', 2)], ['a']).map((p) => p.shortcode)).toEqual(['b'])
  })

  it('lists each post once', () => {
    expect(continuePosts([post('a', 1), post('a', 1)], []).map((p) => p.shortcode)).toEqual(['a'])
  })

  it('puts the newest first and the undated last', () => {
    expect(continuePosts([post('old', 1), post('none', null), post('new', 3), post('mid', 2), post('none2', null)], []).map((p) => p.shortcode)).toEqual([
      'new',
      'mid',
      'old',
      'none',
      'none2',
    ])
  })
})

describe('profile search', () => {
  it('searches only for something that can be a profile name', () => {
    expect(buildProfileSearchQuery('nasa')).toBe('site:instagram.com/nasa/')
    expect(buildProfileSearchQuery('nasa.gov_1')).toBe('site:instagram.com/nasa.gov_1/')
    expect(buildProfileSearchQuery('nasa site:evil.com')).toBeNull()
    expect(buildProfileSearchQuery('')).toBeNull()
    expect(buildProfileSearchQuery('a'.repeat(31))).toBeNull()
  })

  it('builds the page a person can open', () => {
    expect(buildProfileSearchPageUrl('nasa')).toBe('https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F#nora')
    expect(buildProfileSearchPageUrl('a b')).toBeNull()
  })
})

describe('getSearchPageUsername', () => {
  it('is the profile a search page was built for', () => {
    expect(getSearchPageUsername(buildProfileSearchPageUrl('nasa')!)).toBe('nasa')
    expect(getSearchPageUsername(buildProfileSearchPageUrl('nasa.gov_1')!)).toBe('nasa.gov_1')
  })

  it('is null for any other address', () => {
    expect(getSearchPageUsername('https://html.duckduckgo.com/html/?q=hello')).toBeNull()
    // The same search, typed by hand: not one the app opened.
    expect(getSearchPageUsername('https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F')).toBeNull()
    expect(getSearchPageUsername('https://duckduckgo.com/?q=site%3Ainstagram.com%2Fnasa%2F')).toBeNull()
    expect(getSearchPageUsername('https://evil.net/html/?q=site%3Ainstagram.com%2Fnasa%2F')).toBeNull()
    expect(getSearchPageUsername('nope')).toBeNull()
  })
})

describe('isResultsPage', () => {
  it('is a page with results, or one that says there are none', () => {
    expect(isResultsPage(page)).toBe(true)
    expect(isResultsPage('<div class="no-results">No results.</div>')).toBe(true)
    expect(isResultsPage('<html><body>No results found for site:instagram.com/x/</body></html>')).toBe(true)
  })

  it('is not a page that is neither, such as a check in a form that is not known', () => {
    expect(isResultsPage('<html><body><form id="verify">Please confirm you are human</form></body></html>')).toBe(false)
    expect(isResultsPage('')).toBe(false)
  })
})

describe('isChallengePage', () => {
  it('recognises a page that asks for proof of a person', () => {
    expect(isChallengePage('<form id="challenge-form"><div class="anomaly-modal">Select all squares</div></form>')).toBe(true)
  })

  it('does not take a page with results for one', () => {
    expect(isChallengePage(page)).toBe(false)
  })

  it('does not take an empty result page for one', () => {
    expect(isChallengePage('<html><body>No results found.</body></html>')).toBe(false)
  })

  it('is not misled by a profile whose name is a word a check uses', () => {
    const echoed = '<input name="q" value="site:instagram.com/captcha.memes/"><a href="/html/?q=site%3Ainstagram.com%2Fanomaly_art%2F">x</a>'
    expect(isChallengePage(`<html><body>${echoed}No results found.</body></html>`)).toBe(false)
    expect(isChallengePage(`<html><body>${echoed}<form id="challenge-form"></form></body></html>`)).toBe(true)
  })
})

describe('parseProfileSearchRequest', () => {
  it('takes the search page for the posts of a profile, and says which profile', () => {
    expect(parseProfileSearchRequest('https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F#nora')).toEqual({
      url: 'https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F#nora',
      username: 'nasa',
    })
  })

  it('refuses every other address', () => {
    for (const url of [
      'https://www.instagram.com/p/DeKe4mpkipT/',
      'https://www.instagram.com/nasa/',
      'https://duckduckgo.com/',
      'https://duckduckgo.com/?q=site%3Ainstagram.com%2Fnasa%2F',
      'https://html.duckduckgo.com/html/?q=hello',
      'https://html.duckduckgo.com/html/?q=site%3Aevil.net%2Fnasa%2F',
      'https://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F%20site%3Aevil.net',
      'https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Fevil.net',
      'http://html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F',
      'https://user:pw@html.duckduckgo.com/html/?q=site%3Ainstagram.com%2Fnasa%2F',
      'https://html.duckduckgo.com:8443/html/?q=site%3Ainstagram.com%2Fnasa%2F',
      'https://html.duckduckgo.com.evil.net/html/?q=site%3Ainstagram.com%2Fnasa%2F',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(parseProfileSearchRequest(url)).toBeNull()
    }
    expect(parseProfileSearchRequest(undefined)).toBeNull()
    expect(parseProfileSearchRequest(42)).toBeNull()
  })
})

describe('carrying a search on', () => {
  const continuation = { offset: 25, dc: 26, vqd: '4-1699353707029534630', kl: 'wt-wt', nextParams: '' }

  it('picks the form that leads on, not the one that leads back', () => {
    expect(pickNextForm([10], 0)).toBe(0)
    expect(pickNextForm([0, 25], 10)).toBe(1)
    expect(pickNextForm([25, 0], 10)).toBe(0)
    expect(pickNextForm([10, 40], 25)).toBe(1)
  })

  it('has no next form at the last page, where only the way back is left', () => {
    expect(pickNextForm([25], 40)).toBe(-1)
    expect(pickNextForm([], 0)).toBe(-1)
    expect(pickNextForm([Number.NaN], 0)).toBe(-1)
  })

  it('reads where a page of results starts', () => {
    expect(getSearchPageOffset('https://html.duckduckgo.com/html/?q=x&s=40')).toBe(40)
    expect(getSearchPageOffset('https://html.duckduckgo.com/html/?q=x')).toBe(0)
    expect(getSearchPageOffset('https://html.duckduckgo.com/html/?q=x&s=-3')).toBe(0)
    expect(getSearchPageOffset('nope')).toBe(0)
  })

  it('builds the page after the ones read, for the same search, and the page is recognised as one of it', () => {
    const url = buildContinuationPageUrl('nasa', continuation)!
    expect(url.startsWith('https://html.duckduckgo.com/html/?')).toBe(true)
    expect(new URL(url).searchParams.get('q')).toBe('site:instagram.com/nasa/')
    expect(getSearchPageUsername(url)).toBe('nasa')
    expect(getSearchPageOffset(url)).toBe(25)
    expect(buildContinuationPageUrl('a b', continuation)).toBeNull()
  })

  it('takes a continuation from a page only when every field is what DuckDuckGo gives', () => {
    expect(parseContinuation(continuation)).toEqual(continuation)
    for (const bad of [
      null,
      {},
      { ...continuation, offset: 0 },
      { ...continuation, offset: 1001 },
      { ...continuation, offset: 2.5 },
      { ...continuation, dc: '26' },
      { ...continuation, vqd: 'a b' },
      { ...continuation, vqd: 'x'.repeat(121) },
      { ...continuation, kl: 'wt wt' },
      { ...continuation, nextParams: '<script>' },
    ]) {
      expect(parseContinuation(bad)).toBeNull()
    }
  })
})
