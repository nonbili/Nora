import { describe, expect, it } from 'bun:test'
import {
  instagramUrlExpiresAt,
  mediaExpired,
  mediaExtension,
  mediaFileName,
  mediaKey,
  mediaToEvict,
  tiktokUrlExpiresAt,
} from './media-keys'

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
