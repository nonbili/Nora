import { describe, expect, it } from 'bun:test'
import { mastodonLookupUrl, mastodonWebFingerUrl, parseMastodonStatuses, parseMastodonWebFinger } from './mastodon'

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
