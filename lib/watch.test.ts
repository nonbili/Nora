import { describe, expect, it } from 'bun:test'
import {
  backgroundIntervalMinutes,
  formatPostAge,
  getWatchTarget,
  instagramPostTime,
  parseInstagramProfilePage,
  parseXDate,
  mergeWatchPosts,
  parseInstagramProfileInfo,
  parseXTimeline,
  postKey,
  splitInterval,
  watchIntervalMinutes,
  watchKey,
  type WatchPost,
} from './watch'

describe('getWatchTarget', () => {
  it('reads the handle from a profile on X', () => {
    expect(getWatchTarget('https://x.com/NASA')).toEqual({ site: 'x', handle: 'NASA' })
    expect(getWatchTarget('https://x.com/NASA/')).toEqual({ site: 'x', handle: 'NASA' })
    expect(getWatchTarget('https://mobile.twitter.com/nasa/media')).toEqual({ site: 'x', handle: 'nasa' })
    expect(getWatchTarget('https://x.com/nasa?lang=en')).toEqual({ site: 'x', handle: 'nasa' })
  })

  it('is null for a page on X that is not a profile', () => {
    expect(getWatchTarget('https://x.com/home')).toBeNull()
    expect(getWatchTarget('https://x.com/explore')).toBeNull()
    expect(getWatchTarget('https://x.com/i/bookmarks')).toBeNull()
    expect(getWatchTarget('https://x.com/nasa/status/123')).toBeNull()
    expect(getWatchTarget('https://x.com/')).toBeNull()
  })

  it('reads the handle from a profile on Instagram', () => {
    expect(getWatchTarget('https://www.instagram.com/natgeo/')).toEqual({ site: 'instagram', handle: 'natgeo' })
    expect(getWatchTarget('https://www.instagram.com/explore/')).toBeNull()
    expect(getWatchTarget('https://www.instagram.com/p/abc123/')).toBeNull()
  })

  it('is null on any other site and for what is not an address', () => {
    expect(getWatchTarget('https://x.com.evil.net/nasa')).toBeNull()
    expect(getWatchTarget('https://www.facebook.com/nasa')).toBeNull()
    expect(getWatchTarget('not a url')).toBeNull()
    expect(getWatchTarget(undefined)).toBeNull()
  })
})

describe('watchKey', () => {
  it('does not depend on the case of the handle', () => {
    expect(watchKey({ site: 'x', handle: 'NASA' })).toBe(watchKey({ site: 'x', handle: 'nasa' }))
  })
})

const xPage = (entries: unknown[]) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { timeline: { entries } } },
  })}</script></html>`

const nasa = { screen_name: 'NASA', name: 'NASA', profile_image_url_https: 'https://pbs.twimg.com/nasa.jpg' }

describe('parseXDate', () => {
  it('reads the dates of X, with their offset', () => {
    expect(parseXDate('Fri Oct 16 19:42:20 +0000 2026')).toBe(Date.UTC(2026, 9, 16, 19, 42, 20))
    expect(parseXDate('Fri Oct 16 21:42:20 +0200 2026')).toBe(Date.UTC(2026, 9, 16, 19, 42, 20))
  })

  it('is 0 for what is not one', () => {
    expect(parseXDate('2026-10-16')).toBe(0)
    expect(parseXDate(undefined)).toBe(0)
  })
})

describe('parseXTimeline', () => {
  it('reads the posts and the profile of an embedded timeline', () => {
    const html = xPage([
      {
        type: 'tweet',
        content: {
          tweet: {
            id_str: '2',
            created_at: 'Fri Oct 16 19:42:20 +0000 2026',
            full_text: 'Liftoff &amp; more https://t.co/a https://t.co/m',
            permalink: '/NASA/status/2',
            entities: {
              urls: [{ url: 'https://t.co/a', expanded_url: 'https://nasa.gov/x' }],
              media: [{ url: 'https://t.co/m', media_url_https: 'https://pbs.twimg.com/m.jpg' }],
            },
            user: nasa,
          },
        },
      },
      {
        type: 'tweet',
        content: {
          tweet: {
            id_str: '1',
            created_at: 'Thu Oct 15 20:03:45 +0000 2026',
            full_text: 'RT @esa: hello',
            permalink: '/NASA/status/1',
            user: nasa,
            retweeted_status: { full_text: 'hello', user: { screen_name: 'esa' } },
          },
        },
      },
    ])
    const { info, posts } = parseXTimeline(html, 'nasa')
    expect(info).toEqual({ name: 'NASA', avatar: 'https://pbs.twimg.com/nasa.jpg' })
    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({
      id: '2',
      url: 'https://x.com/NASA/status/2',
      text: 'Liftoff & more https://nasa.gov/x',
      image: 'https://pbs.twimg.com/m.jpg',
      createdAtMs: Date.parse('2026-10-16T19:42:20Z'),
    })
    expect(posts[1]).toMatchObject({ id: '1', text: 'hello', repostOf: 'esa' })
  })

  it('throws on a page without a timeline, so that it is not taken for an empty one', () => {
    expect(() => parseXTimeline('<html>rate limited</html>', 'nasa')).toThrow()
  })
})

describe('parseInstagramProfileInfo', () => {
  it('reads the posts and the profile', () => {
    const { info, posts } = parseInstagramProfileInfo(
      {
        data: {
          user: {
            full_name: 'National Geographic',
            profile_pic_url: 'https://cdn/pic.jpg',
            edge_owner_to_timeline_media: {
              edges: [
                {
                  node: {
                    shortcode: 'Cabc',
                    product_type: 'clips',
                    taken_at_timestamp: 1760000000,
                    thumbnail_src: 'https://cdn/t.jpg',
                    edge_media_to_caption: { edges: [{ node: { text: 'A lion' } }] },
                  },
                },
                { node: { shortcode: 'Cdef', taken_at_timestamp: 1750000000, display_url: 'https://cdn/d.jpg' } },
              ],
            },
          },
        },
      },
      'natgeo',
    )
    expect(info).toEqual({ name: 'National Geographic', avatar: 'https://cdn/pic.jpg' })
    expect(posts.map((post) => [post.url, post.text, post.image, post.createdAtMs])).toEqual([
      ['https://www.instagram.com/reel/Cabc/', 'A lion', 'https://cdn/t.jpg', 1760000000000],
      ['https://www.instagram.com/p/Cdef/', '', 'https://cdn/d.jpg', 1750000000000],
    ])
  })

  it('throws on an answer that asks to log in', () => {
    expect(() => parseInstagramProfileInfo({ message: 'Please wait a few minutes', require_login: true }, 'natgeo')).toThrow(
      'Please wait a few minutes',
    )
  })
})

const fetched = (id: string, createdAtMs: number) => ({
  id,
  site: 'x' as const,
  handle: 'nasa',
  url: `https://x.com/nasa/status/${id}`,
  text: id,
  createdAtMs,
})

const kept = (id: string, createdAtMs: number, firstSeenAt = 0): WatchPost => ({
  ...fetched(id, createdAtMs),
  key: postKey({ site: 'x', id }),
  firstSeenAt,
})

describe('instagramPostTime', () => {
  it('reads the time a post was made from its id', () => {
    expect(new Date(instagramPostTime('4008597565992995700')).toISOString()).toBe('2026-10-15T16:34:49.658Z')
  })

  it('is 0 for what is not an id', () => {
    expect(instagramPostTime('abc')).toBe(0)
  })
})

const instagramPage = (connection: unknown) => `<html><head>
<meta property="og:image" content="https://cdn/pic.jpg?a=1&amp;b=2" />
<meta property="og:title" content="NASA (&#064;nasa) &#x2022; Instagram photos and videos" />
</head><body>
<script type="application/json" data-sjs>{"require":[["Other",null,null,[]]]}</script>
<script type="application/json" data-sjs>${JSON.stringify({
  require: [['RelayPrefetchedStreamCache', 'next', [], ['adp_Preloader', { __bbox: { result: { data: { xig_user_by_username: { polaris_ordered_timeline_connection: connection } } } } }]]],
})}</script>
</body></html>`

describe('parseInstagramProfilePage', () => {
  it('reads the posts the page comes with, and the profile from its preview tags', () => {
    const { info, posts } = parseInstagramProfilePage(
      instagramPage({
        edges: [
          { node: { pk: '4008597565992995700', code: 'DehZj9wggt0', product_type: 'clips', caption: { text: 'Wolves' }, display_uri: 'https://cdn/1.jpg' } },
          { node: { pk: '4008597565992995700', code: 'DeoDubaF_gp', product_type: 'feed', caption: null, display_uri: 'https://cdn/2.jpg' } },
          { node: { code: null } },
        ],
      }),
      'nasa',
    )
    expect(info).toEqual({ name: 'NASA', avatar: 'https://cdn/pic.jpg?a=1&b=2' })
    expect(posts.map((post) => [post.url, post.text, post.image])).toEqual([
      ['https://www.instagram.com/reel/DehZj9wggt0/', 'Wolves', 'https://cdn/1.jpg'],
      ['https://www.instagram.com/p/DeoDubaF_gp/', '', 'https://cdn/2.jpg'],
    ])
    expect(posts[0].createdAtMs).toBe(Date.parse('2026-10-15T16:34:49.658Z'))
  })

  it('throws on a page without its posts, as Instagram serves one to a request that does not look like a browser', () => {
    expect(() => parseInstagramProfilePage('<html><meta property="og:title" content="NASA (@nasa)"></html>', 'nasa')).toThrow()
  })
})

describe('formatPostAge', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  it('is short for a recent post', () => {
    expect(formatPostAge(now, now)).toBe('1m')
    expect(formatPostAge(now - 5 * 60000, now)).toBe('5m')
    expect(formatPostAge(now - 3 * 3600000, now)).toBe('3h')
    expect(formatPostAge(now - 2 * 86400000, now)).toBe('2d')
  })

  it('is the date for a post older than a week', () => {
    expect(formatPostAge(Date.parse('2026-10-01T12:00:00Z'), now, 'en-US')).toBe('Oct 1')
  })
})

describe('watchIntervalMinutes', () => {
  it('is the choice of the profile, or else the one for all', () => {
    expect(watchIntervalMinutes({ checkIntervalMinutes: 15 }, 60)).toBe(15)
    expect(watchIntervalMinutes({}, 60)).toBe(60)
  })
})

describe('backgroundIntervalMinutes', () => {
  it('is that of the profile checked most often', () => {
    expect(backgroundIntervalMinutes([{}, { checkIntervalMinutes: 30 }, { checkIntervalMinutes: 1440 }], 60)).toBe(30)
    expect(backgroundIntervalMinutes([{}], 180)).toBe(180)
  })

  it('is never shorter than the system allows', () => {
    expect(backgroundIntervalMinutes([{ checkIntervalMinutes: 5 }], 60)).toBe(15)
  })
})

describe('splitInterval', () => {
  it('uses the largest whole unit', () => {
    expect(splitInterval(30)).toEqual({ unit: 'minutes', count: 30 })
    expect(splitInterval(180)).toEqual({ unit: 'hours', count: 3 })
    expect(splitInterval(1440)).toEqual({ unit: 'days', count: 1 })
    expect(splitInterval(90)).toEqual({ unit: 'minutes', count: 90 })
  })
})

describe('mergeWatchPosts', () => {
  it('reports no post of the first fetch as new', () => {
    const { posts, fresh } = mergeWatchPosts([], [fetched('1', 10), fetched('2', 20)], { now: 99, initial: true })
    expect(posts.map((post) => post.id)).toEqual(['2', '1'])
    expect(posts.every((post) => post.firstSeenAt === 0)).toBe(true)
    expect(fresh).toEqual([])
  })

  it('reports what was posted since as new, and nothing twice', () => {
    const existing = [kept('2', 20), kept('1', 10)]
    const { posts, fresh } = mergeWatchPosts(existing, [fetched('3', 30), fetched('2', 20)], { now: 99, initial: false })
    expect(posts.map((post) => post.id)).toEqual(['3', '2', '1'])
    expect(fresh.map((post) => [post.id, post.firstSeenAt])).toEqual([['3', 99]])
  })

  it('brings a post fetched again up to date, and keeps when it was first seen', () => {
    const { posts, fresh } = mergeWatchPosts([kept('1', 0, 5)], [{ ...fetched('1', 10), text: 'edited' }], { now: 99, initial: false })
    expect(posts).toEqual([{ ...kept('1', 10, 5), text: 'edited' }])
    expect(fresh).toEqual([])
  })

  it('keeps an older post that only now shows up, without reporting it', () => {
    const { posts, fresh } = mergeWatchPosts([kept('2', 20)], [fetched('1', 10)], { now: 99, initial: false })
    expect(posts.map((post) => post.id)).toEqual(['2', '1'])
    expect(fresh).toEqual([])
  })

  it('keeps no more than the latest posts of a profile', () => {
    const many = Array.from({ length: 60 }, (_, i) => fetched(String(i), i))
    const { posts } = mergeWatchPosts([], many, { now: 99, initial: true })
    expect(posts).toHaveLength(50)
    expect(posts[0].id).toBe('59')
  })
})
