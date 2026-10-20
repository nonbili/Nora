import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { getSettingsSnapshot } from '@/states/settings'
import { syncMeta$ } from '@/states/sync-meta'
import { syncOwner$ } from '@/states/sync-owner'
import { createDefaultUserStylesSnapshot } from '@/lib/user-styles'
import { exportSettingsJson } from '@/lib/settings-transfer'
import { applyRemoteWatchRows, getWatchSyncRows, type RemoteWatchRow } from '@/lib/watch-sync'
import { createLogger } from '@/lib/log'
import type { BaseSyncer, RemoteDocument } from './base'
import { bookmarksSyncer } from './bookmarks'
import { fetchRows, feedsSyncer } from './feeds'
import { settingsSyncer } from './settings'
import { userStylesSyncer } from './user-styles'
import { bumpSyncGeneration, getSyncGeneration, getSyncOwner, hasSyncPlan, needsAccountChoice, setSwitchingAccount } from './session'
import { syncSupabase } from '../sync'

const logger = createLogger('sync').child('account')

/**
 * What to do with the data on this device when it belongs to another account:
 * - useAccount: put the signed-in account's data in its place.
 * - mergeDevice: add it to the signed-in account; what the account has of the same thing stays.
 */
export type AccountChoice = 'useAccount' | 'mergeDevice'

// The next run reads the feed whole, as on a new device.
const resetFeedMeta = () => syncMeta$.feeds.set({ pendingSources: [], pendingTimelines: [] })

/** The account's document in place of this device's; what the account does not have yet starts as on a new device. */
const replaceDocument = <T>(syncer: BaseSyncer<T>, remote: RemoteDocument<T> | null, fallback: T) => {
  syncer.applyRemote(remote ? remote.value : fallback)
  syncer.setMeta({ dirty: false, lastError: undefined, backup: undefined, lastSyncedRemoteUpdatedAt: remote?.updatedAt, base: remote?.value })
}

/** The account's document stays, this device's kept as the backup; else this device's is pushed. */
const keepAccountDocument = <T>(syncer: BaseSyncer<T>, remote: RemoteDocument<T> | null) => {
  if (remote) {
    syncer.setMeta({ backup: { value: syncer.getValue(), savedAt: Date.now(), remoteUpdatedAt: remote.updatedAt } })
    syncer.applyRemote(remote.value)
  }
  syncer.setMeta({ dirty: !remote, lastError: undefined, lastSyncedRemoteUpdatedAt: remote?.updatedAt, base: remote?.value })
}

// The rows this device has and the account has not, as taken away.
const removedRows = (local: Record<string, unknown>, remote: RemoteWatchRow[]): RemoteWatchRow[] => {
  const ids = new Set(remote.map((row) => row.id))
  const at = new Date().toISOString()
  return Object.keys(local)
    .filter((id) => !ids.has(id))
    .map((id) => ({ id, json: { deleted_at: at }, updated_at: at }))
}

const takeAccountData = async () => {
  const [settings, bookmarks, styles, sources, timelines] = await Promise.all([
    settingsSyncer.fetchRemote(),
    bookmarksSyncer.fetchRemote(),
    userStylesSyncer.fetchRemote(),
    fetchRows('feed_sources'),
    fetchRows('feed_timelines'),
  ])
  return () => {
    replaceDocument(settingsSyncer, settings, getSettingsSnapshot({}))
    replaceDocument(bookmarksSyncer, bookmarks, { bookmarks: [] })
    replaceDocument(userStylesSyncer, styles, createDefaultUserStylesSnapshot())
    const local = getWatchSyncRows()
    feedsSyncer.applyRemote(() =>
      applyRemoteWatchRows(
        [...sources, ...removedRows(local.sources, sources)],
        [...timelines, ...removedRows(local.timelines, timelines)],
        { sources: new Set(), timelines: new Set() },
      ),
    )
    // The next run finds nothing to push: the feed here is now the account's.
    resetFeedMeta()
  }
}

const mergeDevice = async () => {
  const [settings, bookmarks, styles] = await Promise.all([
    settingsSyncer.fetchRemote(),
    bookmarksSyncer.fetchRemote(),
    userStylesSyncer.fetchRemote(),
  ])
  return () => {
    // Settings and styles are one thing each, not put together.
    keepAccountDocument(settingsSyncer, settings)
    keepAccountDocument(userStylesSyncer, styles)

    // Bookmarks are put together: the account's, then the ones only this device has.
    const local = bookmarks$.bookmarks.peek()
    const remoteBookmarks = bookmarks?.value.bookmarks ?? []
    const urls = new Set(remoteBookmarks.map((bookmark) => bookmark.url))
    const added = local.filter((bookmark) => !urls.has(bookmark.url))
    if (bookmarks) bookmarksSyncer.applyRemote({ bookmarks: [...remoteBookmarks, ...added] })
    bookmarksSyncer.setMeta({
      dirty: !bookmarks || added.length > 0,
      lastError: undefined,
      backup: undefined,
      lastSyncedRemoteUpdatedAt: bookmarks?.updatedAt,
      base: bookmarks?.value,
    })

    // What the account has of the feed stays, what only this device has is pushed.
    resetFeedMeta()
  }
}

/** Gives the data on this device to the signed-in account, as the user chose. */
export async function resolveAccountChoice(choice: AccountChoice) {
  const userId = auth$.userId.peek()
  if (!userId || !hasSyncPlan() || !needsAccountChoice()) return

  // Nothing else syncs while the data changes hands.
  setSwitchingAccount(true)
  bumpSyncGeneration()
  // Any change of account meanwhile, even one that came back to this account, makes what was
  // read a mix of accounts: none of it is used.
  const generation = getSyncGeneration()
  try {
    const fromUserId = getSyncOwner()
    const apply = choice === 'useAccount' ? await takeAccountData() : await mergeDevice()
    if (getSyncGeneration() !== generation || auth$.userId.peek() !== userId) {
      logger.log('account changed while switching; stopped')
      return
    }
    // Taken right before the data changes hands, so it has what was changed here while reading.
    syncOwner$.switchBackup.set({ fromUserId, savedAt: Date.now(), json: exportSettingsJson() })
    apply()
    syncOwner$.ownerUserId.set(userId)
  } finally {
    setSwitchingAccount(false)
    bumpSyncGeneration()
  }
  await syncSupabase()
}
