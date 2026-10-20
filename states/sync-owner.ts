import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

export interface AccountSwitchBackup {
  // The account the data belonged to, when it was known.
  fromUserId?: string
  savedAt: number
  // A settings backup, as the Backup tab exports and imports it.
  json: string
}

interface Store {
  // The account the synced data on this device belongs to. Kept apart from the sync metadata,
  // which is reset when the data changes hands.
  ownerUserId?: string
  // What was here before the data was handed to another account.
  switchBackup?: AccountSwitchBackup
}

export const syncOwner$ = observable<Store>({
  ownerUserId: undefined,
  switchBackup: undefined,
})

syncObservable(syncOwner$, {
  persist: {
    name: 'sync-owner',
    plugin: ObservablePersistMMKV,
  },
})
