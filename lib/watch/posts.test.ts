import { describe, expect, it } from 'bun:test'
import { formatPostAge, mergeWatchPosts, postKey } from './posts'
import type { WatchPost } from './types'

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
