import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { BLOCKLIST_SOURCE_IDS, BlocklistSnapshot, BlocklistSourceCache } from '@/lib/blocklist/types'

const BLOCKLIST_SCHEMA_VERSION = 1

function createSource(url = ''): BlocklistSourceCache {
  return {
    url,
  }
}

function createSources() {
  return {
    easylist: createSource('https://easylist.to/easylist/easylist.txt'),
    easyprivacy: createSource('https://easylist.to/easylist/easyprivacy.txt'),
    braveFirstparty: createSource('https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty.txt'),
    braveFirstpartyRegional: createSource('https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty-regional.txt'),
  }
}

interface Store extends BlocklistSnapshot {
  setEnabled: (enabled: boolean) => void
}

export function normalizeBlocklist<T extends Partial<BlocklistSnapshot> | undefined>(data: T) {
  if (!data) {
    return data
  }

  // Respect a stored boolean; only default to enabled when the field is missing
  // (e.g. snapshots saved before the `enabled` toggle existed).
  const enabled = typeof data.enabled === 'boolean' ? data.enabled : true
  const hasSnapshot = typeof data.hasSnapshot === 'boolean' ? data.hasSnapshot : false
  const phase = data.phase === 'fetching' ? (hasSnapshot ? 'ready' : 'idle') : (data.phase || 'idle')
  const revision = typeof data.revision === 'number' ? data.revision : 0
  const lastUpdatedAt = typeof data.lastUpdatedAt === 'number' ? data.lastUpdatedAt : undefined
  const lastError = typeof data.lastError === 'string' ? data.lastError : undefined

  const fallbackSources = createSources()
  const currentSources = data.sources || fallbackSources
  const sources = BLOCKLIST_SOURCE_IDS.reduce(
    (acc, id) => {
      const source = currentSources[id] || fallbackSources[id]
      acc[id] = {
        url: source.url || fallbackSources[id].url,
        etag: typeof source.etag === 'string' ? source.etag : undefined,
        lastModified: typeof source.lastModified === 'string' ? source.lastModified : undefined,
        lastFetchedAt: typeof source.lastFetchedAt === 'number' ? source.lastFetchedAt : undefined,
      }
      return acc
    },
    {} as BlocklistSnapshot['sources'],
  )

  return {
    enabled,
    phase,
    hasSnapshot,
    lastUpdatedAt,
    lastError,
    revision,
    schemaVersion: BLOCKLIST_SCHEMA_VERSION,
    sources,
  } as T
}

export const blocklist$ = observable<Store>({
  enabled: true,
  phase: 'idle',
  hasSnapshot: false,
  revision: 0,
  schemaVersion: BLOCKLIST_SCHEMA_VERSION,
  sources: createSources(),
  setEnabled: (enabled) => {
    blocklist$.enabled.set(enabled)
  },
})

syncObservable(blocklist$, {
  persist: {
    name: 'blocklist',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => normalizeBlocklist(data),
    },
  },
})
