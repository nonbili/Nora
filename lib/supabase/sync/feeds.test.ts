import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { supabase } from '@/lib/supabase/client'

type Row = { user_id: string; id: string; json: Record<string, unknown>; updated_at: string }

// The two tables as the server keeps them, each write a millisecond after the last.
const server: Record<string, Map<string, Row>> = { feed_sources: new Map(), feed_timelines: new Map() }
let clock = Date.parse('2026-10-20T00:00:00Z')
const tick = () => new Date(++clock).toISOString()
// Answered in a later task, as over the network.
const network = () => new Promise((resolve) => setTimeout(resolve, 0))

const query = (table: string) => {
  let rows = () => [...server[table].values()].sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
  let limit = Infinity
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: (n: number) => ((limit = n), builder),
    gt: (_column: string, value: string) => {
      const previous = rows
      rows = () => previous().filter((row) => row.updated_at > value)
      return builder
    },
    or: (filter: string) => {
      const [, at, id] = filter.match(/updated_at\.gt\."([^"]+)",and\(updated_at\.eq\."[^"]+",id\.gt\."([^"]+)"\)/)!
      const previous = rows
      rows = () => previous().filter((row) => row.updated_at > at || (row.updated_at === at && row.id > id))
      return builder
    },
    then: (resolve: (value: unknown) => void) => void network().then(() => resolve({ data: rows().slice(0, limit), error: null })),
  }
  return builder
}

// Other suites can load the syncers before this file. Spy on the shared client
// itself so already-imported syncers also use the in-memory server.
const from = (table: string) => ({
  ...query(table),
  upsert: async (rows: Omit<Row, 'updated_at'>[]) => {
    await network()
    for (const row of rows) {
      const current = server[table].get(row.id)
      if (JSON.stringify(current?.json) !== JSON.stringify(row.json)) server[table].set(row.id, { ...row, updated_at: tick() })
    }
    return { error: null }
  },
})

const { auth$ } = await import('@/states/auth')
const { notifyChoice, profileNotifies, watch$ } = await import('@/states/watch')
const { syncMeta$ } = await import('@/states/sync-meta')
const { feedsSyncer } = await import('./feeds')
const { tabs$ } = await import('@/states/tabs')
const { feedTabUrl } = await import('@/lib/feed-tab')
const { getProfilePosts, setProfilePosts } = await import('@/lib/watch-db')
await import('../sync')

const remote = (table: 'feed_sources' | 'feed_timelines', id: string, json: Record<string, unknown>) =>
  server[table].set(id, { user_id: 'u1', id, json, updated_at: tick() })

const ids = () => watch$.profiles.peek().map((profile) => profile.key)

describe('feeds sync', () => {
  let fromSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    fromSpy = spyOn(supabase, 'from').mockImplementation(from as typeof supabase.from)
    auth$.assign({ userId: undefined, plan: undefined })
    watch$.profiles.set([])
    watch$.timelines.set([])
    watch$.feedPinned.set(true)
    watch$.feedEmoji.set('')
    watch$.timelineNotify.set({})
    watch$.feedNotify.set(false)
    server.feed_sources.clear()
    server.feed_timelines.clear()
    syncMeta$.feeds.set({ pendingSources: [], pendingTimelines: [] })
    auth$.assign({ userId: 'u1', plan: 'sync' })
  })

  afterEach(() => {
    fromSpy.mockRestore()
  })

  it('carries which timelines show only photos and videos', async () => {
    remote('feed_timelines', 't1', { name: 'Art', mediaOnly: true })
    await feedsSyncer.syncNow()
    expect(watch$.timelines.peek()).toEqual([{ id: 't1', name: 'Art', mediaOnly: true }])

    watch$.updateTimeline('t1', { mediaOnly: false })
    await feedsSyncer.syncNow()
    expect(server.feed_timelines.get('t1')!.json.mediaOnly).toBeUndefined()
  })

  it('keeps a timeline made here to show only photos and videos so when put into one of the same name', async () => {
    const local = watch$.createTimeline('Art', [])
    watch$.updateTimeline(local, { mediaOnly: true })
    remote('feed_timelines', 't1', { name: 'art' })
    await feedsSyncer.syncNow()
    expect(watch$.timelines.peek()).toEqual([{ id: 't1', name: 'art', mediaOnly: true }])
    expect(server.feed_timelines.get('t1')!.json.mediaOnly).toBe(true)
  })

  it('keeps the emoji of a timeline made here when put into one of the same name', async () => {
    const local = watch$.createTimeline('Art', [])
    watch$.updateTimeline(local, { emoji: '🎨' })
    remote('feed_timelines', 't1', { name: 'art' })
    await feedsSyncer.syncNow()
    expect(watch$.timelines.peek()).toEqual([{ id: 't1', name: 'art', emoji: '🎨' }])
    expect(server.feed_timelines.get('t1')!.json.emoji).toBe('🎨')
  })

  it('keeps a timeline made here notifying when put into one of the same name, without syncing it', async () => {
    const local = watch$.createTimeline('Art', ['x:jack'])
    watch$.setTimelineNotify(local, true)
    remote('feed_timelines', 't1', { name: 'art' })
    await feedsSyncer.syncNow()
    expect(watch$.timelineNotify.peek()).toEqual({ t1: true })
    expect(server.feed_timelines.get('t1')!.json.notify).toBeUndefined()
  })

  it('notifies of a source in a timeline that notifies, and no longer once it is deleted', () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    const id = watch$.createTimeline('Art', ['x:jack'])
    const profile = watch$.profiles.peek()[0]
    expect(profileNotifies(profile)).toBe(false)
    watch$.setTimelineNotify(id, true)
    expect(profileNotifies(profile)).toBe(true)
    watch$.deleteTimeline(id)
    expect(profileNotifies(profile)).toBe(false)
    expect(watch$.timelineNotify.peek()).toEqual({})
    watch$.feedNotify.set(true)
    expect(profileNotifies(profile)).toBe(true)
  })

  it('notifies as the source chooses, else as its timeline does, else as the whole feed does', () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    const id = watch$.createTimeline('Art', ['x:jack'])
    const profile = () => watch$.profiles.peek()[0]
    watch$.feedNotify.set(true)
    expect(notifyChoice(profile())).toEqual({ notify: true, from: 'feed' })
    watch$.setTimelineNotify(id, false)
    expect(notifyChoice(profile())).toMatchObject({ notify: false, from: 'timeline' })
    watch$.setNotify('x:jack', true)
    expect(notifyChoice(profile())).toEqual({ notify: true, from: 'source' })
    watch$.setNotify('x:jack', false)
    watch$.setTimelineNotify(id, true)
    expect(profileNotifies(profile())).toBe(false)
    // Back to its timeline's choice.
    watch$.setNotify('x:jack', undefined)
    expect(notifyChoice(profile())).toMatchObject({ notify: true, from: 'timeline' })
    watch$.setTimelineNotify(id, undefined)
    watch$.feedNotify.set(false)
    expect(notifyChoice(profile())).toEqual({ notify: false, from: 'feed' })
  })

  it('keeps a source in one timeline, moved with its own row, and in none once its timeline is deleted', async () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    const art = watch$.createTimeline('Art', ['x:jack'])
    const news = watch$.createTimeline('News', ['x:jack'])
    expect(watch$.profiles.peek()[0].timelineId).toBe(news)
    await feedsSyncer.syncNow()
    expect(server.feed_sources.get('x:jack')!.json.timelineId).toBe(news)

    // Moved back on another device.
    remote('feed_sources', 'x:jack', { site: 'x', handle: 'jack', addedAt: 1, timelineId: art })
    await feedsSyncer.syncNow()
    expect(watch$.profiles.peek()[0].timelineId).toBe(art)

    watch$.deleteTimeline(art)
    expect(watch$.profiles.peek()[0].timelineId).toBeUndefined()
    await feedsSyncer.syncNow()
    expect(server.feed_sources.get('x:jack')!.json.timelineId).toBeUndefined()
  })

  it('syncs how often the sources of a timeline are checked', async () => {
    remote('feed_timelines', 't1', { name: 'News', checkIntervalMinutes: 15 })
    await feedsSyncer.syncNow()
    expect(watch$.timelines.peek()).toEqual([{ id: 't1', name: 'News', checkIntervalMinutes: 15 }])

    watch$.updateTimeline('t1', { checkIntervalMinutes: 180 })
    await feedsSyncer.syncNow()
    expect(server.feed_timelines.get('t1')!.json.checkIntervalMinutes).toBe(180)
  })

  it('syncs whether the whole feed is pinned and its emoji', async () => {
    watch$.feedPinned.set(false)
    watch$.feedEmoji.set('📡')
    await feedsSyncer.syncNow()
    expect(server.feed_timelines.get('_feed')!.json).toMatchObject({ pinned: false, emoji: '📡' })

    // Back to how it starts: the row is taken away, and the other devices follow.
    watch$.feedPinned.set(true)
    watch$.feedEmoji.set('')
    await feedsSyncer.syncNow()
    expect(server.feed_timelines.get('_feed')!.json.deleted_at).toBeString()
    remote('feed_timelines', '_feed', { name: '', pinned: false, emoji: '🔥' })
    await feedsSyncer.syncNow()
    expect(watch$.feedPinned.peek()).toBe(false)
    expect(watch$.feedEmoji.peek()).toBe('🔥')
  })

  it('pushes what a device had before its first sync, together with what was synced', async () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    const local = watch$.createTimeline('Friends', ['x:jack'])
    tabs$.tabs.set([{ id: 'tab', url: feedTabUrl(local) } as any, { id: 'other', url: 'https://example.com' } as any])
    remote('feed_sources', 'reddit:r/rust', { site: 'reddit', handle: 'r/rust', addedAt: 5, timelineId: 't1' })
    remote('feed_timelines', 't1', { name: 'friends', pinned: true })

    await feedsSyncer.syncNow()

    expect(ids().sort()).toEqual(['reddit:r/rust', 'x:jack'])
    expect(watch$.timelines.peek()).toEqual([{ id: 't1', name: 'friends', pinned: true }])
    expect(watch$.profiles.peek().map((profile) => profile.timelineId)).toEqual(['t1', 't1'])
    expect([...server.feed_sources.keys()].sort()).toEqual(['reddit:r/rust', 'x:jack'])
    expect(server.feed_sources.get('x:jack')!.json.timelineId).toBe('t1')
    expect(server.feed_timelines.size).toBe(1)
    // The tab that showed the timeline made here shows the one it was put into.
    expect(tabs$.tabs.peek().map((tab) => tab.url)).toEqual([feedTabUrl('t1'), 'https://example.com'])
    expect(syncMeta$.feeds.pendingSources.peek()).toEqual([])
    expect(syncMeta$.feeds.pendingTimelines.peek()).toEqual([])
  })

  it('keeps sources added on two devices at once, and takes away one taken away elsewhere', async () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    watch$.watch({ site: 'bluesky', handle: 'alice.bsky.social' })
    await feedsSyncer.syncNow()
    setProfilePosts('bluesky:alice.bsky.social', [{ key: 'k', createdAtMs: 1, firstSeenAt: 0 } as any])
    watch$.updateProfile('x:jack', { notify: true, seenAt: 7 })

    // Another device adds a source and takes one away while this one adds its own.
    remote('feed_sources', 'reddit:r/rust', { site: 'reddit', handle: 'r/rust', addedAt: 5 })
    remote('feed_sources', 'bluesky:alice.bsky.social', { deleted_at: '2026-10-20T00:00:00Z' })
    watch$.watch({ site: 'reddit', handle: 'r/golang' })

    await feedsSyncer.syncNow()

    expect(ids().sort()).toEqual(['reddit:r/golang', 'reddit:r/rust', 'x:jack'])
    expect(watch$.profiles.peek().find((profile) => profile.key === 'x:jack')).toMatchObject({ notify: true, seenAt: 7 })
    expect(getProfilePosts('bluesky:alice.bsky.social')).toEqual([])
    expect(server.feed_sources.get('reddit:r/golang')!.json).toMatchObject({ site: 'reddit', handle: 'r/golang' })
  })

  it('pushes a source taken away here, so other devices take it away too', async () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    await feedsSyncer.syncNow()

    watch$.unwatch('x:jack')
    await feedsSyncer.syncNow()

    expect(server.feed_sources.get('x:jack')!.json.deleted_at).toBeString()
    // Pulled back as it was pushed, it changes nothing.
    await feedsSyncer.syncNow()
    expect(ids()).toEqual([])
  })

  it('keeps a change made here over the same row pulled before it was pushed', async () => {
    const id = watch$.createTimeline('News', [])
    await feedsSyncer.syncNow()

    remote('feed_timelines', id, { name: 'Elsewhere' })
    watch$.updateTimeline(id, { name: 'Here' })
    await feedsSyncer.syncNow()

    expect(watch$.timelines.peek()[0].name).toBe('Here')
    expect(server.feed_timelines.get(id)!.json.name).toBe('Here')
  })

  it('does not sync what a check or a read changes', async () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    await feedsSyncer.syncNow()
    watch$.updateProfile('x:jack', { lastCheckedAt: 1, name: 'Jack', avatar: 'https://a' })
    watch$.markFeedSeen()
    expect(syncMeta$.feeds.pendingSources.peek()).toEqual([])
  })

  it('pulls only what changed since the last sync, taking a timeline away when it was elsewhere', async () => {
    watch$.watch({ site: 'x', handle: 'jack' })
    const id = watch$.createTimeline('News', ['x:jack'])
    await feedsSyncer.syncNow()
    // The rows it pushed come back once, and the pulls after only bring what changed after them.
    await feedsSyncer.syncNow()
    expect(syncMeta$.feeds.sourcesCursor.peek()).toBeString()

    remote('feed_timelines', id, { deleted_at: '2026-10-20T00:00:00Z' })
    remote('feed_sources', 'x:jack', { site: 'x', handle: 'Jack', addedAt: 1, checkIntervalMinutes: 15 })
    // Not a source Nora can watch: left alone.
    remote('feed_sources', 'myspace:tom', { site: 'myspace', handle: 'tom', addedAt: 1 })
    await feedsSyncer.syncNow()

    expect(watch$.timelines.peek()).toEqual([])
    expect(watch$.profiles.peek()).toEqual([expect.objectContaining({ key: 'x:jack', handle: 'Jack', checkIntervalMinutes: 15 })])
    expect(syncMeta$.feeds.pendingTimelines.peek()).toEqual([])
  })
})
