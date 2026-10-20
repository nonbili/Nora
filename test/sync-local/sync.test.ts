import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Device } from './device-client'
import { localConfig } from './protocol'

const tables = ['settings', 'bookmarks', 'user_styles', 'feed_sources', 'feed_timelines'] as const
const feedTables = ['feed_sources', 'feed_timelines'] as const
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

// Never opens connections during ordinary `bun test`, including in public CI.
const local = process.env.NORA_SYNC_LOCAL === '1' ? describe : describe.skip
local('sync against local Supabase', () => {
  let admin: SupabaseClient
  const users: { id: string; email: string; password: string; client: SupabaseClient }[] = []
  const devices: Device[] = []

  async function device(userIndex = 0) {
    const user = users[userIndex]
    const instance = await Device.start(user.email, user.password)
    devices.push(instance)
    return instance
  }

  beforeEach(async () => {
    const { url, anonKey, serviceKey } = localConfig()
    admin = createClient(url, serviceKey, options)
    for (let index = 0; index < 2; index++) {
      const email = `nora-sync-${crypto.randomUUID()}@example.com`
      const password = crypto.randomUUID()
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) throw error
      const user = { id: data.user.id, email, password, client: createClient(url, anonKey, options) }
      users.push(user)
      const login = await user.client.auth.signInWithPassword({ email, password })
      if (login.error) throw login.error
    }
    // Fail clearly if the Nora schema was not applied or exposed in PostgREST.
    for (const table of tables) {
      const { error } = await users[0].client.schema('nora').from(table).select('user_id').limit(1)
      if (error) throw new Error(`Local nora.${table} unavailable: ${error.message}`)
    }
  })

  afterEach(async () => {
    await Promise.all(devices.splice(0).map((instance) => instance.close()))
    const errors: string[] = []
    for (const user of users.splice(0)) {
      const { error } = await admin.auth.admin.deleteUser(user.id)
      if (error) errors.push(error.message)
    }
    if (errors.length) throw new Error(`Test user cleanup failed: ${errors.join(', ')}`)
  })

  it('merges two devices on first sync and propagates source and timeline tombstones', async () => {
    const a = await device()
    const b = await device()
    await a.command({ op: 'watch', site: 'x', handle: 'jack' })
    const timeline = await a.command({ op: 'timeline', name: 'Friends', keys: ['x:jack'] }) as string
    await b.command({ op: 'watch', site: 'bluesky', handle: 'alice.bsky.social' })
    await b.command({ op: 'profile', key: 'bluesky:alice.bsky.social', patch: { notify: true, seenAt: 7, lastCheckedAt: 9 } })
    await b.command({ op: 'timeline', name: 'friends', keys: ['bluesky:alice.bsky.social'] })
    await a.sync('feeds')
    await b.sync('feeds')
    await a.sync('feeds')

    for (const instance of [a, b]) {
      const snapshot = await instance.snapshot()
      expect(snapshot.watch.profiles.map((profile) => profile.key).sort()).toEqual(['bluesky:alice.bsky.social', 'x:jack'])
      expect(snapshot.watch.timelines).toEqual([{
        id: timeline, name: 'Friends', profileKeys: ['x:jack', 'bluesky:alice.bsky.social'],
      }])
      expect(snapshot.meta.feeds.pendingSources).toEqual([])
      expect(snapshot.meta.feeds.pendingTimelines).toEqual([])
    }
    expect((await b.snapshot()).watch.profiles.find((profile) => profile.key === 'bluesky:alice.bsky.social'))
      .toMatchObject({ notify: true, seenAt: 7, lastCheckedAt: 9 })
    expect((await a.snapshot()).watch.profiles.find((profile) => profile.key === 'bluesky:alice.bsky.social'))
      .toMatchObject({ notify: false })

    await a.command({ op: 'unwatch', key: 'x:jack' })
    await a.command({ op: 'deleteTimeline', id: timeline })
    await a.sync('feeds')
    await b.sync('feeds')
    expect((await b.snapshot()).watch.profiles.map((profile) => profile.key)).toEqual(['bluesky:alice.bsky.social'])
    expect((await b.snapshot()).watch.timelines).toEqual([])
    for (const [table, id] of [['feed_sources', 'x:jack'], ['feed_timelines', timeline]] as const) {
      const { data, error } = await users[0].client.schema('nora').from(table).select('json').eq('id', id).single()
      expect(error).toBeNull()
      expect(data!.json.deleted_at).toBeString()
    }
  })

  it('keeps concurrent additions from both devices and propagates later edits', async () => {
    const a = await device()
    const b = await device()
    await a.sync('feeds')
    await b.sync('feeds')
    await a.command({ op: 'watch', site: 'x', handle: 'jack' })
    await b.command({ op: 'watch', site: 'reddit', handle: 'r/rust' })
    // Both start from an empty remote; real independent clients push together.
    await Promise.all([a.sync('feeds'), b.sync('feeds')])
    await Promise.all([a.sync('feeds'), b.sync('feeds')])
    for (const instance of [a, b]) {
      expect((await instance.snapshot()).watch.profiles.map((profile) => profile.key).sort())
        .toEqual(['reddit:r/rust', 'x:jack'])
    }
    await a.command({ op: 'profile', key: 'x:jack', patch: { checkIntervalMinutes: 15 } })
    await a.sync('feeds')
    await b.sync('feeds')
    expect((await b.snapshot()).watch.profiles.find((profile) => profile.key === 'x:jack')?.checkIntervalMinutes).toBe(15)
  })

  it('paginates beyond the API row limit with tied timestamps, then pulls incremental changes', async () => {
    const api = users[0].client.schema('nora')
    const rows = Array.from({ length: 1005 }, (_, index) => {
      const handle = `r/test${String(index).padStart(4, '0')}`
      return { user_id: users[0].id, id: `reddit:${handle}`, json: { site: 'reddit', handle, addedAt: 1 } }
    })
    // One INSERT transaction makes the real now() trigger produce equal timestamps.
    expect((await api.from('feed_sources').insert(rows)).error).toBeNull()
    const sample = await api.from('feed_sources').select('updated_at').limit(2)
    expect(sample.error).toBeNull()
    expect(sample.data![0].updated_at).toBe(sample.data![1].updated_at)

    const a = await device()
    await a.sync('feeds')
    expect((await a.snapshot()).watch.profiles.map((profile) => profile.key).sort()).toEqual(rows.map((row) => row.id))
    const before = (await a.snapshot()).meta.feeds
    expect(before.sourcesCursor).toBeString()
    await a.command({ op: 'takeFeedRequests' })
    expect((await api.from('feed_sources').upsert([
      { ...rows[0], json: { ...rows[0].json, checkIntervalMinutes: 25 } },
      { ...rows[1], json: { deleted_at: new Date().toISOString() } },
    ], { onConflict: 'user_id,id' })).error).toBeNull()
    await a.sync('feeds')
    const requests = await a.command({ op: 'takeFeedRequests' }) as string[]
    expect(requests.length).toBeGreaterThan(0)
    expect(new URL(requests[0]).searchParams.get('updated_at')).toBe(`gt.${before.sourcesCursor}`)
    const after = await a.snapshot()
    expect(after.watch.profiles).toHaveLength(1004)
    expect(after.watch.profiles.some((profile) => profile.key === rows[1].id)).toBe(false)
    expect(after.watch.profiles.find((profile) => profile.key === rows[0].id)?.checkIntervalMinutes).toBe(25)
    expect(after.meta.feeds.lastFullPullAt).toBe(before.lastFullPullAt)
  })

  it('enforces account isolation for every sync table through authenticated API clients', async () => {
    const own = users[0].client.schema('nora')
    const other = users[1].client.schema('nora')
    for (const table of tables) {
      const row = { user_id: users[1].id, json: { marker: 'private' },
        ...(table.startsWith('feed_') ? { id: 'same-id-on-both-accounts' } : {}) }
      expect((await other.from(table).insert(row)).error).toBeNull()
      expect((await own.from(table).insert({ ...row, user_id: users[0].id, json: { marker: 'own' } })).error).toBeNull()
      const visible = await own.from(table).select('user_id')
      expect(visible.error).toBeNull()
      expect(visible.data).toEqual([{ user_id: users[0].id }])
      expect((await own.from(table).select('*').eq('user_id', users[1].id)).data).toEqual([])
      expect((await own.from(table).upsert({ ...row, json: { marker: 'stolen' } }, {
        onConflict: table.startsWith('feed_') ? 'user_id,id' : 'user_id',
      })).error).not.toBeNull()
      const update = await own.from(table).update({ json: { marker: 'stolen' } }).eq('user_id', users[1].id).select()
      expect(update.error).toBeNull()
      expect(update.data).toEqual([])
      const deletion = await own.from(table).delete().eq('user_id', users[1].id).select()
      expect(deletion.error).toBeNull()
      expect(deletion.data).toEqual([])
      const preserved = await other.from(table).select('json').single()
      expect(preserved.error).toBeNull()
      expect(preserved.data!.json).toEqual({ marker: 'private' })
    }
  })

  it('advances feed timestamps only when upserted data changes', async () => {
    const api = users[0].client.schema('nora')
    for (const table of feedTables) {
      const row = { user_id: users[0].id, id: 'test', json: { marker: 'original' } }
      const first = await api.from(table).upsert(row, { onConflict: 'user_id,id' }).select('updated_at').single()
      expect(first.error).toBeNull()
      const identical = await api.from(table).upsert(row, { onConflict: 'user_id,id' }).select('updated_at').single()
      expect(identical.error).toBeNull()
      expect(identical.data!.updated_at).toBe(first.data!.updated_at)
      const changed = await api.from(table).upsert({ ...row, json: { marker: 'changed' } }, { onConflict: 'user_id,id' })
        .select('updated_at').single()
      expect(changed.error).toBeNull()
      expect(changed.data!.updated_at > first.data!.updated_at).toBe(true)
    }
  })

  it('round-trips documents, backs up conflicts, and preserves device-local zoom', async () => {
    const a = await device()
    const b = await device()
    await a.command({ op: 'settings', value: { theme: 'dark', siteZoom: { 'example.com': 1.5 } } })
    await a.command({ op: 'bookmark', url: 'https://example.com' })
    await a.command({ op: 'style', enabled: true })
    await a.sync()
    await b.command({ op: 'settings', value: { siteZoom: { 'example.com': 2 } } })
    await b.sync()
    const pulled = await b.snapshot()
    expect(pulled.settings.theme).toBe('dark')
    expect(pulled.settings.siteZoom).toEqual({ 'example.com': 2 })
    expect(pulled.bookmarks.bookmarks).toEqual([{ url: 'https://example.com' }])
    expect(pulled.styles.builtins['hide-x-home-tabs'].enabled).toBe(true)
    const remote = await users[0].client.schema('nora').from('settings').select('json').single()
    expect(remote.error).toBeNull()
    expect(remote.data!.json.siteZoom).toBeUndefined()

    await b.command({ op: 'settings', value: { theme: 'light' } })
    await a.command({ op: 'settings', value: { theme: null } })
    await a.sync('settings')
    await b.sync('settings')
    const conflict = await b.snapshot()
    expect(conflict.settings.theme).toBeNull()
    expect(conflict.settings.siteZoom).toEqual({ 'example.com': 2 })
    expect(conflict.meta.settings.backup?.value.theme).toBe('light')
    expect(conflict.meta.settings.dirty).toBe(false)
    expect(conflict.meta.settings.lastSyncedRemoteUpdatedAt).toBeString()
  })

  it('retains pending feed changes after a failed push and retries through the real API', async () => {
    expect((await users[0].client.schema('nora').from('feed_sources').insert({
      user_id: users[0].id, id: 'reddit:r/rust', json: { site: 'reddit', handle: 'r/rust', addedAt: 1 },
    })).error).toBeNull()
    const a = await device()
    await a.command({ op: 'watch', site: 'x', handle: 'jack' })
    await a.command({ op: 'failNextPush', table: 'feed_sources' })
    await expect(a.sync('feeds')).rejects.toThrow()
    const failed = await a.snapshot()
    expect(failed.meta.feeds.pendingSources).toEqual(['x:jack'])
    expect(failed.meta.feeds.lastError).toBeString()
    expect(failed.meta.feeds.sourcesCursor).toBeUndefined()
    expect(failed.meta.feeds.lastFullPullAt).toBeUndefined()
    await a.sync('feeds')
    const retried = await a.snapshot()
    expect(retried.meta.feeds.pendingSources).toEqual([])
    expect(retried.meta.feeds.lastError).toBeUndefined()
    expect(retried.meta.feeds.sourcesCursor).toBeString()
    expect(retried.meta.feeds.lastFullPullAt).toBeNumber()
    const b = await device()
    await b.sync('feeds')
    expect((await b.snapshot()).watch.profiles.map((profile) => profile.key).sort()).toEqual(['reddit:r/rust', 'x:jack'])
  })

  it('retains dirty documents after a failed push and clears them after retry', async () => {
    const a = await device()
    await a.command({ op: 'settings', value: { theme: 'dark' } })
    await a.command({ op: 'failNextPush', table: 'settings' })
    await expect(a.sync('settings')).rejects.toThrow()
    expect((await a.snapshot()).meta.settings).toMatchObject({ dirty: true, lastError: expect.any(String) })
    await a.sync('settings')
    expect((await a.snapshot()).meta.settings).toMatchObject({ dirty: false })
    expect((await a.snapshot()).meta.settings.lastError).toBeUndefined()
    const b = await device()
    await b.sync('settings')
    expect((await b.snapshot()).settings.theme).toBe('dark')
  })
})
