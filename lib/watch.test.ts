import { describe, expect, it } from 'bun:test'
import {
  backgroundIntervalMinutes,
  dueWatchProfiles,
  formatPostAge,
  instagramUrlExpiresAt,
  mediaExpired,
  parseTikTokChainToken,
  parseTikTokItemLists,
  parseTikTokPostPage,
  refreshesMedia,
  tiktokPostPageUrl,
  tiktokUrlExpiresAt,
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
  parseRedditCommunityCard,
  parseRedditListing,
  parseRedditPosts,
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
  isFacebookErrorPage,
  parseFacebookPage,
  parseFacebookPostPage,
  reachesBackTo,
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
  })

  it('reads a profile on TikTok, not one of its videos', () => {
    expect(getWatchTarget('https://www.tiktok.com/@nasa')).toEqual({ site: 'tiktok', handle: 'nasa' })
    expect(getWatchTarget('https://m.tiktok.com/@nat.geo_1/')).toEqual({ site: 'tiktok', handle: 'nat.geo_1' })
    expect(getWatchTarget('https://tiktok.com/@nasa?lang=en')).toEqual({ site: 'tiktok', handle: 'nasa' })
    expect(getWatchTarget('https://www.tiktok.com/@nasa/video/7697300954667994381')).toBeNull()
    expect(getWatchTarget('https://www.tiktok.com/explore')).toBeNull()
  })

  it('reads a page, a profile or a group on Facebook', () => {
    expect(getWatchTarget('https://www.facebook.com/NASA')).toEqual({ site: 'facebook', handle: 'NASA' })
    expect(getWatchTarget('https://m.facebook.com/nasa/posts/')).toEqual({ site: 'facebook', handle: 'nasa' })
    expect(getWatchTarget('https://www.facebook.com/profile.php?id=100044561550831&sk=photos')).toEqual({
      site: 'facebook',
      handle: '100044561550831',
    })
    expect(getWatchTarget('https://www.facebook.com/people/Some-One/61550000000000/')).toEqual({ site: 'facebook', handle: '61550000000000' })
    expect(getWatchTarget('https://www.facebook.com/groups/reactjs/')).toEqual({ site: 'facebook', handle: 'groups/reactjs' })
    expect(getWatchTarget('https://m.facebook.com/groups/1584776928419441/about')).toEqual({
      site: 'facebook',
      handle: 'groups/1584776928419441',
    })
  })

  it('is null for a page on Facebook that is not a page, profile or group', () => {
    expect(getWatchTarget('https://www.facebook.com/')).toBeNull()
    expect(getWatchTarget('https://www.facebook.com/marketplace/')).toBeNull()
    expect(getWatchTarget('https://www.facebook.com/home.php')).toBeNull()
    expect(getWatchTarget('https://m.facebook.com/notifications.php')).toBeNull()
    expect(getWatchTarget('https://www.facebook.com/profile.php')).toBeNull()
    expect(getWatchTarget('https://www.facebook.com/NASA/posts/pfbid0jzaSu71udHuX')).toBeNull()
    expect(getWatchTarget('https://www.facebook.com/groups/reactjs/posts/123/')).toBeNull()
    expect(getWatchTarget('https://www.facebook.com/groups/')).toBeNull()
  })

  it('is null on any other site and for what is not an address', () => {
    expect(getWatchTarget('https://x.com.evil.net/nasa')).toBeNull()
    expect(getWatchTarget('https://www.linkedin.com/company/nasa')).toBeNull()
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
    expect(watchProfileUrl({ site: 'facebook', handle: 'NASA' })).toBe('https://www.facebook.com/NASA/')
    expect(watchProfileUrl({ site: 'facebook', handle: '100044561550831' })).toBe('https://www.facebook.com/profile.php?id=100044561550831')
    expect(watchProfileUrl({ site: 'facebook', handle: 'groups/reactjs' })).toBe('https://www.facebook.com/groups/reactjs/')
    expect(watchProfileUrl({ site: 'tiktok', handle: 'nasa' })).toBe('https://www.tiktok.com/@nasa')
    // Or the page the site told of.
    expect(watchProfileUrl({ site: 'mastodon', handle: 'alice@example.org', url: 'https://social.example.org/@alice' })).toBe(
      'https://social.example.org/@alice',
    )
  })
})

describe('watchSourceLabel', () => {
  it('is the handle with an @, but a subreddit or user of Reddit as Reddit names it, and a group on Facebook as its address does', () => {
    expect(watchSourceLabel({ site: 'x', handle: 'NASA' })).toBe('@NASA')
    expect(watchSourceLabel({ site: 'mastodon', handle: 'anja@chaos.social' })).toBe('@anja@chaos.social')
    expect(watchSourceLabel({ site: 'reddit', handle: 'r/pics' })).toBe('r/pics')
    expect(watchSourceLabel({ site: 'facebook', handle: 'NASA' })).toBe('@NASA')
    expect(watchSourceLabel({ site: 'facebook', handle: 'groups/reactjs' })).toBe('groups/reactjs')
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
    expect(result.posts[2]).toMatchObject({ text: 'read this\nhttps://example.com/story', image: 'https://cdn/card', media: [], link: 'https://example.com/story' })
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

  it('reads the post a post quotes, alone or with media, but not one that is gone', () => {
    const quoted = (rkey: string, embeds?: any[]) => ({
      $type: 'app.bsky.embed.record#viewRecord',
      uri: `at://did:plc:q/app.bsky.feed.post/${rkey}`,
      author: { did: 'did:plc:q', handle: 'grove.bsky.social', displayName: 'Grove', avatar: 'https://cdn/grove' },
      value: { text: 'launching delve.town', facets: [{ index: { byteStart: 10, byteEnd: 20 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://delve.town' }] }], createdAt: '2026-09-30T21:49:38.012Z' },
      embeds,
    })
    const json = {
      feed: [
        {
          post: {
            uri: `at://${did}/app.bsky.feed.post/a`,
            author,
            record: { text: 'very true', createdAt: '2026-10-16T16:23:26.498Z' },
            embed: {
              $type: 'app.bsky.embed.record#view',
              record: quoted('q1', [{ $type: 'app.bsky.embed.video#view', cid: 'bafkq', thumbnail: 'https://video/q.jpg' }]),
            },
          },
        },
        {
          post: {
            uri: `at://${did}/app.bsky.feed.post/b`,
            author,
            record: { text: 'see this', createdAt: '2026-10-15T16:23:26.498Z' },
            embed: {
              $type: 'app.bsky.embed.recordWithMedia#view',
              media: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 'https://cdn/t', fullsize: 'https://cdn/f' }] },
              record: { record: quoted('q2') },
            },
          },
        },
        {
          post: {
            uri: `at://${did}/app.bsky.feed.post/c`,
            author,
            record: { text: 'gone', createdAt: '2026-10-14T16:23:26.498Z' },
            embed: { $type: 'app.bsky.embed.record#view', record: { $type: 'app.bsky.embed.record#viewNotFound', uri: 'at://did:plc:q/app.bsky.feed.post/q3' } },
          },
        },
      ],
    }
    expect(blueskyVideoDids(json)).toEqual(['did:plc:q'])
    const { posts } = parseBlueskyFeed(json, 'bsky.app', (pdsDid) => (pdsDid === 'did:plc:q' ? 'https://pds.example' : undefined))
    expect(posts[0].quote).toEqual({
      handle: 'grove.bsky.social',
      name: 'Grove',
      avatar: 'https://cdn/grove',
      url: 'https://bsky.app/profile/grove.bsky.social/post/q1',
      text: 'launching https://delve.town',
      media: [{ type: 'video', url: 'https://pds.example/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aq&cid=bafkq', thumb: 'https://video/q.jpg', width: undefined, height: undefined }],
      createdAtMs: Date.parse('2026-09-30T21:49:38.012Z'),
    })
    expect(posts[1]).toMatchObject({ media: [{ url: 'https://cdn/f' }], quote: { url: 'https://bsky.app/profile/grove.bsky.social/post/q2', media: [] } })
    expect(posts[2].quote).toBeUndefined()
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
  it('reads the post a post quotes, without the link to it in the text', () => {
    const { posts } = parseMastodonStatuses(
      {},
      [
        {
          id: '12',
          created_at: '2026-10-18T15:09:06.289Z',
          content: '<p class="quote-inline">RE: <a href="https://social.coop/@cwebber/5">social.coop/@cwebber/5</a></p><p>Agreed</p>',
          account: { acct: 'Gargron' },
          quote: {
            state: 'accepted',
            quoted_status: {
              id: '5',
              uri: 'https://social.coop/users/cwebber/statuses/5',
              url: 'https://social.coop/@cwebber/5',
              created_at: '2026-10-14T19:37:13.000Z',
              content: '<p>Spec draft</p>',
              spoiler_text: '',
              account: { acct: 'cwebber@social.coop', display_name: 'Christine', avatar: 'https://files/cw.png' },
              media_attachments: [],
            },
          },
        },
      ],
      'Gargron@mastodon.social',
    )
    expect(posts[0].text).toBe('Agreed')
    expect(posts[0].quote).toEqual({
      handle: 'cwebber@social.coop',
      name: 'Christine',
      avatar: 'https://files/cw.png',
      url: 'https://social.coop/@cwebber/5',
      text: 'Spec draft',
      media: [],
      createdAtMs: Date.parse('2026-10-14T19:37:13.000Z'),
    })
  })

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

describe('parseFacebookPage', () => {
  const actor = (id: string, name: string, url: string) => ({ __typename: 'User', id, name, url })
  const nasa = actor('100044561550831', 'NASA', 'https://www.facebook.com/NASA')
  const photo = (id: string, width: number) => ({
    __typename: 'Photo',
    id,
    image: { uri: `https://scontent.example/${id}_s.jpg?oe=6ADD2A36`, width: 960, height: 1280 },
    // The size for the photo viewer can come without its address.
    viewer_image: width ? { uri: `https://scontent.example/${id}_l.jpg?oe=6ADD2A36`, width, height: Math.round(width * 1.33) } : { width: 1086, height: 1448 },
  })
  const album = {
    __typename: 'Story',
    post_id: '1658876782274358',
    creation_time: 1792181102,
    permalink_url: 'https://www.facebook.com/NASA/posts/pfbid0jza',
    sponsored_data: null,
    actors: [nasa],
    // First only by their ids, then in full.
    attachments: [
      { media: { __typename: 'Photo', id: '1' } },
      { styles: { attachment: { all_subattachments: { nodes: [{ media: photo('1', 1086) }, { media: photo('2', 0) }] } } } },
    ],
    comet_sections: {
      content: { story: { message: { text: 'Float into the weekend...' } } },
      feedback: { story: { comments: [{ body: { text: 'a comment' }, attachment: photo('9', 500) }] } },
    },
  }
  const reel = {
    __typename: 'Story',
    post_id: '1658860588942644',
    permalink_url: 'https://www.facebook.com/reel/1557618349384047/',
    actors: [nasa],
    comet_sections: {
      context_layout: { story: { comet_sections: { metadata: [{ story: { creation_time: 1792179464 } }] } } },
      content: { story: { message: { text: 'The aircraft lineup' } } },
    },
    attachments: [
      {
        styles: {
          attachment: {
            media: {
              __typename: 'Video',
              id: '1557618349384047',
              original_width: 1080,
              original_height: 1920,
              preferred_thumbnail: { image: { uri: 'https://scontent.example/reel.jpg' } },
              videoDeliveryLegacyFields: {
                browser_native_sd_url: 'https://video.example/sd.mp4',
                browser_native_hd_url: 'https://video.example/hd.mp4',
              },
            },
          },
        },
      },
    ],
  }
  const share = {
    __typename: 'Story',
    post_id: '1657000000000001',
    creation_time: 1792000000,
    permalink_url: 'https://www.facebook.com/NASA/posts/pfbid0shared',
    actors: [nasa],
    attached_story: {
      actors: [actor('100064', 'NASA Webb Telescope', 'https://www.facebook.com/NASAWebb')],
      comet_sections: { message: { story: { message: { text: 'A new image from Webb' } } } },
      attachments: [{ media: { __typename: 'Video', id: 'v', image: { uri: 'https://scontent.example/webb.jpg' } } }],
    },
  }
  const ad = { ...album, post_id: '42', sponsored_data: { ad_id: '1' } }
  const page = (documents: any[]) =>
    [
      '<meta property="og:title" content="NASA - National Aeronautics &amp; Space">',
      '<meta property="og:image" content="https://scontent.example/avatar.png">',
      ...documents.map((document) => `<script type="application/json" data-sjs>${JSON.stringify(document)}</script>`),
    ].join('\n')

  it('reads posts, their photos and videos, and the page, from the page and what it brought as it was scrolled', () => {
    const html = page([
      // The page's header, which is there with an account too, unlike its preview tags.
      {
        data: {
          user: {
            profile_header_renderer: {
              user: { name: 'NASA', profilePicLarge: { uri: 'https://scontent.example/header.png' } },
            },
          },
        },
      },
      { require: [[{ __bbox: { result: { data: { user: { timeline_list_feed_units: { edges: [{ node: album }, { node: ad }] } } } } } }]] },
      // An answer brought by scrolling, which has the first post again.
      { data: { node: { timeline_list_feed_units: { edges: [{ node: album }, { node: reel }] } } } },
      { data: { node: { timeline_list_feed_units: { edges: [{ node: share }] } } } },
    ])
    const { info, posts } = parseFacebookPage(html, 'NASA')
    expect(info).toEqual({ name: 'NASA', avatar: 'https://scontent.example/header.png' })
    expect(posts.map((post) => post.id)).toEqual(['1658876782274358', '1658860588942644', '1657000000000001'])
    expect(posts[0]).toMatchObject({
      site: 'facebook',
      handle: 'NASA',
      url: 'https://www.facebook.com/NASA/posts/pfbid0jza',
      text: 'Float into the weekend...',
      createdAtMs: 1792181102000,
      image: 'https://scontent.example/1_s.jpg?oe=6ADD2A36',
      repostOf: undefined,
    })
    expect(posts[0].media).toEqual([
      { type: 'image', url: 'https://scontent.example/1_l.jpg?oe=6ADD2A36', thumb: 'https://scontent.example/1_s.jpg?oe=6ADD2A36', width: 1086, height: 1444 },
      { type: 'image', url: 'https://scontent.example/2_s.jpg?oe=6ADD2A36', thumb: 'https://scontent.example/2_s.jpg?oe=6ADD2A36', width: 960, height: 1280 },
    ])
    expect(posts[1]).toMatchObject({
      createdAtMs: 1792179464000,
      image: 'https://scontent.example/reel.jpg',
      media: [{ type: 'video', url: 'https://video.example/hd.mp4', thumb: 'https://scontent.example/reel.jpg', width: 1080, height: 1920 }],
    })
    // A share of another page's post without a word of its own: its text, and its video only by its cover.
    expect(posts[2]).toMatchObject({ text: 'A new image from Webb', repostOf: 'NASAWebb', image: 'https://scontent.example/webb.jpg', media: [] })
  })

  it("takes a group's name and cover from its header, and else the page's preview tags", () => {
    const group = {
      data: {
        group: {
          profile_header_renderer: {
            group: { name: 'IT Humor', cover_renderer: { cover_photo_content: { photo: { image: { uri: 'https://scontent.example/cover.jpg' } } } } },
          },
        },
      },
    }
    const posts = { data: { node: { group_feed: { edges: [{ node: album }] } } } }
    expect(parseFacebookPage(page([group, posts]), 'groups/ithumor').info).toEqual({ name: 'IT Humor', avatar: 'https://scontent.example/cover.jpg' })
    expect(parseFacebookPage(page([posts]), 'NASA').info).toEqual({
      name: 'NASA - National Aeronautics & Space',
      avatar: 'https://scontent.example/avatar.png',
    })
  })

  it('throws on a page without posts', () => {
    expect(() => parseFacebookPage(page([{ data: { user: { name: 'NASA' } } }]), 'NASA')).toThrow('no posts')
    expect(() => parseFacebookPage(page([{ data: { node: { edges: [{ node: ad }] } } }]), 'NASA')).toThrow('no posts')
  })

  it("reads a post's photos from its own page, and a video's from the video's page", () => {
    const albumPost = { id: album.post_id, url: album.permalink_url }
    // The post's page has other posts too.
    expect(parseFacebookPostPage(page([{ data: { node: { edges: [{ node: reel }, { node: album }] } } }]), albumPost).media.map((item) => item.url)).toEqual([
      'https://scontent.example/1_l.jpg?oe=6ADD2A36',
      'https://scontent.example/2_s.jpg?oe=6ADD2A36',
    ])
    const video = reel.attachments[0].styles.attachment.media
    const videoPage = page([{ data: { video: { ...video, id: '28724537730537162' } } }]).replace('"post_id"', '')
    expect(
      parseFacebookPostPage(videoPage, { id: '1505458718113441', url: 'https://www.facebook.com/reel/28724537730537162/' }),
    ).toEqual({
      media: [{ type: 'video', url: 'https://video.example/hd.mp4', thumb: 'https://scontent.example/reel.jpg', width: 1080, height: 1920 }],
      cover: 'https://scontent.example/reel.jpg',
    })
    expect(parseFacebookPostPage(videoPage, { id: '1505458718113441', url: 'https://www.facebook.com/watch/?ref=x&v=28724537730537162' }).media).toHaveLength(1)
    // A video Facebook only streams, on its page or on the post's: no media, but its cover.
    const streamed = { __typename: 'Video', id: '28724537730537162', preferred_thumbnail: { image: { uri: 'https://scontent.example/streamed.jpg' } } }
    expect(
      parseFacebookPostPage(page([{ data: { video: streamed } }]).replace('"post_id"', ''), { id: '1', url: 'https://www.facebook.com/reel/28724537730537162/' }),
    ).toEqual({ media: [], cover: 'https://scontent.example/streamed.jpg' })
    const shared = { id: share.post_id, url: share.permalink_url }
    expect(parseFacebookPostPage(page([{ data: { node: share } }]), shared)).toEqual({ media: [], cover: 'https://scontent.example/webb.jpg' })
    expect(() => parseFacebookPostPage(page([{ data: { node: reel } }]), albumPost)).toThrow('no post in the page')
  })

  it('tells whether posts read reach back to a time, which a pinned post coming first does not tell', () => {
    const at = (...times: number[]) => times.map((createdAtMs, index) => ({ id: String(index), createdAtMs }))
    expect(reachesBackTo(at(300, 200), 200)).toBe(true)
    expect(reachesBackTo(at(300, 150), 200)).toBe(true)
    expect(reachesBackTo(at(300, 250), 200)).toBe(false)
    // An old pinned post, then a new one.
    expect(reachesBackTo(at(100, 300), 200)).toBe(false)
    // Nothing to reach back to before the first check, and nothing read.
    expect(reachesBackTo(at(300), undefined)).toBe(false)
    expect(reachesBackTo([], 200)).toBe(false)
    // A lone pinned post, told apart.
    expect(reachesBackTo([{ id: 'pinned', createdAtMs: 100 }], 200, ['pinned'])).toBe(false)
    expect(reachesBackTo([{ id: 'new', createdAtMs: 300 }, { id: 'pinned', createdAtMs: 100 }], 200, ['pinned'])).toBe(false)
  })

  it('tells the posts pinned to the top of a page or featured by a group', () => {
    const html = page([
      { data: { user: { profile_pinned_post: { node: { ...album, post_id: '7' } }, timeline_list_feed_units: { edges: [{ node: reel }] } } } },
      { data: { group: { highlight_units: { edges: [{ node: { story: share } }] } } } },
    ])
    expect(parseFacebookPage(html, 'NASA').pinnedIds).toEqual(['7', share.post_id])
  })

  it('tells the page Facebook answers with instead of one it does not show', () => {
    expect(isFacebookErrorPage('{"canonicalRouteName":"comet.fbweb.CometErrorRoute"}')).toBe(true)
    expect(isFacebookErrorPage('{"canonicalRouteName":"comet.fbweb.CometProfilePlusLoggedOutRoute"}')).toBe(false)
  })
})

describe('parseRedditPosts', () => {
  const card = (attributes: string, inner = '') =>
    `<shreddit-post class="block" ${attributes}><a slot="full-post-link" href="x"></a>` +
    '<span slot="authorName"><img src="https://www.redditstatic.com/avatars/a.png" alt="u/someone avatar"></span>' +
    `${inner}</shreddit-post>`
  const page = (cards: string[]) => `<faceplate-batch>${cards.join('<shreddit-ad-post id="t3_ad"></shreddit-ad-post>')}</faceplate-batch>`

  it('reads a photo, a gallery, a gif, a video, a post of text, and a shared link', () => {
    const result = parseRedditPosts(
      page([
        card(
          'permalink="/r/pics/comments/a1/x/" content-href="https://i.redd.it/a.png" created-timestamp="2026-10-20T05:33:19.362000+0000" id="t3_a1" post-title="A walk &amp; a view" post-type="image"',
          '<div slot="post-media-container"><img alt="" role="presentation" src="https://preview.redd.it/a.png?width=640&amp;s=1" width="640" height="402">' +
            '<img data-post-media-primary alt="r/pics - A walk" src="https://preview.redd.it/a.png?width=640&amp;s=1"><img alt="r/pics - A walk" src="https://i.redd.it/a.png"></div>',
        ),
        card(
          'permalink="/r/pics/comments/a2/x/" content-href="https://www.reddit.com/gallery/a2" id="t3_a2" post-title="Two" post-type="gallery"',
          '<gallery-carousel><ul><li slot="page-1"><img src="https://preview.redd.it/b.jpg?width=640" width="4284" height="5712"><figure><zoomable-img><img src="https://i.redd.it/b.jpg"></zoomable-img></figure></li>' +
            '<li slot="page-2"><img width="10" height="20" data-lazy-src="https://preview.redd.it/c.jpg?width=640"><figure><zoomable-img><img src="https://i.redd.it/c.jpg"></zoomable-img></figure></li></ul></gallery-carousel>',
        ),
        card(
          'permalink="/r/pics/comments/a3/x/" content-href="https://i.redd.it/d.gif" id="t3_a3" post-title="Moving" post-type="gif"',
          '<shreddit-player src="https://preview.redd.it/d.gif?width=750&amp;format=mp4&amp;s=2" autoplay gif poster="https://preview.redd.it/d.gif?format=png8"></shreddit-player>',
        ),
        card(
          'permalink="/r/pics/comments/a4/x/" content-href="https://v.redd.it/e" id="t3_a4" post-title="A film" post-type="video"',
          '<shreddit-player src="https://v.redd.it/e/HLSPlaylist.m3u8" poster="https://external-preview.redd.it/e.png"></shreddit-player>',
        ),
        card(
          'permalink="/r/pics/comments/a5/x/" content-href="https://www.reddit.com/r/pics/comments/a5/x/" id="t3_a5" post-title="Hello" post-type="text"',
          '<shreddit-post-text-body slot="text-body"><a slot="text-body"><div><div id="t3_a5-post-rtjson-content" dir="auto">\n  <p>\n Hi &amp; welcome\n </p><p> see <object><a rpl href="/r/RDDT/">r/RDDT</a></object> </p>\n<pre><code>fn main() {\n    x &lt; 1;\n}\n</code></pre>\n<h2> Next </h2><p> Did: </p><ul> <li> <p> one </p> </li><li> <p> two </p> </li> </ul><p> bye </p>\n</div></div></a></shreddit-post-text-body>',
        ),
        card(
          'permalink="/r/pics/comments/a6/x/" content-href="https://example.com/podcast" id="t3_a6" post-title="A podcast" post-type="link" is-link-post',
          '<img src="https://external-preview.redd.it/p.jpeg?width=140&amp;s=3" alt="r/pics - A podcast" loading="lazy">',
        ),
        card('permalink="/r/pics/comments/a7/x/" id="t3_a7" post-title="Buy" promoted'),
      ]),
      'r/pics',
    )
    expect(result.info).toEqual({ avatar: undefined })
    expect(result.posts.map((post) => post.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
    expect(result.posts[0]).toMatchObject({
      url: 'https://www.reddit.com/r/pics/comments/a1/x/',
      text: 'A walk & a view',
      image: 'https://preview.redd.it/a.png?width=640&s=1',
      media: [{ type: 'image', url: 'https://i.redd.it/a.png', thumb: 'https://preview.redd.it/a.png?width=640&s=1', width: 640, height: 402 }],
      createdAtMs: Date.parse('2026-10-20T05:33:19.362Z'),
    })
    expect(result.posts[1].media).toEqual([
      { type: 'image', url: 'https://i.redd.it/b.jpg', thumb: 'https://preview.redd.it/b.jpg?width=640', width: 4284, height: 5712 },
      { type: 'image', url: 'https://i.redd.it/c.jpg', thumb: 'https://preview.redd.it/c.jpg?width=640', width: 10, height: 20 },
    ])
    expect(result.posts[2]).toMatchObject({
      image: 'https://preview.redd.it/d.gif?format=png8',
      media: [{ type: 'video', url: 'https://preview.redd.it/d.gif?width=750&format=mp4&s=2', thumb: 'https://preview.redd.it/d.gif?format=png8' }],
    })
    expect(result.posts[3]).toMatchObject({ text: 'A film', image: 'https://external-preview.redd.it/e.png', media: [] })
    expect(result.posts[4]).toMatchObject({
      text: 'Hello\n\nHi & welcome\n\nsee https://www.reddit.com/r/RDDT/\n\nfn main() {\n    x < 1;\n}\n\nNext\n\nDid:\n- one\n- two\n\nbye',
      media: [],
    })
    expect(result.posts[5]).toMatchObject({
      text: 'A podcast\n\nhttps://example.com/podcast',
      image: 'https://external-preview.redd.it/p.jpeg?width=140&s=3',
      media: [],
    })
  })

  it("takes a user's picture from their own posts", () => {
    const result = parseRedditPosts(
      page([
        card('permalink="/r/a/comments/b1/x/" id="t3_b1" post-title="Theirs" author="other" icon="https://other.png"'),
        card('permalink="/user/spez/comments/b2/x/" id="t3_b2" post-title="Mine" author="spez" icon="https://spez.png?width=48&amp;s=1"'),
      ]),
      'u/Spez',
    )
    expect(result.info).toEqual({ avatar: 'https://spez.png?width=48&s=1' })
  })

  it('throws on a page without posts, as Reddit answers a name it does not have with', () => {
    expect(() => parseRedditPosts('<html>Reddit - The heart of the internet</html>', 'r/nope')).toThrow('no posts')
  })
})

describe('parseRedditListing', () => {
  const listing = (posts: any[]) => ({ kind: 'Listing', data: { children: posts.map((data) => ({ kind: 't3', data })) } })
  const base = (id: string, rest: any) => ({ id, permalink: `/r/pics/comments/${id}/x/`, created_utc: 1792474399, subreddit: 'pics', ...rest })

  it('reads a photo, a gallery, a gif, a video, a post of text, a shared link, and a crosspost', () => {
    const preview = (url: string) => ({
      source: { url: `${url}?s=big`, width: 2000, height: 1000 },
      resolutions: [
        { url: `${url}?width=320`, width: 320 },
        { url: `${url}?width=640`, width: 640 },
        { url: `${url}?width=1080`, width: 1080 },
      ],
    })
    const result = parseRedditListing(
      listing([
        base('a1', { title: 'A walk', url: 'https://i.redd.it/a.png', preview: { images: [preview('https://preview.redd.it/a.png')] }, sr_detail: { community_icon: 'https://icon.png' } }),
        base('a2', {
          title: 'Two',
          url: 'https://www.reddit.com/gallery/a2',
          is_gallery: true,
          gallery_data: { items: [{ media_id: 'm1' }, { media_id: 'm2' }, { media_id: 'gone' }] },
          media_metadata: {
            m1: { status: 'valid', e: 'Image', s: { u: 'https://preview.redd.it/m1.jpg?s=1', x: 30, y: 40 }, p: [{ u: 'https://preview.redd.it/m1.jpg?width=640', x: 640 }] },
            m2: { status: 'valid', e: 'AnimatedImage', s: { mp4: 'https://preview.redd.it/m2.gif?format=mp4', gif: 'https://i.redd.it/m2.gif', x: 1, y: 2 } },
          },
        }),
        base('a3', {
          title: 'Moving',
          url: 'https://i.redd.it/d.gif',
          preview: { images: [{ ...preview('https://preview.redd.it/d.gif'), variants: { mp4: { source: { url: 'https://preview.redd.it/d.gif?format=mp4' } } } }] },
        }),
        base('a4', { title: 'A film', url: 'https://v.redd.it/e', is_video: true, preview: { images: [preview('https://external-preview.redd.it/e.png')] } }),
        base('a5', { title: 'Hello', url: 'https://www.reddit.com/r/pics/comments/a5/x/', is_self: true,
          selftext: '**Hi** & [welcome](/r/RDDT/)',
          selftext_html: '<!-- SC_OFF --><div class="md"><p><strong>Hi</strong> &amp; <a href="/r/RDDT/">welcome</a></p>\n\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n</div><!-- SC_ON -->',
        }),
        base('a6', { title: 'A podcast', url: 'https://example.com/podcast' }),
        base('a7', { title: 'Shared', url: '/r/other/comments/z/x/', crosspost_parent_list: [{ url: 'https://i.redd.it/z.png', title: 'Original' }] }),
      ]),
      'r/pics',
    )
    expect(result.info).toEqual({ avatar: 'https://icon.png' })
    expect(result.posts[0]).toMatchObject({
      id: 'a1',
      url: 'https://www.reddit.com/r/pics/comments/a1/x/',
      text: 'A walk',
      image: 'https://preview.redd.it/a.png?width=640',
      media: [{ type: 'image', url: 'https://i.redd.it/a.png', thumb: 'https://preview.redd.it/a.png?width=640', width: 2000, height: 1000 }],
      createdAtMs: 1792474399000,
    })
    expect(result.posts[1]).toMatchObject({
      text: 'Two',
      media: [
        { type: 'image', url: 'https://preview.redd.it/m1.jpg?s=1', thumb: 'https://preview.redd.it/m1.jpg?width=640', width: 30, height: 40 },
        { type: 'video', url: 'https://preview.redd.it/m2.gif?format=mp4', width: 1, height: 2 },
      ],
    })
    expect(result.posts[2].media).toMatchObject([{ type: 'video', url: 'https://preview.redd.it/d.gif?format=mp4' }])
    expect(result.posts[3]).toMatchObject({ image: 'https://external-preview.redd.it/e.png?width=640', media: [] })
    expect(result.posts[4]).toMatchObject({ text: 'Hello\n\nHi & https://www.reddit.com/r/RDDT/\n- one\n- two', media: [] })
    expect(result.posts[5]).toMatchObject({ text: 'A podcast\n\nhttps://example.com/podcast', media: [] })
    expect(result.posts[6]).toMatchObject({ text: 'Shared', media: [{ type: 'image', url: 'https://i.redd.it/z.png' }] })
  })

  it('reads a body that starts with a list', () => {
    const result = parseRedditListing(listing([base('b1', { title: 'A list', is_self: true, selftext_html: '<div class="md"><ul><li>one</li><li>two</li></ul></div>' })]), 'r/pics')
    expect(result.posts[0].text).toBe('A list\n\n- one\n- two')
  })

  it('throws on what is not a listing', () => {
    expect(() => parseRedditListing({ message: 'Forbidden', error: 403 }, 'r/pics')).toThrow('Forbidden')
  })
})

describe('parseRedditCommunityCard', () => {
  it("reads a subreddit's own picture, and none for Reddit's default", () => {
    expect(
      parseRedditCommunityCard('<img src="https://styles.redditmedia.com/t5_1/styles/communityIcon_x.png?width=64&amp;s=1" alt="" width="48">'),
    ).toBe('https://styles.redditmedia.com/t5_1/styles/communityIcon_x.png?width=64&s=1')
    expect(parseRedditCommunityCard('<img src="https://www.redditstatic.com/default.png">')).toBeUndefined()
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

describe('parseTikTokItemLists', () => {
  const avatar = 'https://p16-common-sign.tiktokcdn.com/avt.jpeg?x-expires=1792684800'
  const author = { uniqueId: 'nasa', nickname: 'NASA', avatarLarger: avatar }
  const video = (id: string, createTime: number, extra: Record<string, unknown> = {}) => ({
    id,
    desc: `video ${id}`,
    createTime,
    author,
    video: {
      playAddr: `https://v16-webapp-prime.tiktok.com/video/${id}/?expire=1792686113&tk=tt_chain_token`,
      cover: `https://p16-common-sign.tiktokcdn.com/${id}.image?x-expires=1792684800`,
      width: 720,
      height: 1280,
    },
    ...extra,
  })
  const photo = {
    id: '3',
    desc: 'two photos second line',
    createTime: 1788540697,
    author,
    imagePost: {
      cover: { imageURL: { urlList: ['https://p19/cover.jpeg', 'https://p16/cover.jpeg'] } },
      images: [
        { imageURL: { urlList: ['https://p16/a.jpeg'] }, imageWidth: 1080, imageHeight: 1436 },
        { imageURL: { urlList: ['https://p16/b.jpeg'] }, imageWidth: 1080, imageHeight: 1424 },
      ],
    },
    video: { playAddr: null, cover: 'https://p19/cover.jpeg', width: 0, height: 0 },
  }
  const page = (...lists: unknown[][]) =>
    lists.map((itemList) => `<script type="application/json">${JSON.stringify({ itemList, hasMore: true })}</script>`).join('\n')

  it('reads the videos and photo posts of the answers, once each, with the cookie their videos need', () => {
    const html = page([video('1', 1784664542, { isPinnedItem: true }), video('2', 1792167566), photo], [video('2', 1792167566)])
    const result = parseTikTokItemLists(html, 'nasa', 'abc==')
    expect(result.info).toEqual({ name: 'NASA', avatar })
    expect(result.pinnedIds).toEqual(['1'])
    expect(result.posts.map((post) => post.id)).toEqual(['1', '2', '3'])
    expect(result.posts[1]).toEqual({
      id: '2',
      site: 'tiktok',
      handle: 'nasa',
      url: 'https://www.tiktok.com/@nasa/video/2',
      text: 'video 2',
      image: 'https://p16-common-sign.tiktokcdn.com/2.image?x-expires=1792684800',
      media: [
        {
          type: 'video',
          url: 'https://v16-webapp-prime.tiktok.com/video/2/?expire=1792686113&tk=tt_chain_token',
          thumb: 'https://p16-common-sign.tiktokcdn.com/2.image?x-expires=1792684800',
          width: 720,
          height: 1280,
          headers: { cookie: 'tt_chain_token=abc==', referer: 'https://www.tiktok.com/' },
        },
      ],
      mediaComplete: true,
      createdAtMs: 1792167566000,
    })
    expect(result.posts[2]).toMatchObject({
      url: 'https://www.tiktok.com/@nasa/photo/3',
      text: 'two photos\nsecond line',
      image: 'https://p19/cover.jpeg',
      media: [
        { type: 'image', url: 'https://p16/a.jpeg', width: 1080, height: 1436 },
        { type: 'image', url: 'https://p16/b.jpeg', width: 1080, height: 1424 },
      ],
    })
  })

  it('leaves out ads, and the headers when the cookie is not known', () => {
    const result = parseTikTokItemLists(page([video('1', 1), video('2', 2, { isAd: true })]), 'nasa')
    expect(result.posts.map((post) => post.id)).toEqual(['1'])
    expect(result.posts[0].media?.[0].headers).toBeUndefined()
  })

  it('fails without posts', () => {
    expect(() => parseTikTokItemLists('<meta property="og:title" content="TikTok">', 'nasa')).toThrow('no posts in the page')
    expect(() => parseTikTokItemLists(page([]), 'nasa')).toThrow('no posts in the page')
  })
})

describe('parseTikTokPostPage', () => {
  const pageOf = (itemStruct: unknown) =>
    `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
      __DEFAULT_SCOPE__: { 'webapp.video-detail': { statusCode: 0, itemInfo: { itemStruct } } },
    })}</script>`

  it('reads the video of a post, made for the cookie the page set', () => {
    const html = pageOf({
      id: '2',
      author: { uniqueId: 'nasa' },
      video: { playAddr: 'https://v16/2.mp4?expire=1', cover: 'https://p16/2.image', width: 576, height: 1024 },
    })
    expect(parseTikTokPostPage(html, 'new==')).toEqual({
      media: [
        {
          type: 'video',
          url: 'https://v16/2.mp4?expire=1',
          thumb: 'https://p16/2.image',
          width: 576,
          height: 1024,
          headers: { cookie: 'tt_chain_token=new==', referer: 'https://www.tiktok.com/' },
        },
      ],
      cover: 'https://p16/2.image',
    })
  })

  it('fails on a page without the post', () => {
    expect(() => parseTikTokPostPage('<html></html>')).toThrow('no media in the post page')
    expect(() => parseTikTokPostPage(pageOf({}))).toThrow('no media in the post page')
  })

  it('is asked for at /video/, which has the photos of a photo post too', () => {
    expect(tiktokPostPageUrl({ handle: 'nasa', id: '3' })).toBe('https://www.tiktok.com/@nasa/video/3')
    expect(refreshesMedia('tiktok')).toBe(true)
  })
})

describe('parseTikTokChainToken', () => {
  it('reads the cookie from a cookie header or a set-cookie', () => {
    expect(parseTikTokChainToken('ttwid=1; tt_chain_token=abc+/=; msToken=x')).toBe('abc+/=')
    expect(parseTikTokChainToken('tt_chain_token=GjwV==; path=/; expires=Sun, 18 Apr 2027 00:00:00 GMT; domain=.tiktok.com')).toBe('GjwV==')
    expect(parseTikTokChainToken('msToken=x')).toBeUndefined()
    expect(parseTikTokChainToken(null)).toBeUndefined()
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

describe('tiktokUrlExpiresAt', () => {
  it('reads when a video or a photo address stops working', () => {
    expect(tiktokUrlExpiresAt('https://v16-webapp-prime.tiktok.com/video/a/?a=1988&expire=1792686113&l=x')).toBe(1792686113000)
    expect(tiktokUrlExpiresAt('https://p16-common-sign.tiktokcdn.com/a.image?dr=1&x-expires=1792684800&x-signature=s')).toBe(1792684800000)
    expect(tiktokUrlExpiresAt('https://p16/a.jpeg')).toBeUndefined()
  })
})

describe('mediaExpired', () => {
  const at = 0x6adb6a8c * 1000
  const media = [{ type: 'image' as const, url: 'https://cdn/a.jpg?oe=6ADB6A8C' }]
  it('is true from a little before the address stops working', () => {
    expect(mediaExpired(media, at - 60 * 60 * 1000)).toBe(false)
    expect(mediaExpired(media, at - 60 * 1000)).toBe(true)
  })

  it('reads TikTok addresses too', () => {
    const video = [{ type: 'video' as const, url: 'https://v16/a/?expire=1792686113', thumb: 'https://p16/a.image?x-expires=1792684800' }]
    expect(mediaExpired(video, 1792684800000 - 60 * 60 * 1000)).toBe(false)
    expect(mediaExpired(video, 1792684800000 - 60 * 1000)).toBe(true)
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

  it('is the choice of its timeline when the profile has none of its own', () => {
    const timelines = { news: 30, art: undefined }
    expect(watchIntervalMinutes({ timelineId: 'news' }, 60, timelines)).toBe(30)
    expect(watchIntervalMinutes({ timelineId: 'news', checkIntervalMinutes: 15 }, 60, timelines)).toBe(15)
    expect(watchIntervalMinutes({ timelineId: 'art' }, 60, timelines)).toBe(60)
    expect(watchIntervalMinutes({ timelineId: 'gone' }, 60, timelines)).toBe(60)
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

  it('waits as long as the timeline of a profile chose', () => {
    const inNews = [{ key: 'x:old', timelineId: 'news', lastCheckedAt: now - 2 * 60 * 60 * 1000 }]
    expect(dueWatchProfiles(inNews, { manual: false, now, defaultMinutes: 60, timelineMinutes: { news: 180 } })).toEqual([])
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
