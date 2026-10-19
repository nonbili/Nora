import { describe, expect, it } from 'bun:test'
import {
  backgroundIntervalMinutes,
  dueWatchProfiles,
  findWatchPost,
  formatPostAge,
  instagramUrlExpiresAt,
  mediaExpired,
  mediaExtension,
  mediaFileName,
  mediaKey,
  mediaToEvict,
  getWatchTarget,
  instagramPostTime,
  parseInstagramEmbed,
  parseInstagramProfilePage,
  pickXVideoVariant,
  parseXDate,
  mergeWatchPosts,
  parseInstagramProfileInfo,
  parseXTimeline,
  postKey,
  splitInterval,
  uniquePostsNewestFirst,
  unreadPostKeys,
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

describe('pickXVideoVariant', () => {
  const variants = [
    { content_type: 'application/x-mpegURL', url: 'https://v/playlist.m3u8' },
    { content_type: 'video/mp4', bitrate: 632000, url: 'https://v/320.mp4' },
    { content_type: 'video/mp4', bitrate: 2176000, url: 'https://v/720.mp4' },
    { content_type: 'video/mp4', bitrate: 10368000, url: 'https://v/1080.mp4' },
  ]

  it('takes the best mp4 up to about 720p', () => {
    expect(pickXVideoVariant(variants)).toBe('https://v/720.mp4')
  })

  it('takes the smallest when every one is larger', () => {
    expect(pickXVideoVariant(variants.slice(3))).toBe('https://v/1080.mp4')
  })

  it('is undefined without an mp4', () => {
    expect(pickXVideoVariant(variants.slice(0, 1))).toBeUndefined()
  })
})

const embedPage = (shortcodeMedia: unknown) =>
  `<script>{"require":[["PolarisEmbedSimple","init",[],[{"isRichEmbed":true,"contextJSON":${JSON.stringify(
    JSON.stringify({ context: {}, gql_data: { shortcode_media: shortcodeMedia } }),
  )}}]]]}</script>`

describe('parseInstagramEmbed', () => {
  it('reads the file and cover of a video', () => {
    expect(
      parseInstagramEmbed(
        embedPage({ __typename: 'GraphVideo', is_video: true, display_url: 'https://cdn/c.jpg', video_url: 'https://cdn/v.mp4', dimensions: { width: 1080, height: 1920 } }),
      ),
    ).toEqual([{ type: 'video', url: 'https://cdn/v.mp4', thumb: 'https://cdn/c.jpg', width: 1080, height: 1920 }])
  })

  it('reads each photo and video of a carousel', () => {
    const media = parseInstagramEmbed(
      embedPage({
        __typename: 'GraphSidecar',
        display_url: 'https://cdn/1.jpg',
        edge_sidecar_to_children: {
          edges: [
            { node: { is_video: false, display_url: 'https://cdn/1.jpg' } },
            { node: { is_video: true, display_url: 'https://cdn/2.jpg', video_url: 'https://cdn/2.mp4' } },
          ],
        },
      }),
    )
    expect(media.map((item) => [item.type, item.url])).toEqual([
      ['image', 'https://cdn/1.jpg'],
      ['video', 'https://cdn/2.mp4'],
    ])
  })

  it('reads the largest size of a single photo from the picture of the page', () => {
    const html = `<script>{"contextJSON":null}</script><img class="EmbeddedMediaImage" alt="x" src="https://cdn/s.jpg?a=1&amp;b=2" srcset="https://cdn/640.jpg?a=1&amp;b=2 640w,https://cdn/1080.jpg?a=1&amp;b=2 1080w,https://cdn/320.jpg 320w" />`
    expect(parseInstagramEmbed(html)).toEqual([{ type: 'image', url: 'https://cdn/1080.jpg?a=1&b=2' }])
  })

  it('throws on a page without media', () => {
    expect(() => parseInstagramEmbed('<html>Sorry, this page is not available</html>')).toThrow()
  })
})

describe('mediaToEvict', () => {
  const entry = (postKey: string, index: number, bytes: number, postCreatedAt: number, usedAt = 0) => ({
    key: mediaKey(postKey, index),
    bytes,
    postCreatedAt,
    usedAt,
  })

  it('deletes the media of posts that are no longer kept', () => {
    const entries = [entry('x:1', 0, 10, 1), entry('x:2', 0, 10, 2)]
    expect(mediaToEvict(entries, 1000, new Set(['x:2']))).toEqual([mediaKey('x:1', 0)])
  })

  it('keeps everything under the limit', () => {
    expect(mediaToEvict([entry('x:1', 0, 10, 1)], 100, new Set(['x:1']))).toEqual([])
  })

  it('deletes the media of the oldest posts first, to a little under the limit', () => {
    const entries = [entry('x:3', 0, 40, 3), entry('x:1', 0, 40, 1), entry('x:1', 1, 40, 1), entry('x:2', 0, 40, 2)]
    const live = new Set(['x:1', 'x:2', 'x:3'])
    // 160 over a limit of 100, down to 90 or less: the oldest post's two files bring it to 80.
    expect(mediaToEvict(entries, 100, live)).toEqual([mediaKey('x:1', 0), mediaKey('x:1', 1)])
  })

  it('never deletes a file in use, and takes the next oldest instead', () => {
    const entries = [entry('x:3', 0, 40, 3), entry('x:1', 0, 40, 1), entry('x:1', 1, 40, 1), entry('x:2', 0, 40, 2)]
    const live = new Set(['x:2', 'x:3'])
    const inUse = new Set([mediaKey('x:1', 0)])
    // x:1 is no longer kept, but its first file is being saved; the oldest live post goes in its place.
    expect(mediaToEvict(entries, 60, live, inUse)).toEqual([mediaKey('x:1', 1), mediaKey('x:2', 0)])
  })
})

describe('instagramUrlExpiresAt', () => {
  it('reads when a signed address stops working', () => {
    expect(instagramUrlExpiresAt('https://cdn/a.jpg?stp=x&oe=6ADB6A8C&_nc_sid=1')).toBe(0x6adb6a8c * 1000)
    expect(instagramUrlExpiresAt('https://pbs.twimg.com/media/a.jpg?name=large')).toBeUndefined()
  })
})

describe('mediaExpired', () => {
  const at = 0x6adb6a8c * 1000
  const media = [{ type: 'image' as const, url: 'https://cdn/a.jpg?oe=6ADB6A8C' }]
  it('is true from a little before the address stops working', () => {
    expect(mediaExpired(media, at - 60 * 60 * 1000)).toBe(false)
    expect(mediaExpired(media, at - 60 * 1000)).toBe(true)
  })

  it('is false for addresses that do not expire', () => {
    expect(mediaExpired([{ type: 'image', url: 'https://pbs.twimg.com/a.jpg' }], Date.now())).toBe(false)
  })
})

describe('mediaFileName', () => {
  it('tells the site, profile and post, with the extension of the media', () => {
    const post = { site: 'x' as const, handle: 'NASA', id: '123' }
    expect(mediaFileName(post, 0, { type: 'video', url: 'https://v/a.mp4?tag=1' })).toBe('x_NASA_123_1.mp4')
    expect(mediaFileName(post, 1, { type: 'image', url: 'https://pbs/media/a.png?name=large' })).toBe('x_NASA_123_2.png')
    expect(mediaExtension({ type: 'image', url: 'https://cdn/no-extension' })).toBe('jpg')
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

describe('dueWatchProfiles', () => {
  const now = 10 * 60 * 60 * 1000
  const profiles = [
    { key: 'x:fresh', lastCheckedAt: now - 10 * 1000 },
    { key: 'x:recent', lastCheckedAt: now - 5 * 60 * 1000 },
    { key: 'x:old', lastCheckedAt: now - 2 * 60 * 60 * 1000 },
    { key: 'x:waiting', lastCheckedAt: now - 3 * 60 * 60 * 1000, retryAfter: now + 60 * 1000 },
    { key: 'x:new' },
  ]
  const keysOf = (list: { key: string }[]) => list.map((profile) => profile.key)

  it('checks on its own only those whose interval is up and the site does not hold back', () => {
    expect(keysOf(dueWatchProfiles(profiles, { manual: false, now, defaultMinutes: 60 }))).toEqual(['x:new', 'x:old'])
  })

  it('checks by hand all but those just checked, the oldest first', () => {
    expect(keysOf(dueWatchProfiles(profiles, { manual: true, now, defaultMinutes: 60 }))).toEqual([
      'x:new',
      'x:waiting',
      'x:old',
      'x:recent',
    ])
  })

  it('checks only the profiles asked for', () => {
    const keys = ['x:recent', 'x:fresh']
    expect(keysOf(dueWatchProfiles(profiles, { manual: true, keys, now, defaultMinutes: 60 }))).toEqual(['x:recent'])
    expect(dueWatchProfiles(profiles, { manual: false, keys, now, defaultMinutes: 60 })).toEqual([])
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

describe('findWatchPost', () => {
  it('takes the copy of the given profile, or else any', () => {
    const shared = kept('2', 20)
    const posts = { 'x:a': [{ ...shared, handle: 'a' }], 'x:b': [{ ...shared, handle: 'b' }] }
    expect(findWatchPost(posts, 'x:b', shared.key)?.handle).toBe('b')
    expect(findWatchPost(posts, 'x:c', shared.key)?.handle).toBe('a')
    expect(findWatchPost(posts, 'x:a', 'x:9')).toBeUndefined()
  })
})

describe('uniquePostsNewestFirst', () => {
  it('shows a post two profiles share once, as the first list has it', () => {
    const shared = kept('2', 20)
    const lists = [[kept('3', 30), { ...shared, handle: 'first' }], [{ ...shared, handle: 'second' }, kept('1', 10)], undefined]
    expect(uniquePostsNewestFirst(lists).map((post) => [post.id, post.handle])).toEqual([
      ['3', 'nasa'],
      ['2', 'first'],
      ['1', 'nasa'],
    ])
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

  it('keeps the media read from the embed page over a fetch that only knows the cover', () => {
    const full = [{ type: 'image' as const, url: 'https://cdn/1.jpg' }, { type: 'image' as const, url: 'https://cdn/2.jpg' }]
    const existing = [{ ...kept('1', 10), media: full, mediaComplete: true }]
    const { posts } = mergeWatchPosts(existing, [{ ...fetched('1', 10), media: [full[0]], mediaComplete: false }], { now: 99, initial: false })
    expect(posts[0].media).toEqual(full)
    expect(posts[0].mediaComplete).toBe(true)
  })

  it('keeps the media read from the embed page even once its addresses have expired', () => {
    // Its photos may be kept on the phone; it is read again only for the ones that are not.
    const full = [{ type: 'image' as const, url: 'https://cdn/1.jpg?oe=00000001' }, { type: 'image' as const, url: 'https://cdn/2.jpg?oe=00000001' }]
    const cover = { type: 'image' as const, url: 'https://cdn/cover.jpg' }
    const existing = [{ ...kept('1', 10), media: full, mediaComplete: true }]
    const { posts } = mergeWatchPosts(existing, [{ ...fetched('1', 10), media: [cover], mediaComplete: false }], { now: 99_000, initial: false })
    expect(posts[0].media).toEqual(full)
    expect(posts[0].mediaComplete).toBe(true)
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

describe('unreadPostKeys', () => {
  const posts = {
    'x:a': [kept('1', 1, 0), kept('2', 2, 200), kept('shared', 3, 300)],
    'x:b': [kept('3', 4, 300), kept('shared', 3, 300)],
  }
  const seenAt = (times: Record<string, number>) => (key: string) => times[key] ?? 100

  it('counts the posts first seen after their profile was last shown', () => {
    expect([...unreadPostKeys(posts, ['x:a', 'x:b'], seenAt({}))].sort()).toEqual(['x:2', 'x:3', 'x:shared'])
    expect([...unreadPostKeys(posts, ['x:a'], seenAt({}))].sort()).toEqual(['x:2', 'x:shared'])
    expect([...unreadPostKeys(posts, ['x:a', 'x:b'], seenAt({ 'x:a': 250 }))].sort()).toEqual(['x:3', 'x:shared'])
  })

  it('takes a post two profiles share as read once either was shown', () => {
    expect([...unreadPostKeys(posts, ['x:a', 'x:b'], seenAt({ 'x:b': 300 }))]).toEqual(['x:2'])
    expect([...unreadPostKeys(posts, ['x:a'], seenAt({ 'x:b': 300 }))]).toEqual(['x:2'])
  })
})
