import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { supabase } from '@/lib/supabase/client'
import { auth$ } from '@/states/auth'
import { settings$, type Settings } from '@/states/settings'
import { syncMeta$ } from '@/states/sync-meta'
import { syncOwner$ } from '@/states/sync-owner'
import { settingsSyncer } from './settings'
// Register the real local-change listener as well as exercising the syncer.
import '../sync'

type RemoteRow = { json: Settings; updated_at: string }
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

describe('device-local proxy credentials in settings sync', () => {
  let remote: RemoteRow | null
  let writes: Settings[]
  let fromSpy: ReturnType<typeof spyOn>
  let rpcSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    auth$.assign({ userId: undefined, plan: undefined })
    settings$.assign({
      proxyEnabled: true,
      proxyType: 'http',
      proxyHost: 'local.proxy.example',
      proxyPort: '8080',
      proxyUsername: 'device user',
      proxyPassword: 'päss:@/% word',
      siteZoom: { 'local.example': 1.5 },
    })
    syncMeta$.settings.set({ dirty: false })
    syncOwner$.ownerUserId.set('settings-test-user')
    remote = null
    writes = []
    fromSpy = spyOn(supabase, 'from').mockImplementation((() => ({
      select: () => ({
        single: async () => remote
          ? { data: copy(remote), error: null }
          : { data: null, error: { code: 'PGRST116' } },
      }),
    })) as unknown as typeof supabase.from)
    rpcSpy = spyOn(supabase, 'rpc').mockImplementation((async (_name: string, args: { p_json: Settings }) => {
      writes.push(copy(args.p_json))
      remote = { json: copy(args.p_json), updated_at: `2026-11-04T00:00:0${writes.length}Z` }
      return { data: { ok: true, updated_at: remote.updated_at }, error: null }
    }) as unknown as typeof supabase.rpc)
    auth$.assign({ userId: 'settings-test-user', plan: 'sync' })
  })

  afterEach(async () => {
    auth$.assign({ userId: undefined, plan: undefined })
    // Also clear any debounced sync scheduled by the real listener.
    await settingsSyncer.syncNow()
    fromSpy.mockRestore()
    rpcSpy.mockRestore()
  })

  it('never sends stored credentials in the actual settings RPC payload', async () => {
    await settingsSyncer.syncNow()

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ proxyEnabled: true, proxyHost: 'local.proxy.example', proxyPort: '8080' })
    expect(writes[0]).not.toHaveProperty('proxyUsername')
    expect(writes[0]).not.toHaveProperty('proxyPassword')
    expect(writes[0]).not.toHaveProperty('siteZoom')
    expect(syncMeta$.settings.base.peek()).not.toHaveProperty('proxyPassword')
  })

  it('does not mark settings dirty or schedule sync for credential-only edits', async () => {
    await settingsSyncer.syncNow()
    const schedule = spyOn(settingsSyncer, 'scheduleSync')
    try {
      settings$.proxyUsername.set('another user')
      settings$.proxyPassword.set('another password')
      expect(syncMeta$.settings.dirty.peek()).toBe(false)
      expect(schedule).not.toHaveBeenCalled()

      // A normal proxy setting still triggers the same real listener.
      settings$.proxyHost.set('changed.proxy.example')
      expect(syncMeta$.settings.dirty.peek()).toBe(true)
      expect(schedule).toHaveBeenCalledTimes(1)
    } finally {
      schedule.mockRestore()
    }
  })

  for (const credentials of [
    { proxyUsername: 'remote user', proxyPassword: 'remote password' },
    { proxyUsername: '', proxyPassword: '' },
    {},
  ]) {
    it(`preserves local credentials when pulling ${JSON.stringify(credentials)}`, async () => {
      remote = {
        json: { ...copy(settingsSyncer.getValue()), proxyHost: 'remote.proxy.example', ...credentials },
        updated_at: '2026-11-04T00:00:00Z',
      }

      await settingsSyncer.syncNow()

      expect(settings$.proxyHost.peek()).toBe('remote.proxy.example')
      expect(settings$.proxyUsername.peek()).toBe('device user')
      expect(settings$.proxyPassword.peek()).toBe('päss:@/% word')
      expect(settings$.siteZoom.peek()).toEqual({ 'local.example': 1.5 })
      expect(writes).toHaveLength(0)
      expect(syncMeta$.settings.dirty.peek()).toBe(false)
      expect(syncMeta$.settings.base.peek()).not.toHaveProperty('proxyUsername')
      expect(syncMeta$.settings.base.peek()).not.toHaveProperty('proxyPassword')
    })
  }

  it('strips credentials from every merge input, including old sync metadata', () => {
    const value = copy(settingsSyncer.getValue())
    const legacy = { ...value, proxyUsername: 'legacy user', proxyPassword: 'legacy password' }
    const merged = settingsSyncer.merge(legacy, legacy, legacy)
    expect(merged.value).not.toHaveProperty('proxyUsername')
    expect(merged.value).not.toHaveProperty('proxyPassword')
    expect(legacy.proxyPassword).toBe('legacy password')
  })

  it('does not echo incoming credentials back to the server during a merge', async () => {
    await settingsSyncer.syncNow()
    remote = {
      json: {
        ...copy(remote!.json),
        proxyPort: '9090',
        proxyUsername: 'legacy remote user',
        proxyPassword: 'legacy remote password',
      } as Settings,
      updated_at: '2026-11-04T00:01:00Z',
    }
    settings$.proxyHost.set('changed.proxy.example')

    expect(syncMeta$.settings.dirty.peek()).toBe(true)

    await settingsSyncer.syncNow()

    expect(writes).toHaveLength(2)
    expect(writes[1]).toMatchObject({ proxyHost: 'changed.proxy.example', proxyPort: '9090' })
    expect(writes[1]).not.toHaveProperty('proxyUsername')
    expect(writes[1]).not.toHaveProperty('proxyPassword')
    expect(settings$.proxyUsername.peek()).toBe('device user')
    expect(settings$.proxyPassword.peek()).toBe('päss:@/% word')
  })
})
