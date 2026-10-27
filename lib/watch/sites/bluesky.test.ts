import { describe, expect, it } from 'bun:test'
import { blueskyVideoDids, didDocumentUrl, expandBlueskyLinks, parseBlueskyFeed, parseDidDocumentPds } from './bluesky'

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
