import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { createLogger } from '@/lib/log'
import { settings$ } from '@/states/settings'
import { getUserStylesSnapshot, userStyles$ } from '@/states/user-styles'
import { bookmarksSyncer } from './sync/bookmarks'
import { settingsSyncer } from './sync/settings'
import { userStylesSyncer } from './sync/user-styles'

const logger = createLogger('sync', { devOnly: true })

const canSync = () => {
  const { userId, plan } = auth$.get()
  return Boolean(userId && plan && plan !== 'free')
}

const getSettingsSnapshot = (value: any = settings$.get()) => {
  // siteZoom is device-local and intentionally excluded from sync.
  const { toggleService, addProfile, updateProfile, deleteProfile, siteZoom, ...data } = value
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
  await Promise.all([settingsSyncer.syncNow(), bookmarksSyncer.syncNow(), userStylesSyncer.syncNow()])
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

userStyles$.onChange(({ value, getPrevious }) => {
  if (userStylesSyncer.isApplyingRemote()) {
    return
  }

  const prev = getPrevious()
  if (!prev) {
    return
  }

  if (JSON.stringify(getUserStylesSnapshot(value)) !== JSON.stringify(getUserStylesSnapshot(prev))) {
    logger.log('detected local user styles change')
    userStylesSyncer.markDirty()
    if (canSync()) {
      userStylesSyncer.scheduleSync()
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
