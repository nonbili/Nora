import { ui$ } from '@/states/ui'
import { settings$ } from '@/states/settings'
import { bookmarks$ } from '@/states/bookmarks'
import { settingsSyncer } from './sync/settings'
import { bookmarksSyncer } from './sync/bookmarks'

const oneDay = 24 * 3600 * 1000
export async function syncSupabase() {
  const fullSyncedAt = ui$.fullSyncedAt.get()
  const fullSync = !fullSyncedAt || Date.now() - fullSyncedAt.valueOf() > oneDay
  await Promise.all([settingsSyncer.sync(true), bookmarksSyncer.sync(true)])
  if (fullSync) {
    ui$.fullSyncedAt.set(new Date())
  }
}

settings$.onChange(({ value, getPrevious }) => {
  if (!ui$.fullSyncedAt.get()) return
  const prev = getPrevious()
  if (!prev) return

  const { updatedAt, syncedAt, toggleService, setSyncedTime, ...data } = value
  const { updatedAt: pUpdatedAt, syncedAt: pSyncedAt, toggleService: pTS, setSyncedTime: pSST, ...pData } = prev

  if (JSON.stringify(data) !== JSON.stringify(pData)) {
    if (updatedAt === pUpdatedAt) {
      settings$.updatedAt.set(Date.now())
    }
    settingsSyncer.sync()
  }
})

bookmarks$.onChange(({ value, getPrevious }) => {
  if (!ui$.fullSyncedAt.get()) return
  const prev = getPrevious()
  if (!prev) return

  const { updatedAt, syncedAt, addBookmark, deleteBookmark, setSyncedTime, ...data } = value
  const {
    updatedAt: pUpdatedAt,
    syncedAt: pSyncedAt,
    addBookmark: pAB,
    deleteBookmark: pDB,
    setSyncedTime: pSST,
    ...pData
  } = prev

  if (JSON.stringify(data) !== JSON.stringify(pData)) {
    if (updatedAt === pUpdatedAt) {
      bookmarks$.updatedAt.set(Date.now())
    }
    bookmarksSyncer.sync()
  }
})
