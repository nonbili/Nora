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

  // Writes need a plan: the latest App Store subscription decides, as in getNoraEntitlement.
  async function setPlan(userId: string, status: 'active' | 'expired') {
    const { error } = await admin.schema('nora').from('app_store_subscriptions').insert({
      original_transaction_id: crypto.randomUUID(), user_id: userId, product_id: 'nora_sync', status,
      expires_at: null, latest_transaction_jws: 'test',
    })
    if (error) throw error
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
      await setPlan(data.user.id, 'active')
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
      expect(snapshot.watch.timelines).toEqual([{ id: timeline, name: 'Friends' }])
      expect(snapshot.watch.profiles.map((profile) => profile.timelineId)).toEqual([timeline, timeline])
      expect(snapshot.meta.feeds.pendingSources).toEqual([])
      expect(snapshot.meta.feeds.pendingTimelines).toEqual([])
    }
    expect((await b.snapshot()).watch.profiles.find((profile) => profile.key === 'bluesky:alice.bsky.social'))
      .toMatchObject({ notify: true, seenAt: 7, lastCheckedAt: 9 })
    // Notifications are of each device.
    expect((await a.snapshot()).watch.profiles.find((profile) => profile.key === 'bluesky:alice.bsky.social')?.notify)
      .toBeUndefined()

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
      // Feed rows are taken away with deleted_at only.
      if (table.startsWith('feed_')) {
        expect(deletion.error).not.toBeNull()
      } else {
        expect(deletion.error).toBeNull()
        expect(deletion.data).toEqual([])
      }
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
    // Documents are written through put_doc.
    await a.command({ op: 'failNextPush', table: 'rpc/put_doc' })
    await expect(a.sync('settings')).rejects.toThrow()
    expect((await a.snapshot()).meta.settings).toMatchObject({ dirty: true, lastError: expect.any(String) })
    await a.sync('settings')
    expect((await a.snapshot()).meta.settings).toMatchObject({ dirty: false })
    expect((await a.snapshot()).meta.settings.lastError).toBeUndefined()
    const b = await device()
    await b.sync('settings')
    expect((await b.snapshot()).settings.theme).toBe('dark')
  })

  const signIn = (instance: Device, userIndex: number) =>
    instance.command({ op: 'signIn', email: users[userIndex].email, password: users[userIndex].password })

  const remoteRows = async (userIndex: number, table: string) => {
    const { data, error } = await users[userIndex].client.schema('nora').from(table).select('*')
    expect(error).toBeNull()
    return data!
  }

  // Device A synced with account 0, then signs in to account 1, which device B synced already.
  async function switchedDevice() {
    const b = await device(1)
    await b.command({ op: 'watch', site: 'reddit', handle: 'r/rust' })
    await b.command({ op: 'settings', value: { theme: 'light' } })
    await b.command({ op: 'bookmark', url: 'https://b.example' })
    await b.sync()
    const a = await device(0)
    await a.command({ op: 'watch', site: 'x', handle: 'jack' })
    await a.command({ op: 'settings', value: { theme: 'dark' } })
    await a.command({ op: 'bookmark', url: 'https://a.example' })
    await a.sync()
    await signIn(a, 1)
    return { a, b }
  }

  it('pauses sync on another account until the user chooses, uploading nothing meanwhile', async () => {
    const { a } = await switchedDevice()
    const before = await a.snapshot()
    expect(before.owner.ownerUserId).toBe(users[0].id)
    expect(before.needsAccountChoice).toBe(true)
    await a.command({ op: 'watch', site: 'x', handle: 'jill' })
    await a.sync()
    expect((await remoteRows(1, 'feed_sources')).map((row) => row.id)).toEqual(['reddit:r/rust'])
    expect((await remoteRows(1, 'settings'))[0].json.theme).toBe('light')
    expect((await remoteRows(1, 'bookmarks'))[0].json.bookmarks).toEqual([{ url: 'https://b.example' }])
    expect((await a.snapshot()).watch.profiles.map((profile) => profile.key).sort()).toEqual(['x:jack', 'x:jill'])
  })

  it('replaces the device data with the account data, keeping a backup and pushing nothing of the old account', async () => {
    const { a } = await switchedDevice()
    await a.command({ op: 'accountChoice', choice: 'useAccount' })
    const after = await a.snapshot()
    expect(after.owner.ownerUserId).toBe(users[1].id)
    expect(after.needsAccountChoice).toBe(false)
    expect(after.watch.profiles.map((profile) => profile.key)).toEqual(['reddit:r/rust'])
    expect(after.settings.theme).toBe('light')
    expect(after.bookmarks.bookmarks).toEqual([{ url: 'https://b.example' }])
    expect(JSON.parse(after.owner.switchBackup!.json).bookmarks).toEqual([{ url: 'https://a.example' }])
    expect(after.owner.switchBackup!.fromUserId).toBe(users[0].id)
    expect((await remoteRows(1, 'feed_sources')).map((row) => row.id)).toEqual(['reddit:r/rust'])
    expect((await remoteRows(1, 'bookmarks'))[0].json.bookmarks).toEqual([{ url: 'https://b.example' }])
    // Account 0 keeps what it had.
    expect((await remoteRows(0, 'feed_sources')).map((row) => row.id)).toEqual(['x:jack'])
  })

  it('starts from defaults when the account to use has nothing yet', async () => {
    const a = await device(0)
    await a.command({ op: 'watch', site: 'x', handle: 'jack' })
    await a.command({ op: 'settings', value: { theme: 'dark' } })
    await a.command({ op: 'bookmark', url: 'https://a.example' })
    await a.sync()
    await signIn(a, 1)
    await a.command({ op: 'accountChoice', choice: 'useAccount' })
    const after = await a.snapshot()
    expect(after.watch.profiles).toEqual([])
    expect(after.bookmarks.bookmarks).toEqual([])
    expect(after.settings.theme).toBeNull()
    expect(await remoteRows(1, 'feed_sources')).toEqual([])
    expect(await remoteRows(1, 'bookmarks')).toEqual([])
  })

  it('merges the device into the account: the account keeps its documents, gains what only the device had', async () => {
    const { a, b } = await switchedDevice()
    await a.command({ op: 'accountChoice', choice: 'mergeDevice' })
    const after = await a.snapshot()
    expect(after.owner.ownerUserId).toBe(users[1].id)
    expect(after.settings.theme).toBe('light')
    expect(after.meta.settings.backup?.value.theme).toBe('dark')
    expect(after.bookmarks.bookmarks).toEqual([{ url: 'https://b.example' }, { url: 'https://a.example' }])
    expect((await remoteRows(1, 'feed_sources')).map((row) => row.id).sort()).toEqual(['reddit:r/rust', 'x:jack'])
    await b.sync()
    expect((await b.snapshot()).bookmarks.bookmarks).toEqual([{ url: 'https://b.example' }, { url: 'https://a.example' }])
    expect((await b.snapshot()).watch.profiles.map((profile) => profile.key).sort()).toEqual(['reddit:r/rust', 'x:jack'])
  })

  it('drops a run whose account changed while its request was in flight', async () => {
    const a = await device(0)
    await a.sync()
    await a.command({ op: 'settings', value: { theme: 'dark' } })
    await a.command({ op: 'watch', site: 'x', handle: 'jack' })
    const held = a.command({ op: 'holdNextRequest', path: 'settings' })
    const run = a.sync()
    await held
    await signIn(a, 1)
    await a.command({ op: 'releaseFetch' })
    await run
    expect(await remoteRows(1, 'settings')).toEqual([])
    expect(await remoteRows(1, 'feed_sources')).toEqual([])
    expect((await a.snapshot()).needsAccountChoice).toBe(true)
  })

  it('keeps the owner of a device whose first sync failed, so another account does not inherit its data', async () => {
    const a = await device(0)
    await a.command({ op: 'watch', site: 'x', handle: 'jack' })
    await a.command({ op: 'failNextPush', table: 'feed_sources' })
    await expect(a.sync('feeds')).rejects.toThrow()
    await signIn(a, 1)
    expect((await a.snapshot()).needsAccountChoice).toBe(true)
    await a.sync()
    expect(await remoteRows(1, 'feed_sources')).toEqual([])
  })

  const remoteDoc = async (table: 'settings' | 'bookmarks' | 'user_styles', userIndex = 0) =>
    (await remoteRows(userIndex, table))[0]?.json

  it('writes an edit made while a document push was in flight', async () => {
    const a = await device()
    await a.sync('settings')
    await a.command({ op: 'settings', value: { theme: 'dark' } })
    const held = a.command({ op: 'holdNextRequest', path: 'rpc/put_doc' })
    const run = a.sync('settings')
    await held
    await a.command({ op: 'settings', value: { theme: 'light' } })
    await a.command({ op: 'releaseFetch' })
    await run
    expect((await remoteDoc('settings')).theme).toBe('light')
    expect((await a.snapshot()).meta.settings.dirty).toBe(false)
  })

  it('keeps an edit made while a document was being pulled', async () => {
    const a = await device()
    const b = await device()
    await a.sync('settings')
    await b.sync('settings')
    await b.command({ op: 'settings', value: { theme: 'dark' } })
    await b.sync('settings')
    const held = a.command({ op: 'holdNextRequest', path: 'settings' })
    const run = a.sync('settings')
    await held
    await a.command({ op: 'settings', value: { pullToRefresh: true } })
    await a.command({ op: 'releaseFetch' })
    await run
    const after = await a.snapshot()
    expect(after.settings).toMatchObject({ theme: 'dark', pullToRefresh: true })
    expect(await remoteDoc('settings')).toMatchObject({ theme: 'dark', pullToRefresh: true })
    expect(after.meta.settings.backup).toBeUndefined()
  })

  it('merges settings changed on two devices key by key', async () => {
    const a = await device()
    const b = await device()
    await a.sync()
    await b.sync()
    await a.command({ op: 'settings', value: { theme: 'dark' } })
    await b.command({ op: 'settings', value: { pullToRefresh: true } })
    await a.sync('settings')
    await b.sync('settings')
    await a.sync('settings')
    for (const instance of [a, b]) {
      const snapshot = await instance.snapshot()
      expect(snapshot.settings).toMatchObject({ theme: 'dark', pullToRefresh: true })
      expect(snapshot.meta.settings.backup).toBeUndefined()
    }
  })

  it('merges bookmarks by URL, including deletions, and custom scripts by id', async () => {
    const a = await device()
    const b = await device()
    await a.command({ op: 'bookmark', url: 'https://x.example' })
    await a.sync()
    await b.sync()
    await a.command({ op: 'deleteBookmark', url: 'https://x.example' })
    await a.command({ op: 'bookmark', url: 'https://y.example' })
    await b.command({ op: 'bookmark', url: 'https://z.example' })
    const scriptA = await a.command({ op: 'customScript', name: 'A' }) as string
    const scriptB = await b.command({ op: 'customScript', name: 'B' }) as string
    await a.sync()
    await b.sync()
    await a.sync()
    for (const instance of [a, b]) {
      const snapshot = await instance.snapshot()
      expect(snapshot.bookmarks.bookmarks.map((bookmark) => bookmark.url).sort()).toEqual(['https://y.example', 'https://z.example'])
      expect(snapshot.styles.customScripts.map((script) => script.id).sort()).toEqual([scriptA, scriptB].sort())
    }
  })

  it('refuses a document write on top of a row that changed since it was read', async () => {
    const api = users[0].client.schema('nora')
    const first = await api.rpc('put_doc', { p_user: users[0].id, p_table: 'settings', p_json: { theme: 'dark' }, p_base: null })
    expect(first.error).toBeNull()
    expect(first.data.ok).toBe(true)
    const again = await api.rpc('put_doc', { p_user: users[0].id, p_table: 'settings', p_json: { theme: 'light' }, p_base: null })
    expect(again.data).toMatchObject({ ok: false, json: { theme: 'dark' }, updated_at: first.data.updated_at })
    const second = await api.rpc('put_doc', { p_user: users[0].id, p_table: 'settings', p_json: { theme: 'light' }, p_base: first.data.updated_at })
    expect(second.data.ok).toBe(true)
    const stale = await api.rpc('put_doc', { p_user: users[0].id, p_table: 'settings', p_json: { theme: 'stale' }, p_base: first.data.updated_at })
    expect(stale.data).toMatchObject({ ok: false, json: { theme: 'light' } })
    expect((await api.rpc('put_doc', { p_user: users[0].id, p_table: 'feed_sources', p_json: {}, p_base: null })).error).not.toBeNull()
    // A write meant for another account than the one signed in is refused.
    const wrongAccount = await api.rpc('put_doc', { p_user: users[1].id, p_table: 'settings', p_json: { theme: 'x' }, p_base: null })
    expect(wrongAccount.error?.code).toBe('42501')
    // Another account's row is out of reach: its write goes to its own row.
    const other = await users[1].client.schema('nora').rpc('put_doc', { p_user: users[1].id, p_table: 'settings', p_json: { theme: 'x' }, p_base: null })
    expect(other.data.ok).toBe(true)
    expect((await remoteDoc('settings')).theme).toBe('light')
  })

  it('takes the other device on keys that differ when no base is known, keeping a backup to restore', async () => {
    const a = await device()
    const b = await device()
    await a.sync('settings')
    await b.sync('settings')
    await a.command({ op: 'forgetBase', scope: 'settings' })
    await a.command({ op: 'settings', value: { theme: 'dark' } })
    await b.command({ op: 'settings', value: { pullToRefresh: true } })
    await b.sync('settings')
    await a.sync('settings')
    const merged = await a.snapshot()
    expect(merged.settings.pullToRefresh).toBe(true)
    expect(merged.settings.theme).toBeNull()
    expect(merged.meta.settings.backup?.value.theme).toBe('dark')
    await a.command({ op: 'restoreBackup', scope: 'settings' })
    await a.sync('settings')
    const restored = await a.snapshot()
    expect(restored.settings.theme).toBe('dark')
    expect(restored.meta.settings.backup).toBeUndefined()
    expect((await remoteDoc('settings')).theme).toBe('dark')
  })

  it('refuses sync writes from an account without a plan, and from one whose plan lapsed', async () => {
    const api = users[0].client.schema('nora')
    expect((await api.rpc('put_doc', { p_user: users[0].id, p_table: 'settings', p_json: { theme: 'dark' }, p_base: null })).data.ok).toBe(true)
    await setPlan(users[0].id, 'expired')
    for (const table of feedTables) {
      expect((await api.from(table).insert({ user_id: users[0].id, id: 'x', json: {} })).error).not.toBeNull()
    }
    expect((await api.rpc('put_doc', { p_user: users[0].id, p_table: 'bookmarks', p_json: { bookmarks: [] }, p_base: null })).error).not.toBeNull()
    const settings = await api.from('settings').select('updated_at').single()
    // An error, not a refused write, which the device would take for a conflict and retry.
    const refused = await api.rpc('put_doc', { p_user: users[0].id, p_table: 'settings', p_json: { theme: 'light' }, p_base: settings.data!.updated_at })
    expect(refused.error?.code).toBe('42501')
    // What it synced stays readable.
    expect((await remoteDoc('settings')).theme).toBe('dark')

    // Nor can it give itself one: billing rows are the server's.
    expect((await api.from('app_store_subscriptions').insert({
      original_transaction_id: 'forged', user_id: users[0].id, product_id: 'nora_sync', status: 'active',
      latest_transaction_jws: 'forged',
    })).error).not.toBeNull()
    expect((await api.from('billing_accounts').select('user_id')).error).not.toBeNull()
    expect((await api.from('feed_sources').insert({ user_id: users[0].id, id: 'x', json: {} })).error).not.toBeNull()

    // A Stripe Nora Sync subscription is a plan too.
    expect((await admin.from('customers').insert({
      user_id: users[0].id, customer: 'cus_test', subscription: 'sub_test', plan: 'price_1SrU6bHiU2avyi3sNvj80Azi',
    })).error).toBeNull()
    expect((await api.from('feed_sources').insert({ user_id: users[0].id, id: 'x', json: {} })).error).toBeNull()
  })

  it('refuses deleting feed rows outright, so a removal always reaches the other devices', async () => {
    const api = users[0].client.schema('nora')
    expect((await api.from('feed_sources').insert({ user_id: users[0].id, id: 'x', json: {} })).error).toBeNull()
    expect((await api.from('feed_sources').delete().eq('id', 'x')).error).not.toBeNull()
    expect(await remoteRows(0, 'feed_sources')).toHaveLength(1)
  })

  it('merges again from what this device changed when its merged write is refused', async () => {
    const a = await device()
    const b = await device()
    await a.command({ op: 'bookmark', url: 'https://a.example' })
    await a.sync('bookmarks')
    await b.sync('bookmarks')
    await a.command({ op: 'bookmark', url: 'https://mine.example' })
    await b.command({ op: 'bookmark', url: 'https://theirs.example' })
    await b.sync('bookmarks')
    // A merges in B's bookmark, but B takes it away again before A's write lands.
    const held = a.command({ op: 'holdNextRequest', path: 'rpc/put_doc' })
    const run = a.sync('bookmarks')
    await held
    await b.command({ op: 'deleteBookmark', url: 'https://theirs.example' })
    await b.sync('bookmarks')
    await a.command({ op: 'releaseFetch' })
    await run
    const urls = ['https://a.example', 'https://mine.example']
    expect((await a.snapshot()).bookmarks.bookmarks.map((bookmark) => bookmark.url)).toEqual(urls)
    expect((await remoteDoc('bookmarks')).bookmarks.map((bookmark: { url: string }) => bookmark.url)).toEqual(urls)
  })

  it('drops an account choice whose account changed and came back while it was reading', async () => {
    const { a } = await switchedDevice()
    const held = a.command({ op: 'holdNextRequest', path: 'feed_sources' })
    const choice = a.command({ op: 'accountChoice', choice: 'useAccount' })
    await held
    await signIn(a, 0)
    await signIn(a, 1)
    await a.command({ op: 'releaseFetch' })
    await choice
    const after = await a.snapshot()
    expect(after.owner.ownerUserId).toBe(users[0].id)
    expect(after.needsAccountChoice).toBe(true)
    expect(after.watch.profiles.map((profile) => profile.key)).toEqual(['x:jack'])
  })

  it('keeps what was changed while an account choice was reading in its backup', async () => {
    const { a } = await switchedDevice()
    const held = a.command({ op: 'holdNextRequest', path: 'feed_sources' })
    const choice = a.command({ op: 'accountChoice', choice: 'useAccount' })
    await held
    await a.command({ op: 'bookmark', url: 'https://late.example' })
    await a.command({ op: 'releaseFetch' })
    await choice
    const after = await a.snapshot()
    expect(after.owner.ownerUserId).toBe(users[1].id)
    expect(JSON.parse(after.owner.switchBackup!.json).bookmarks.map((bookmark: { url: string }) => bookmark.url))
      .toContain('https://late.example')
  })
})
