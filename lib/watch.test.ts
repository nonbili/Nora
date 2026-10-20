import { describe, expect, it } from 'bun:test'
import {
  backgroundIntervalMinutes,
  dueWatchProfiles,
  formatPostAge,
  instagramUrlExpiresAt,
  mediaExpired,
  mediaExtension,
  mediaFileName,
  mediaKey,
  mediaToEvict,
  blueskyVideoDids,
  didDocumentUrl,
  expandBlueskyLinks,
  parseDidDocumentPds,
  parseThreadsPostPage,
  getWatchTarget,
  htmlToText,
  parseBlueskyFeed,
  mastodonLookupUrl,
  mastodonWebFingerUrl,
  parseMastodonStatuses,
  parseMastodonWebFinger,
  parseRedditFeed,
  parseThreadsProfilePage,
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
  sortWatchSources,
  feedChipSources,
  filterWatchSources,
  watchIntervalMinutes,
  watchKey,
  watchProfileUrl,
  watchSourceLabel,
  type WatchPost,
  type WatchSourceSort,
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

  it('reads the handle from a profile on Threads', () => {
    expect(getWatchTarget('https://www.threads.com/@zuck')).toEqual({ site: 'threads', handle: 'zuck' })
    expect(getWatchTarget('https://threads.net/@mosseri/replies')).toEqual({ site: 'threads', handle: 'mosseri' })
    expect(getWatchTarget('https://www.threads.com/@zuck/post/DeZtp-TkQHh')).toBeNull()
  })

  it('reads the handle or id from a profile on Bluesky', () => {
    expect(getWatchTarget('https://bsky.app/profile/bsky.app')).toEqual({ site: 'bluesky', handle: 'bsky.app' })
    expect(getWatchTarget('https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/')).toEqual({
      site: 'bluesky',
      handle: 'did:plc:z72i7hdynmk6r22z27h6tvur',
    })
    expect(getWatchTarget('https://bsky.app/profile/bsky.app/post/3my43eyfzs225')).toBeNull()
    expect(getWatchTarget('https://bsky.app/@bsky.app')).toBeNull()
    expect(getWatchTarget('https://bsky.app/profile/did:plc:%')).toBeNull()
  })

  it('reads a subreddit or a user on Reddit', () => {
    expect(getWatchTarget('https://www.reddit.com/r/pics/')).toEqual({ site: 'reddit', handle: 'r/pics' })
    expect(getWatchTarget('https://old.reddit.com/r/pics/new')).toEqual({ site: 'reddit', handle: 'r/pics' })
    expect(getWatchTarget('https://www.reddit.com/user/spez/submitted/')).toEqual({ site: 'reddit', handle: 'u/spez' })
    expect(getWatchTarget('https://www.reddit.com/u/spez')).toEqual({ site: 'reddit', handle: 'u/spez' })
    expect(getWatchTarget('https://www.reddit.com/r/pics/comments/1x9os2h/a_walk/')).toBeNull()
  })

  it('reads a profile on a Mastodon server, local or of another server', () => {
    expect(getWatchTarget('https://mastodon.social/@Gargron')).toEqual({ site: 'mastodon', handle: 'Gargron@mastodon.social' })
    expect(getWatchTarget('https://mastodon.social/@anja@chaos.social')).toEqual({ site: 'mastodon', handle: 'anja@chaos.social' })
    expect(getWatchTarget('https://mastodon.social/@Gargron/117452735190662392')).toBeNull()
    expect(getWatchTarget('https://www.youtube.com/@NASA')).toBeNull()
    expect(getWatchTarget('https://www.tiktok.com/@nasa')).toBeNull()
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

describe('watchProfileUrl', () => {
  it('is the page of the profile on its site', () => {
    expect(watchProfileUrl({ site: 'threads', handle: 'zuck' })).toBe('https://www.threads.com/@zuck')
    expect(watchProfileUrl({ site: 'bluesky', handle: 'bsky.app' })).toBe('https://bsky.app/profile/bsky.app')
    expect(watchProfileUrl({ site: 'mastodon', handle: 'anja@chaos.social' })).toBe('https://chaos.social/@anja')
    expect(watchProfileUrl({ site: 'reddit', handle: 'r/pics' })).toBe('https://www.reddit.com/r/pics/')
    expect(watchProfileUrl({ site: 'reddit', handle: 'u/spez' })).toBe('https://www.reddit.com/user/spez/')
    // Or the page the site told of.
    expect(watchProfileUrl({ site: 'mastodon', handle: 'alice@example.org', url: 'https://social.example.org/@alice' })).toBe(
      'https://social.example.org/@alice',
    )
  })
})

describe('watchSourceLabel', () => {
  it('is the handle with an @, but a subreddit or user of Reddit as Reddit names it', () => {
    expect(watchSourceLabel({ site: 'x', handle: 'NASA' })).toBe('@NASA')
    expect(watchSourceLabel({ site: 'mastodon', handle: 'anja@chaos.social' })).toBe('@anja@chaos.social')
    expect(watchSourceLabel({ site: 'reddit', handle: 'r/pics' })).toBe('r/pics')
  })
})

describe('htmlToText', () => {
  it('keeps paragraphs and line breaks, mentions and hashtags as shown, and other links in full', () => {
    const html =
      '<p>Hi <span class="h-card"><a href="https://sunny.garden/@kurio" class="u-url mention">@<span>kurio</span></a></span> &amp; all<br>' +
      '<a href="https://chaos.social/tags/cats" class="mention hashtag" rel="tag">#<span>cats</span></a></p>' +
      '<p><a href="https://www.rawstory.com/no-kings/" rel="nofollow"><span class="invisible">https://www.</span><span class="ellipsis">rawstory.com/no-k</span></a></p>'
    expect(htmlToText(html)).toBe('Hi @kurio & all\n#cats\n\nhttps://www.rawstory.com/no-kings/')
  })

  it('makes a link within the site whole', () => {
    expect(htmlToText('<p>see <a href="/r/RDDT/comments/1">this</a></p>', 'https://www.reddit.com')).toBe(
      'see https://www.reddit.com/r/RDDT/comments/1',
    )
  })
})

describe('parseThreadsProfilePage', () => {
  const post = (code: string, extra: object = {}) => ({
    pk: '1',
    code,
    taken_at: 1791824189,
    user: { username: 'zuck' },
    caption: { text: `post ${code}` },
    image_versions2: { candidates: [{ url: `https://cdn/${code}.jpg`, width: 1080, height: 1350 }] },
    original_width: 1080,
    original_height: 1350,
    ...extra,
  })
  const page = (edges: unknown[]) =>
    '<meta property="og:title" content="Mark Zuckerberg (&#064;zuck) &#x2022; Threads, Say more" />' +
    '<meta property="og:image" content="https://cdn/avatar.jpg" />' +
    `<script type="application/json" data-sjs>${JSON.stringify({ require: [[{ result: { data: { mediaData: { edges } } } }]] })}</script>`

  it('reads the first post of each thread, its photos and video, and the profile from its preview tags', () => {
    const result = parseThreadsProfilePage(
      page([
        { node: { thread_items: [{ post: post('A') }, { post: post('A2') }] } },
        { node: { thread_items: [{ post: post('B', { video_versions: [{ url: 'https://cdn/B.mp4' }] }) }] } },
        {
          node: {
            thread_items: [
              {
                post: post('C', {
                  carousel_media: [
                    { image_versions2: { candidates: [{ url: 'https://cdn/C1.jpg' }] } },
                    { image_versions2: { candidates: [{ url: 'https://cdn/C2.jpg' }] }, video_versions: [{ url: 'https://cdn/C2.mp4' }] },
                  ],
                }),
              },
            ],
          },
        },
        { node: { thread_items: [{ post: post('D', { taken_at: 1791900000, image_versions2: null, text_post_app_info: { share_info: { reposted_post: post('E', { user: { username: 'mosseri' } }) } } }) }] } },
      ]),
      'zuck',
    )
    expect(result.info).toEqual({ name: 'Mark Zuckerberg', avatar: 'https://cdn/avatar.jpg' })
    expect(result.posts.map((p) => p.id)).toEqual(['A', 'B', 'C', 'E'])
    expect(result.posts[0]).toMatchObject({
      url: 'https://www.threads.com/@zuck/post/A',
      text: 'post A',
      createdAtMs: 1791824189000,
      media: [{ type: 'image', url: 'https://cdn/A.jpg', width: 1080, height: 1350 }],
    })
    expect(result.posts[1].media).toEqual([{ type: 'video', url: 'https://cdn/B.mp4', thumb: 'https://cdn/B.jpg', width: 1080, height: 1350 }])
    expect(result.posts[2].media?.map((item) => item.url)).toEqual(['https://cdn/C1.jpg', 'https://cdn/C2.mp4'])
    expect(result.posts[3]).toMatchObject({ url: 'https://www.threads.com/@mosseri/post/E', repostOf: 'mosseri', createdAtMs: 1791900000000 })
  })

  it('throws on a page without its posts', () => {
    expect(() => parseThreadsProfilePage('<html></html>', 'zuck')).toThrow('no posts in the page')
  })
})

describe('parseThreadsPostPage', () => {
  const media = (code: string, extra: object) => ({ code, user: { username: 'zuck' }, ...extra })
  const page = (data: object) =>
    `<script type="application/json" data-sjs>${JSON.stringify({ require: [[{ __bbox: { result: { data } } }]] })}</script>`

  it('reads the photos and videos of the post asked for, not of the posts shown with it', () => {
    const html = page({
      relatedPosts: { threads: [{ thread_items: [{ post: media('X', { image_versions2: { candidates: [{ url: 'https://cdn/x.jpg' }] } }) }] }] },
      media: media('C', {
        image_versions2: { candidates: [{ url: 'https://cdn/cover.jpg' }] },
        carousel_media: [
          { image_versions2: { candidates: [{ url: 'https://cdn/c1.jpg?oe=6AD79413' }] } },
          { image_versions2: { candidates: [{ url: 'https://cdn/c2.jpg' }] }, video_versions: [{ url: 'https://cdn/c2.mp4' }] },
        ],
      }),
    })
    expect(parseThreadsPostPage(html, 'C').map((item) => item.url)).toEqual(['https://cdn/c1.jpg?oe=6AD79413', 'https://cdn/c2.mp4'])
  })

  it('throws on a page without the post', () => {
    expect(() => parseThreadsPostPage(page({ media: null }), 'C')).toThrow('no media in the post page')
  })
})

describe('expandBlueskyLinks', () => {
  it('puts the full address in place of a shortened link, counting in bytes of UTF-8', () => {
    const text = 'café → example.com/a... ok'
    const start = new TextEncoder().encode('café → ').length
    const end = start + 'example.com/a...'.length
    const facets = [{ index: { byteStart: start, byteEnd: end }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/abc' }] }]
    expect(expandBlueskyLinks(text, facets)).toBe('café → https://example.com/abc ok')
  })

  it('leaves the text as it is without links', () => {
    expect(expandBlueskyLinks('hi @bsky.app', [{ index: { byteStart: 3, byteEnd: 12 }, features: [{ $type: 'app.bsky.richtext.facet#mention' }] }])).toBe(
      'hi @bsky.app',
    )
  })
})

describe('parseBlueskyFeed', () => {
  const did = 'did:plc:z72i7hdynmk6r22z27h6tvur'
  const author = { did, handle: 'bsky.app', displayName: 'Bluesky', avatar: 'https://cdn/avatar' }

  it('reads posts, reposts at the time they were reposted, photos and videos, and the profile', () => {
    const result = parseBlueskyFeed(
      {
        feed: [
          {
            post: {
              uri: `at://${did}/app.bsky.feed.post/3mxyyerrxak2m`,
              author,
              record: { text: 'v1.135 is live!', createdAt: '2026-10-16T16:23:26.498Z' },
              embed: {
                $type: 'app.bsky.embed.video#view',
                cid: 'bafkvideo',
                thumbnail: 'https://video/thumbnail.jpg',
                aspectRatio: { width: 1000, height: 1000 },
              },
            },
          },
          {
            post: {
              uri: 'at://did:plc:other/app.bsky.feed.post/3mxu23gu4yc2f',
              author: { did: 'did:plc:other', handle: 'stephen.bsky.social' },
              record: { text: 'buildings', createdAt: '2026-10-14T17:10:41.835Z' },
              embed: {
                $type: 'app.bsky.embed.recordWithMedia#view',
                media: {
                  $type: 'app.bsky.embed.images#view',
                  images: [{ thumb: 'https://cdn/thumb', fullsize: 'https://cdn/full', aspectRatio: { width: 736, height: 414 } }],
                },
              },
            },
            reason: { $type: 'app.bsky.feed.defs#reasonRepost', by: author, indexedAt: '2026-10-16T17:23:53.466Z' },
          },
          {
            post: {
              uri: `at://${did}/app.bsky.feed.post/3mxxid5w4kc2p`,
              author,
              record: { text: 'read this', createdAt: '2026-10-16T02:03:32.500Z' },
              embed: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://example.com/story', thumb: 'https://cdn/card' } },
            },
          },
        ],
      },
      'bsky.app',
    )
    expect(result.info).toEqual({ name: 'Bluesky', avatar: 'https://cdn/avatar' })
    expect(result.posts[0]).toMatchObject({
      id: `${did}/3mxyyerrxak2m`,
      url: 'https://bsky.app/profile/bsky.app/post/3mxyyerrxak2m',
      image: 'https://video/thumbnail.jpg',
      media: [
        {
          type: 'video',
          url: `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=bafkvideo`,
          thumb: 'https://video/thumbnail.jpg',
          width: 1000,
          height: 1000,
        },
      ],
      createdAtMs: Date.parse('2026-10-16T16:23:26.498Z'),
    })
    expect(result.posts[1]).toMatchObject({
      id: 'did:plc:other/3mxu23gu4yc2f',
      url: 'https://bsky.app/profile/stephen.bsky.social/post/3mxu23gu4yc2f',
      media: [{ type: 'image', url: 'https://cdn/full', thumb: 'https://cdn/thumb', width: 736, height: 414 }],
      createdAtMs: Date.parse('2026-10-16T17:23:53.466Z'),
      repostOf: 'stephen.bsky.social',
    })
    expect(result.posts[2]).toMatchObject({ text: 'read this\nhttps://example.com/story', image: 'https://cdn/card', media: [] })
  })

  it('asks for a video at the server its account is on, and finds those accounts in the feed', () => {
    const json = {
      feed: [
        {
          post: {
            uri: 'at://did:plc:self/app.bsky.feed.post/1',
            author: { did: 'did:plc:self', handle: 'me.example' },
            record: { text: '', createdAt: '2026-10-16T16:23:26.498Z' },
            embed: { $type: 'app.bsky.embed.video#view', cid: 'bafkvideo' },
          },
        },
        {
          post: {
            uri: 'at://did:plc:other/app.bsky.feed.post/2',
            author: { did: 'did:plc:other', handle: 'other.example' },
            record: { text: '', createdAt: '2026-10-15T16:23:26.498Z' },
            embed: { $type: 'app.bsky.embed.images#view', images: [] },
          },
        },
      ],
    }
    expect(blueskyVideoDids(json)).toEqual(['did:plc:self'])
    const result = parseBlueskyFeed(json, 'me.example', (did) => (did === 'did:plc:self' ? 'https://pds.example' : undefined))
    expect(result.posts[0].media?.[0].url).toBe('https://pds.example/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aself&cid=bafkvideo')
  })

  it('throws on an answer that is not a feed', () => {
    expect(() => parseBlueskyFeed({ error: 'InvalidRequest', message: 'Profile not found' }, 'nobody')).toThrow('Profile not found')
  })
})

describe('Bluesky servers', () => {
  it('finds the document of an account\'s id', () => {
    expect(didDocumentUrl('did:plc:z72i7hdynmk6r22z27h6tvur')).toBe('https://plc.directory/did:plc:z72i7hdynmk6r22z27h6tvur')
    expect(didDocumentUrl('did:web:example.com')).toBe('https://example.com/.well-known/did.json')
    expect(didDocumentUrl('did:web:example.com%3A8443:user:alice')).toBe('https://example.com:8443/user/alice/did.json')
    expect(didDocumentUrl('did:key:z6Mk')).toBeUndefined()
  })

  it('reads the server an account is on from the document', () => {
    const json = {
      id: 'did:plc:z72i7hdynmk6r22z27h6tvur',
      service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://puffball.us-east.host.bsky.network/' }],
    }
    expect(parseDidDocumentPds(json)).toBe('https://puffball.us-east.host.bsky.network')
    expect(parseDidDocumentPds({ service: [{ id: '#atproto_pds', serviceEndpoint: 'http://insecure.example' }] })).toBeUndefined()
    expect(parseDidDocumentPds({})).toBeUndefined()
  })
})

describe('parseMastodonStatuses', () => {
  it('reads posts and boosts, with their media, linked on the profile\'s own server', () => {
    const result = parseMastodonStatuses(
      { id: '1', display_name: 'Eugen Rochko', avatar: 'https://files/avatar.png', url: 'https://mastodon.social/@Gargron' },
      [
        {
          id: '10',
          uri: 'https://mastodon.social/users/Gargron/statuses/10',
          created_at: '2026-10-17T18:22:55.836Z',
          content: '<p>A picture</p>',
          spoiler_text: '',
          account: { acct: 'Gargron' },
          media_attachments: [
            { type: 'image', url: 'https://files/a.jpg', preview_url: 'https://files/small/a.jpg', meta: { original: { width: 2494, height: 3325 } } },
            { type: 'audio', url: 'https://files/a.mp3' },
          ],
        },
        {
          id: '11',
          created_at: '2026-10-18T15:09:06.289Z',
          content: '',
          reblog: {
            id: '9',
            uri: 'https://chaos.social/users/anja/statuses/123',
            content: '<p>Lunch</p>',
            spoiler_text: 'food',
            account: { acct: 'anja@chaos.social' },
            media_attachments: [{ type: 'gifv', url: 'https://files/b.mp4', preview_url: 'https://files/b.png', meta: {} }],
          },
        },
      ],
      'Gargron@mastodon.social',
    )
    expect(result.info).toEqual({ name: 'Eugen Rochko', avatar: 'https://files/avatar.png', url: 'https://mastodon.social/@Gargron' })
    expect(result.posts[0]).toMatchObject({
      id: 'https://mastodon.social/users/Gargron/statuses/10',
      url: 'https://mastodon.social/@Gargron/10',
      text: 'A picture',
      image: 'https://files/small/a.jpg',
      media: [{ type: 'image', url: 'https://files/a.jpg', thumb: 'https://files/small/a.jpg', width: 2494, height: 3325 }],
    })
    expect(result.posts[1]).toMatchObject({
      // As any server has it, so the post boosted by profiles on two servers is one.
      id: 'https://chaos.social/users/anja/statuses/123',
      url: 'https://mastodon.social/@anja@chaos.social/9',
      text: 'food\n\nLunch',
      media: [{ type: 'video', url: 'https://files/b.mp4', thumb: 'https://files/b.png' }],
      createdAtMs: Date.parse('2026-10-18T15:09:06.289Z'),
      repostOf: 'anja@chaos.social',
    })
  })

  it('links the posts on the server the account is on, when that is not its domain', () => {
    const result = parseMastodonStatuses(
      {},
      [{ id: '5', uri: 'https://social.example.org/users/alice/statuses/5', created_at: '2026-10-17T18:22:55.836Z', content: '', account: { acct: 'alice' }, media_attachments: [] }],
      'alice@example.org',
      'social.example.org',
    )
    expect(result.posts[0].url).toBe('https://social.example.org/@alice/5')
  })

  it('throws on an answer that is not a list of posts', () => {
    expect(() => parseMastodonStatuses({}, { error: 'This API requires an authenticated user' }, 'a@b.social')).toThrow(
      'This API requires an authenticated user',
    )
  })
})

describe('Mastodon servers', () => {
  it('looks up the whole handle, on its domain or on the server given', () => {
    expect(mastodonLookupUrl('alice@example.org')).toBe('https://example.org/api/v1/accounts/lookup?acct=alice%40example.org')
    expect(mastodonLookupUrl('alice@example.org', 'social.example.org')).toBe(
      'https://social.example.org/api/v1/accounts/lookup?acct=alice%40example.org',
    )
    expect(mastodonWebFingerUrl('alice@example.org')).toBe('https://example.org/.well-known/webfinger?resource=acct%3Aalice%40example.org')
  })

  it('reads the server an account is on from its WebFinger answer', () => {
    const json = {
      subject: 'acct:alice@example.org',
      links: [
        { rel: 'http://webfinger.net/rel/profile-page', type: 'text/html', href: 'https://social.example.org/@alice' },
        { rel: 'self', type: 'application/activity+json', href: 'https://social.example.org/users/alice' },
      ],
    }
    expect(parseMastodonWebFinger(json)).toBe('social.example.org')
    expect(() => parseMastodonWebFinger({ links: [] })).toThrow('no account')
  })
})

describe('parseRedditFeed', () => {
  const escape = (html: string) => html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const entry = (id: string, title: string, content: string, thumb?: string) =>
    `<entry><author><name>/u/someone</name></author><content type="html">${escape(content)}</content><id>t3_${id}</id>` +
    (thumb ? `<media:thumbnail url="${thumb.replace(/&/g, '&amp;')}" />` : '') +
    `<link href="https://www.reddit.com/r/pics/comments/${id}/x/" /><updated>2026-10-19T05:48:42+00:00</updated>` +
    `<published>2026-10-19T05:48:42+00:00</published><title>${escape(title)}</title></entry>`
  const feed = (entries: string[]) =>
    '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">' +
    '<logo>https://thumbs/pics.png</logo><title>newest submissions : pics</title>' +
    entries.join('') +
    '</feed>'

  it('reads a photo, a post of text, and a shared link, each with its title', () => {
    const result = parseRedditFeed(
      feed([
        entry(
          '1x9os2h',
          'A walk & a view',
          '<table><tr><td><img src="https://preview.redd.it/a.jpeg?width=640&amp;s=1" /></td><td> <span><a href="https://i.redd.it/a.jpeg">[link]</a></span> <span><a href="https://www.reddit.com/r/pics/comments/1x9os2h/x/">[comments]</a></span></td></tr></table>',
          'https://preview.redd.it/a.jpeg?width=640&s=1',
        ),
        entry(
          '1vgbkge',
          'Hello',
          '<!-- SC_OFF --><div class="md"><p>Hi &amp; welcome</p> <p>see <a href="/r/RDDT/">r/RDDT</a></p></div><!-- SC_ON --> <span><a href="https://www.reddit.com/r/pics/comments/1vgbkge/x/">[link]</a></span>',
        ),
        entry('1t4nr7v', 'A podcast', '<span><a href="https://example.com/podcast">[link]</a></span>', 'https://external-preview.redd.it/p.jpeg?width=140&s=2'),
      ]),
      'r/pics',
    )
    expect(result.info).toEqual({ avatar: 'https://thumbs/pics.png' })
    expect(result.posts[0]).toMatchObject({
      id: '1x9os2h',
      url: 'https://www.reddit.com/r/pics/comments/1x9os2h/x/',
      text: 'A walk & a view',
      image: 'https://preview.redd.it/a.jpeg?width=640&s=1',
      media: [{ type: 'image', url: 'https://i.redd.it/a.jpeg', thumb: 'https://preview.redd.it/a.jpeg?width=640&s=1' }],
      createdAtMs: Date.parse('2026-10-19T05:48:42+00:00'),
    })
    expect(result.posts[1]).toMatchObject({ text: 'Hello\n\nHi & welcome\n\nsee https://www.reddit.com/r/RDDT/', media: [] })
    expect(result.posts[2]).toMatchObject({
      text: 'A podcast\n\nhttps://example.com/podcast',
      image: 'https://external-preview.redd.it/p.jpeg?width=140&s=2',
      media: [],
    })
  })

  it('throws on what is not a feed, as the page Reddit blocks a request with', () => {
    expect(() => parseRedditFeed('<html>blocked</html>', 'r/pics')).toThrow('no feed')
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
    expect(mediaFileName({ site: 'reddit', handle: 'r/pics', id: 'abc' }, 0, { type: 'image', url: 'https://i.redd.it/a.png' })).toBe(
      'reddit_r_pics_abc_1.png',
    )
    expect(
      mediaFileName({ site: 'mastodon', handle: 'a@b.social', id: 'https://b.social/users/a/statuses/1' }, 0, { type: 'image', url: 'https://f/a.png' }),
    ).toBe('mastodon_a_b.social_https___b.social_users_a_statuses_1_1.png')
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

describe('sortWatchSources', () => {
  const source = (handle: string, addedAt: number, lastSuccessAt?: number, name?: string) => ({
    key: `x:${handle}`,
    site: 'x' as const,
    handle,
    name,
    addedAt,
    lastSuccessAt,
  })
  const sources = [source('bob', 2, 20), source('amy', 3), source('carl', 1, 30, 'Zed')]
  const newestPostAt = { 'x:bob': 50, 'x:carl': 40 }
  const order = (sort: WatchSourceSort, reversed?: boolean) =>
    sortWatchSources(sources, newestPostAt, sort, reversed).map((current) => current.handle)

  it('orders by name, the shown one before the handle', () => {
    expect(order('name')).toEqual(['amy', 'bob', 'carl'])
    expect(order('name', true)).toEqual(['carl', 'bob', 'amy'])
  })

  it('orders by time newest first, with those that have none last either way', () => {
    expect(order('updated')).toEqual(['bob', 'carl', 'amy'])
    expect(order('updated', true)).toEqual(['carl', 'bob', 'amy'])
    expect(order('added')).toEqual(['amy', 'bob', 'carl'])
    expect(order('synced')).toEqual(['carl', 'bob', 'amy'])
    expect(order('synced', true)).toEqual(['bob', 'carl', 'amy'])
  })
})

describe('feedChipSources', () => {
  const source = (handle: string) => ({ key: `x:${handle}`, site: 'x' as const, handle, addedAt: 0 })
  const sources = [source('old'), source('quiet'), source('new'), source('unread')]
  const newestPostAt = { 'x:old': 10, 'x:new': 30, 'x:unread': 20 }
  const unread = new Set(['x:unread'])
  const handles = (list: { handle: string }[]) => list.map((current) => current.handle)

  it('puts those with unread posts first, then the latest to post', () => {
    const { shown, hidden } = feedChipSources(sources, newestPostAt, unread, 10)
    expect(handles(shown)).toEqual(['unread', 'new', 'old', 'quiet'])
    expect(hidden).toBe(0)
  })

  it('stops at the limit, and keeps the one shown past it', () => {
    expect(feedChipSources(sources, newestPostAt, unread, 2)).toMatchObject({ hidden: 2 })
    const { shown, hidden } = feedChipSources(sources, newestPostAt, unread, 2, 'x:quiet')
    expect(handles(shown)).toEqual(['unread', 'new', 'quiet'])
    expect(hidden).toBe(1)
  })
})

describe('filterWatchSources', () => {
  const sources = [
    { site: 'x' as const, handle: 'NASA', name: 'NASA' },
    { site: 'instagram' as const, handle: 'nasa' },
    { site: 'reddit' as const, handle: 'r/pics', name: 'Pictures' },
  ]
  const sites = (query: string, site?: 'x' | 'reddit') => filterWatchSources(sources, query, site).map((current) => current.site)

  it('matches name, handle and site, without case or a leading @', () => {
    expect(sites('nasa')).toEqual(['x', 'instagram'])
    expect(sites('@nasa insta')).toEqual(['instagram'])
    expect(sites('pictures')).toEqual(['reddit'])
    expect(sites('')).toEqual(['x', 'instagram', 'reddit'])
  })

  it('keeps to the site chosen', () => {
    expect(sites('nasa', 'x')).toEqual(['x'])
    expect(sites('', 'reddit')).toEqual(['reddit'])
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
    const many = Array.from({ length: 120 }, (_, i) => fetched(String(i), i))
    const { posts } = mergeWatchPosts([], many, { now: 99, initial: true })
    expect(posts).toHaveLength(100)
    expect(posts[0].id).toBe('119')
    expect(mergeWatchPosts([], many, { now: 99, initial: true, max: 50 }).posts).toHaveLength(50)
  })
})
