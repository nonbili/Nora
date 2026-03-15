import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { createLogger } from '@/lib/log'
import { settings$ } from '@/states/settings'
import { bookmarksSyncer } from './sync/bookmarks'
import { settingsSyncer } from './sync/settings'

const logger = createLogger('sync', { devOnly: true })

const canSync = () => {
  const { userId, plan } = auth$.get()
  return Boolean(userId && plan && plan !== 'free')
}

const getSettingsSnapshot = (value: any = settings$.get()) => {
  const { toggleService, addProfile, updateProfile, deleteProfile, ...data } = value
  return data
}

const getBookmarksSnapshot = (value: any = bookmarks$.get()) => {
  const { addBookmark, deleteBookmark, ...data } = value
  return data
}

export async function syncSupabase() {
  if (!canSync()) {
    logger.log('skipped syncSupabase because sync is disabled')
    return
  }

  logger.log('starting syncSupabase')
  await Promise.all([settingsSyncer.syncNow(), bookmarksSyncer.syncNow()])
  logger.log('completed syncSupabase')
}

settings$.onChange(({ value, getPrevious }) => {
  if (settingsSyncer.isApplyingRemote()) {
    return
  }

  const prev = getPrevious()
  if (!prev) {
    return
  }

  if (JSON.stringify(getSettingsSnapshot(value)) !== JSON.stringify(getSettingsSnapshot(prev))) {
    logger.log('detected local settings change')
    settingsSyncer.markDirty()
    if (canSync()) {
      settingsSyncer.scheduleSync()
    }
  }
})

bookmarks$.onChange(({ value, getPrevious }) => {
  if (bookmarksSyncer.isApplyingRemote()) {
    return
  }

  const prev = getPrevious()
  if (!prev) {
    return
  }

  if (JSON.stringify(getBookmarksSnapshot(value)) !== JSON.stringify(getBookmarksSnapshot(prev))) {
    logger.log('detected local bookmarks change')
    bookmarksSyncer.markDirty()
    if (canSync()) {
      bookmarksSyncer.scheduleSync()
    }
  }
})
