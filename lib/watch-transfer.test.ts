import { beforeEach, describe, expect, it } from 'bun:test'
import { watch$ } from '@/states/watch'
import { deleteProfilePosts, getProfilePosts, setProfilePosts } from '@/lib/watch-db'
import { applyWatchBackup, createWatchBackup, normalizeWatchBackup, parseSourceList, sourceFromUrl, watchNotifyKeys, watchNotifyTimelineIds } from './watch-transfer'

const reset = () => {
  watch$.profiles.set([])
  deleteProfilePosts('bluesky:alice.bsky.social')
  watch$.timelines.set([])
  watch$.checkIntervalMinutes.set(60)
  watch$.mediaWifiOnly.set(true)
  watch$.mediaLimitMB.set(1024)
  watch$.postsPerSource.set(100)
  watch$.notifyTimelineIds.set([])
  watch$.feedNotify.set(false)
}

describe('watch transfer', () => {
  beforeEach(reset)

  it('carries which timelines and whether the whole feed notify, to turn on once permission is given', () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    const id = watch$.createTimeline('Friends', ['x:jack'])
    watch$.createTimeline('News', ['x:jack'])
    watch$.setTimelineNotify(id, true)
    watch$.feedNotify.set(true)

    const backup = normalizeWatchBackup(JSON.parse(JSON.stringify(createWatchBackup())))!
    expect(backup.feedNotify).toBe(true)
    expect(backup.timelines).toEqual([
      { name: 'Friends', profileKeys: ['x:jack'], notify: true },
      { name: 'News', profileKeys: ['x:jack'] },
    ])

    reset()
    applyWatchBackup(backup)
    // Left for enableTimelineNotifications, which asks for permission first.
    expect(watch$.notifyTimelineIds.get()).toEqual([])
    expect(watch$.feedNotify.get()).toBe(false)
    const friends = watch$.timelines.get().find((timeline) => timeline.name === 'Friends')!.id
    expect(watchNotifyTimelineIds(backup)).toEqual([undefined, friends])
  })

  it('exports the sources and timelines without what was read from the sites', () => {
    watch$.watch({ site: 'x', handle: 'Jack' })
    watch$.updateProfile('x:jack', { name: 'Jack', avatar: 'https://a', lastCheckedAt: 1, error: 'boom', notify: true, checkIntervalMinutes: 30 })
    watch$.createTimeline('Friends', ['x:jack'])

    const backup = createWatchBackup()
    expect(backup.profiles).toEqual([{ site: 'x', handle: 'Jack', name: 'Jack', notify: true, checkIntervalMinutes: 30 }])
    expect(backup.timelines).toEqual([{ name: 'Friends', profileKeys: ['x:jack'] }])
    expect(backup.checkIntervalMinutes).toBe(60)
    expect(backup.postsPerSource).toBe(100)
  })

  it('drops sources that cannot be watched and timeline keys of no source', () => {
    const backup = normalizeWatchBackup({
      checkIntervalMinutes: -5,
      profiles: [
        { site: 'x', handle: 'jack', notify: 'yes' },
        { site: 'x', handle: 'JACK' },
        { site: 'myspace', handle: 'tom' },
        { site: 'reddit', handle: 'nope' },
        { site: 'mastodon', handle: 'user@mastodon.social', url: 'javascript:alert(1)' },
        null,
      ],
      timelines: [
        { name: 'A', profileKeys: ['x:jack', 'x:ghost'] },
        { name: ' a ', profileKeys: ['mastodon:user@mastodon.social'], mediaOnly: true },
        { name: '' },
      ],
    })
    expect(backup).toEqual({
      profiles: [
        { site: 'x', handle: 'jack', notify: false },
        { site: 'mastodon', handle: 'user@mastodon.social', notify: false },
      ],
      timelines: [{ name: 'A', profileKeys: ['x:jack', 'mastodon:user@mastodon.social'], mediaOnly: true }],
    })
  })

  it('adds new sources, keeps the ones watched, and merges timelines by name', () => {
    watch$.watch({ site: 'bluesky', handle: 'alice.bsky.social' })
    setProfilePosts('bluesky:alice.bsky.social', [{ key: 'k', createdAtMs: 1, firstSeenAt: 0 } as any])
    watch$.createTimeline('Friends', ['bluesky:alice.bsky.social'])

    const result = applyWatchBackup({
      checkIntervalMinutes: 120,
      postsPerSource: 200,
      profiles: [
        { site: 'bluesky', handle: 'alice.bsky.social', notify: true },
        { site: 'reddit', handle: 'r/rust', checkIntervalMinutes: 30 },
      ],
      timelines: [
        { name: 'friends', profileKeys: ['reddit:r/rust'] },
        { name: 'News', profileKeys: ['reddit:r/rust'] },
      ],
    })

    expect(result).toEqual({ added: 1, existing: 1 })
    expect(
      watchNotifyKeys({ profiles: [{ site: 'bluesky', handle: 'Alice.bsky.social', notify: true }, { site: 'x', handle: 'jack' }], timelines: [] }),
    ).toEqual(['bluesky:alice.bsky.social'])
    expect(watch$.checkIntervalMinutes.get()).toBe(120)
    expect(watch$.postsPerSource.get()).toBe(200)
    expect(getProfilePosts('bluesky:alice.bsky.social')).toHaveLength(1)
    const profiles = watch$.profiles.get()
    expect(profiles.map((profile) => profile.key)).toEqual(['bluesky:alice.bsky.social', 'reddit:r/rust'])
    // Left for enableWatchNotifications, which asks for permission first.
    expect(profiles[0].notify).toBe(false)
    expect(profiles[1].checkIntervalMinutes).toBe(30)
    expect(watch$.timelines.get().map(({ name, profileKeys }) => ({ name, profileKeys }))).toEqual([
      { name: 'Friends', profileKeys: ['bluesky:alice.bsky.social', 'reddit:r/rust'] },
      { name: 'News', profileKeys: ['reddit:r/rust'] },
    ])
  })

  it('carries which timelines are pinned to the new tab page, and which show only photos and videos', () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    const pinnedId = watch$.createTimeline('Friends', ['x:jack'])
    watch$.updateTimeline(pinnedId, { pinned: true })
    const newsId = watch$.createTimeline('News', [])
    watch$.updateTimeline(newsId, { mediaOnly: true })
    const backup = normalizeWatchBackup(createWatchBackup())!
    expect(backup.timelines).toEqual([
      { name: 'Friends', profileKeys: ['x:jack'], pinned: true },
      { name: 'News', profileKeys: [], mediaOnly: true },
    ])

    reset()
    watch$.createTimeline('friends', [])
    applyWatchBackup(backup)
    expect(watch$.timelines.get().map(({ name, pinned, mediaOnly }) => ({ name, pinned, mediaOnly }))).toEqual([
      { name: 'friends', pinned: true, mediaOnly: undefined },
      { name: 'News', pinned: undefined, mediaOnly: true },
    ])
  })

  it('reads profile pages and the RSS feeds of the sites', () => {
    expect(sourceFromUrl('https://www.reddit.com/r/rust/.rss')).toEqual({ site: 'reddit', handle: 'r/rust' })
    expect(sourceFromUrl('https://old.reddit.com/user/spez.rss')).toEqual({ site: 'reddit', handle: 'u/spez' })
    expect(sourceFromUrl('https://mastodon.social/@Gargron.rss')).toEqual({ site: 'mastodon', handle: 'Gargron@mastodon.social' })
    expect(sourceFromUrl('https://bsky.app/profile/alice.bsky.social/rss')).toEqual({ site: 'bluesky', handle: 'alice.bsky.social' })
    expect(sourceFromUrl('https://mastodon.social/users/Gargron.atom')).toEqual({ site: 'mastodon', handle: 'Gargron@mastodon.social' })
    expect(sourceFromUrl('https://mastodon.social/users/Gargron.rss')).toEqual({ site: 'mastodon', handle: 'Gargron@mastodon.social' })
    expect(sourceFromUrl('x.com/jack')).toEqual({ site: 'x', handle: 'jack' })
    expect(sourceFromUrl('https://x.com/rss')).toEqual({ site: 'x', handle: 'rss' })
    expect(sourceFromUrl('https://example.com/feed.xml')).toBeNull()
  })

  it('reads an OPML file with its folders as timelines', () => {
    const list = parseSourceList(`<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech &amp; Code" title="Tech &amp; Code">
      <outline type="rss" text="r/rust" xmlUrl="https://www.reddit.com/r/rust/.rss" htmlUrl="https://www.reddit.com/r/rust/"/>
      <outline type="rss" text="Blog" xmlUrl="https://example.com/feed.xml"/>
      <outline type="rss" text="Gargron" xmlUrl='https://mastodon.social/@Gargron.rss'></outline>
    </outline>
    <outline type="rss" text="Alice" xmlUrl="https://bsky.app/profile/alice.bsky.social/rss"/>
    <outline type="rss" text="Again" xmlUrl="https://www.reddit.com/r/Rust/.rss"/>
  </body>
</opml>`)
    expect(list.profiles).toEqual([
      { site: 'reddit', handle: 'r/rust' },
      { site: 'mastodon', handle: 'Gargron@mastodon.social' },
      { site: 'bluesky', handle: 'alice.bsky.social' },
    ])
    expect(list.timelines).toEqual([{ name: 'Tech & Code', profileKeys: ['reddit:r/rust', 'mastodon:gargron@mastodon.social'] }])
    expect(list.unrecognized).toBe(1)
  })

  it('reads a list of links', () => {
    const list = parseSourceList('# my sources\nhttps://x.com/jack\nhttps://www.instagram.com/natgeo/, threads.com/@zuck\nhello\n')
    expect(list.profiles).toEqual([
      { site: 'x', handle: 'jack' },
      { site: 'instagram', handle: 'natgeo' },
      { site: 'threads', handle: 'zuck' },
    ])
    expect(list.timelines).toEqual([])
    expect(list.unrecognized).toBe(1)
  })
})
