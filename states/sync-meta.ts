import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import type { Settings } from './settings'
import type { Bookmarks } from './bookmarks'
import type { UserStylesSnapshot } from '@/lib/user-styles'

export interface SyncBackup<T> {
  value: T
  savedAt: number
  remoteUpdatedAt?: string
}

export interface ResourceSyncMeta<T> {
  dirty: boolean
  lastSyncedRemoteUpdatedAt?: string
  lastSuccessfulSyncAt?: number
  lastError?: string
  backup?: SyncBackup<T>
}

interface Store {
  settings: ResourceSyncMeta<Settings>
  bookmarks: ResourceSyncMeta<Bookmarks>
  userStyles: ResourceSyncMeta<UserStylesSnapshot>
}

const emptyMeta = <T>(): ResourceSyncMeta<T> => ({
  dirty: false,
  lastSyncedRemoteUpdatedAt: undefined,
  lastSuccessfulSyncAt: undefined,
  lastError: undefined,
  backup: undefined,
})

export const syncMeta$ = observable<Store>({
  settings: emptyMeta<Settings>(),
  bookmarks: emptyMeta<Bookmarks>(),
  userStyles: emptyMeta<UserStylesSnapshot>(),
})

const normalizeSyncMeta = (data?: Partial<Store>): Store => ({
  settings: { ...emptyMeta<Settings>(), ...data?.settings },
  bookmarks: { ...emptyMeta<Bookmarks>(), ...data?.bookmarks },
  userStyles: { ...emptyMeta<UserStylesSnapshot>(), ...data?.userStyles },
})

syncObservable(syncMeta$, {
  persist: {
    name: 'sync-meta',
    plugin: ObservablePersistMMKV,
    transform: {
      load: normalizeSyncMeta,
    },
  },
})
