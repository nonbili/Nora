import { describe, expect, it } from 'bun:test'
import { getWatchTarget, watchKey, watchProfileUrl, watchSourceLabel } from './target'

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
