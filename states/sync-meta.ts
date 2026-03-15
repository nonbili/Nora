import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import type { Settings } from './settings'
import type { Bookmarks } from './bookmarks'

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
})

syncObservable(syncMeta$, {
  persist: {
    name: 'sync-meta',
    plugin: ObservablePersistMMKV,
  },
})
