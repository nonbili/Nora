import { describe, expect, it } from 'bun:test'
import { parseXDate, parseXTimeline, pickXVideoVariant } from './x'

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
            retweeted_status: { id_str: '0', full_text: 'hello', user: { screen_name: 'esa' } },
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
    // A repost by the post it shares, as Nitter tells it; but when it was reposted.
    expect(posts[1]).toMatchObject({
      id: '0',
      url: 'https://x.com/esa/status/0',
      text: 'hello',
      repostOf: 'esa',
      createdAtMs: Date.parse('2026-10-15T20:03:45Z'),
    })
  })

  it('reads the post a post quotes, without the link to it at the end of the text', () => {
    const html = xPage([
      {
        type: 'tweet',
        content: {
          tweet: {
            id_str: '3',
            created_at: 'Fri Oct 16 19:42:20 +0000 2026',
            full_text: 'Look at this https://t.co/q',
            permalink: '/NASA/status/3',
            entities: { urls: [{ url: 'https://t.co/q', expanded_url: 'https://twitter.com/esa/status/7' }] },
            user: nasa,
            quoted_status: {
              id_str: '7',
              created_at: 'Thu Oct 15 20:03:45 +0000 2026',
              full_text: 'Ariane 6 https://t.co/m',
              entities: { media: [{ url: 'https://t.co/m', media_url_https: 'https://pbs.twimg.com/a.jpg' }] },
              user: { screen_name: 'esa', name: 'ESA', profile_image_url_https: 'https://pbs.twimg.com/esa.jpg' },
            },
          },
        },
      },
    ])
    const [post] = parseXTimeline(html, 'nasa').posts
    expect(post.text).toBe('Look at this')
    expect(post.quote).toEqual({
      handle: 'esa',
      name: 'ESA',
      avatar: 'https://pbs.twimg.com/esa.jpg',
      url: 'https://x.com/esa/status/7',
      text: 'Ariane 6',
      media: [{ type: 'image', url: 'https://pbs.twimg.com/a.jpg?name=large', thumb: 'https://pbs.twimg.com/a.jpg', width: undefined, height: undefined }],
      createdAtMs: Date.parse('2026-10-15T20:03:45Z'),
    })
  })

  it('throws on a page without a timeline, so that it is not taken for an empty one', () => {
    expect(() => parseXTimeline('<html>rate limited</html>', 'nasa')).toThrow()
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
