import { beforeEach, describe, expect, it } from 'bun:test'
import {
  deleteProfilePosts,
  findWatchPost,
  findWatchPosts,
  getFeedPosts,
  getNewestPostTimes,
  getPostsNewestFirst,
  getProfilePosts,
  getProfilesWithPosts,
  getUnreadPostKeys,
  getWatchPostKeys,
  importWatchPosts,
  trimWatchPosts,
  setProfilePosts,
  updateWatchPost,
  watchPostsVersion$,
} from './watch-db'
import type { WatchPost } from './watch'

const post = (id: string, createdAtMs: number, firstSeenAt = 0, handle = 'nasa'): WatchPost => ({
  key: `x:${id}`,
  id,
  site: 'x',
  handle,
  url: `https://x.com/${handle}/status/${id}`,
  text: id,
  createdAtMs,
  firstSeenAt,
})

const ids = (posts: WatchPost[]) => posts.map((current) => current.id)

describe('watch db', () => {
  beforeEach(() => {
    for (const key of Object.keys(getNewestPostTimes())) deleteProfilePosts(key)
  })

  it('keeps the posts of each profile in place of what it had, newest first', () => {
    setProfilePosts('x:a', [post('1', 10), post('2', 20)])
    setProfilePosts('x:b', [post('3', 30)])
    setProfilePosts('x:a', [post('2', 20), post('4', 40)])
    expect(ids(getProfilePosts('x:a'))).toEqual(['4', '2'])
    expect(ids(getProfilePosts('x:b'))).toEqual(['3'])
    expect(getNewestPostTimes()).toEqual({ 'x:a': 40, 'x:b': 30 })

    deleteProfilePosts('x:a')
    expect(getProfilePosts('x:a')).toEqual([])
    expect([...getWatchPostKeys()]).toEqual(['x:3'])
  })

  it('tells what shows posts that they changed', () => {
    const before = watchPostsVersion$.peek()
    setProfilePosts('x:a', [post('1', 10)])
    updateWatchPost('x:a', 'x:1', { text: 'edited' })
    expect(watchPostsVersion$.peek()).toBe(before + 2)
  })

  it('takes the copy of the given profile, or else any, and changes only that one', () => {
    setProfilePosts('x:a', [post('2', 20, 0, 'a')])
    setProfilePosts('x:b', [post('2', 20, 0, 'b')])
    expect(findWatchPost('x:b', 'x:2')?.handle).toBe('b')
    expect(findWatchPost('x:c', 'x:2')?.handle).toBeDefined()
    expect(findWatchPost('x:a', 'x:9')).toBeUndefined()

    updateWatchPost('x:b', 'x:2', { mediaComplete: true })
    expect(findWatchPost('x:b', 'x:2')?.mediaComplete).toBe(true)
    expect(findWatchPost('x:a', 'x:2')?.mediaComplete).toBeUndefined()
  })

  it('shows a post two profiles share once, as the first has it, up to the limit', () => {
    setProfilePosts('x:a', [post('3', 30), post('2', 20, 0, 'first')])
    setProfilePosts('x:b', [post('2', 20, 0, 'second'), post('1', 10)])
    setProfilePosts('x:c', [post('5', 50)])
    expect(getFeedPosts(['x:a', 'x:b'], 10).map((current) => [current.id, current.handle])).toEqual([
      ['3', 'nasa'],
      ['2', 'first'],
      ['1', 'nasa'],
    ])
    expect(getFeedPosts(['x:b', 'x:a'], 10).map((current) => current.handle)).toEqual(['nasa', 'second', 'nasa'])
    expect(ids(getFeedPosts(['x:a', 'x:b'], 2))).toEqual(['3', '2'])
  })

  describe('media only', () => {
    const photo = { type: 'image' as const, url: 'https://example.com/1.jpg' }
    beforeEach(() => {
      setProfilePosts('x:a', [
        { ...post('text', 4, 200), image: 'https://example.com/link.jpg', mediaComplete: true },
        { ...post('photo', 3, 200), media: [photo], mediaComplete: true },
        { ...post('pending', 2, 200), mediaComplete: false },
        post('plain', 1, 200),
      ])
    })

    it('shows only the posts with media, or with media still to be read', () => {
      expect(ids(getFeedPosts(['x:a'], 10, true))).toEqual(['photo', 'pending'])
      expect(ids(getFeedPosts(['x:a'], 1, true))).toEqual(['photo'])
      expect(ids(getFeedPosts(['x:a'], 10))).toEqual(['text', 'photo', 'pending', 'plain'])
    })

    it('counts as unread only the posts with media', () => {
      expect([...getUnreadPostKeys(['x:a'], {}, 100, true)].sort()).toEqual(['x:pending', 'x:photo'])
      expect(getUnreadPostKeys(['x:a'], {}, 100).size).toBe(4)
    })
  })

  it('finds posts in the order asked for, of any profile when not of the one given', () => {
    setProfilePosts('x:a', [post('1', 1), post('2', 2)])
    setProfilePosts('x:b', [post('3', 3)])
    expect(
      ids(
        findWatchPosts([
          { profileKey: 'x:b', key: 'x:3' },
          { profileKey: 'x:a', key: 'x:9' },
          { profileKey: 'x:c', key: 'x:1' },
          { profileKey: 'x:a', key: 'x:2' },
        ]),
      ),
    ).toEqual(['3', '1', '2'])
  })

  describe('unread', () => {
    beforeEach(() => {
      setProfilePosts('x:a', [post('1', 1, 0), post('2', 2, 200), post('shared', 3, 300)])
      setProfilePosts('x:b', [post('3', 4, 300), post('shared', 3, 300)])
    })
    const unread = (profileKeys: string[], seenAt: Record<string, number>) =>
      [...getUnreadPostKeys(profileKeys, seenAt, 100)].sort()

    it('counts the posts first seen after their profile was last shown', () => {
      expect(unread(['x:a', 'x:b'], {})).toEqual(['x:2', 'x:3', 'x:shared'])
      expect(unread(['x:a'], {})).toEqual(['x:2', 'x:shared'])
      expect(unread(['x:a', 'x:b'], { 'x:a': 250 })).toEqual(['x:3', 'x:shared'])
    })

    it('takes a post two profiles share as read once either was shown', () => {
      expect(unread(['x:a', 'x:b'], { 'x:b': 300 })).toEqual(['x:2'])
      expect(unread(['x:a'], { 'x:b': 300 })).toEqual(['x:2'])
    })

    it('finds the profiles with any of the posts, or one first seen since', () => {
      expect([...getProfilesWithPosts(['x:2'], 0)]).toEqual(['x:a'])
      expect([...getProfilesWithPosts([], 250)].sort()).toEqual(['x:a', 'x:b'])
      expect([...getProfilesWithPosts([], 0)]).toEqual([])
    })
  })

  it('keeps no more than the latest posts of each profile', () => {
    setProfilePosts('x:a', [post('1', 10), post('2', 20), post('3', 30)])
    setProfilePosts('x:b', [post('4', 40)])
    trimWatchPosts(2)
    expect(ids(getProfilePosts('x:a'))).toEqual(['3', '2'])
    expect(ids(getProfilePosts('x:b'))).toEqual(['4'])
  })

  it('adds the posts kept before, and reads them all a page at a time', () => {
    importWatchPosts({ 'x:a': [post('1', 10), post('2', 20)], 'x:b': [post('3', 30)], 'x:c': undefined })
    expect(ids(getPostsNewestFirst(2, 0))).toEqual(['3', '2'])
    expect(ids(getPostsNewestFirst(2, 2))).toEqual(['1'])
  })
})
