import { describe, expect, it } from 'bun:test'
import { formatPostAge, mergeWatchPosts, postKey } from './posts'
import type { WatchMedia, WatchPost } from './types'

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

  it('takes a repost kept by its own id for the same one told by the post it shares, once', () => {
    // As kept before: by the repost's own id, linked to it on the profile that reposted, when it was
    // reposted, after the post it shares was made.
    const at = Date.UTC(2026, 0, 1)
    const old = { ...kept('9', at, 5), repostOf: 'esa', text: 'hello', url: 'https://x.com/nasa/status/9' }
    const now = { ...fetched('1', at), repostOf: 'esa', text: 'hello', url: 'https://x.com/esa/status/1' }
    const first = mergeWatchPosts([old], [now], { now: 99, initial: false })
    expect(first.posts.map((post) => [post.key, post.id, post.firstSeenAt])).toEqual([[old.key, '1', 5]])
    expect(first.fresh).toEqual([])
    // Then by the id it has now, though its text changed.
    const again = mergeWatchPosts(first.posts, [{ ...now, text: 'edited' }], { now: 100, initial: false })
    expect(again.posts.map((post) => [post.key, post.text])).toEqual([[old.key, 'edited']])
    expect(again.fresh).toEqual([])
  })

  it('takes a repost of photos only kept by its own id for the same one', () => {
    const at = Date.UTC(2026, 0, 1)
    const photo = { type: 'image' as const, url: 'https://pbs.twimg.com/media/A.jpg?name=large', thumb: 'https://pbs.twimg.com/media/A.jpg' }
    const old = { ...kept('9', at, 5), repostOf: 'esa', text: '', media: [photo], url: 'https://x.com/nasa/status/9' }
    const now = { ...fetched('1', at), repostOf: 'esa', text: '', media: [photo], url: 'https://x.com/esa/status/1' }
    const { posts, fresh } = mergeWatchPosts([old], [now], { now: 99, initial: false })
    expect(posts.map((post) => [post.key, post.id])).toEqual([[old.key, '1']])
    expect(fresh).toEqual([])
  })

  it('takes no repost kept by its own id for one of a post made since, or with other photos', () => {
    const at = Date.UTC(2026, 0, 1)
    const old = { ...kept('9', at, 5), repostOf: 'esa', text: 'hello', url: 'https://x.com/nasa/status/9' }
    const repost = (id: string, media: WatchMedia[] = []) => ({ ...fetched(id, at), repostOf: 'esa', text: 'hello', url: `https://x.com/esa/status/${id}`, media })
    // Made after the repost kept was.
    const since = '2114801524358406570'
    expect(mergeWatchPosts([old], [repost(since)], { now: 99, initial: false }).fresh.map((post) => post.id)).toEqual([since])
    const photo = { type: 'image' as const, url: 'https://pbs.twimg.com/media/A.jpg?name=large', thumb: 'https://pbs.twimg.com/media/A.jpg' }
    expect(mergeWatchPosts([old], [repost('1', [photo])], { now: 99, initial: false }).fresh.map((post) => post.id)).toEqual(['1'])
  })

  it('takes no repost kept by its own id for one of two fetched alike', () => {
    const old = { ...kept('9', 20, 5), repostOf: 'esa', text: 'hello', url: 'https://x.com/nasa/status/9' }
    const alike = (id: string, at: number) => ({ ...fetched(id, at), repostOf: 'esa', text: 'hello', url: `https://x.com/esa/status/${id}` })
    const { posts } = mergeWatchPosts([old], [alike('2', 30), alike('1', 20)], { now: 99, initial: false })
    expect(posts.map((post) => post.key).sort()).toEqual([old.key, kept('1', 0).key, kept('2', 0).key].sort())
  })

  it('tells a repost of unknown time as made no sooner than what comes after it, or as it was kept', () => {
    const repost = (id: string, at: number) => ({ ...fetched(id, at), repostOf: 'esa', url: `https://x.com/esa/status/${id}`, repostedAtUnknown: true })
    // An own post at 10, a repost kept at 20 as X told its time, and a repost since of a post from 1.
    const existing = [{ ...kept('2', 20), repostOf: 'esa', url: 'https://x.com/esa/status/2' }, kept('1', 10)]
    const { posts, fresh } = mergeWatchPosts(existing, [repost('3', 1), repost('2', 2), fetched('1', 10)], { now: 99, initial: false })
    expect(posts.map((post) => [post.id, post.createdAtMs])).toEqual([
      ['3', 21],
      ['2', 20],
      ['1', 10],
    ])
    expect(fresh.map((post) => post.id)).toEqual(['3'])
    expect(posts.every((post) => !('repostedAtUnknown' in post))).toBe(true)
  })

  it('tells a repost of unknown time as after the time kept of what comes after it, if more exact', () => {
    const repost = { ...fetched('3', 1), repostOf: 'esa', url: 'https://x.com/esa/status/3', repostedAtUnknown: true }
    // Kept to the millisecond; fetched again to the second.
    const { fresh } = mergeWatchPosts([kept('1', 10_500)], [repost, fetched('1', 10_000)], { now: 99, initial: false })
    expect(fresh.map((post) => [post.id, post.createdAtMs])).toEqual([['3', 10_501]])
  })

  it('keeps reposts of unknown time in the order fetched, and the newest of them when the oldest go', () => {
    const repost = (id: string) => ({ ...fetched(id, 1), repostOf: 'esa', url: `https://x.com/esa/status/${id}`, repostedAtUnknown: true })
    const { posts, fresh } = mergeWatchPosts([kept('1', 10)], [repost('4'), repost('3'), repost('2'), fetched('1', 10)], {
      now: 99,
      initial: false,
      max: 3,
    })
    expect(posts.map((post) => post.id)).toEqual(['4', '3', '2'])
    expect(fresh.map((post) => post.id)).toEqual(['4', '3', '2'])
  })

  it('takes a repost of a post with the same text as another for a post of its own', () => {
    const repost = { repostOf: 'esa', text: 'hello' }
    const existing = [{ ...kept('1', 20, 5), ...repost, url: 'https://x.com/esa/status/1' }]
    const { posts, fresh } = mergeWatchPosts(existing, [{ ...fetched('2', 30), ...repost, url: 'https://x.com/esa/status/2' }], {
      now: 99,
      initial: false,
    })
    expect(posts.map((post) => post.id)).toEqual(['2', '1'])
    expect(fresh.map((post) => post.id)).toEqual(['2'])
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
