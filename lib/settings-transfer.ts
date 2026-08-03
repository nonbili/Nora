import { blocklist$ } from '@/states/blocklist'
import { bookmarks$, type Bookmark } from '@/states/bookmarks'
import { getSettingsSnapshot, settings$, type Settings } from '@/states/settings'
import { getUserStylesSnapshot, userStyles$ } from '@/states/user-styles'
import { normalizeUserStyles, type UserStylesSnapshot } from '@/lib/user-styles'
import { version } from '../package.json'

export const SETTINGS_BACKUP_KIND = 'nora-settings'
export const SETTINGS_BACKUP_VERSION = 1

export interface SettingsBackup {
  kind: typeof SETTINGS_BACKUP_KIND
  version: typeof SETTINGS_BACKUP_VERSION
  appVersion: string
  exportedAt: string
  settings: Settings
  bookmarks: Bookmark[]
  userStyles: UserStylesSnapshot
  blocklist: { enabled: boolean }
}

const normalizeBookmarks = (bookmarks?: (Partial<Bookmark> | null | undefined)[]): Bookmark[] =>
  (bookmarks || [])
    .filter((bookmark) => bookmark && typeof bookmark.url === 'string' && bookmark.url.trim())
    .map((bookmark) => ({
      url: bookmark!.url!,
      title: typeof bookmark!.title === 'string' ? bookmark!.title : undefined,
      icon: typeof bookmark!.icon === 'string' ? bookmark!.icon : undefined,
    }))

export const createSettingsBackup = (): SettingsBackup => ({
  kind: SETTINGS_BACKUP_KIND,
  version: SETTINGS_BACKUP_VERSION,
  appVersion: version,
  exportedAt: new Date().toISOString(),
  settings: getSettingsSnapshot(),
  bookmarks: normalizeBookmarks(bookmarks$.bookmarks.get()),
  userStyles: getUserStylesSnapshot(),
  // Only the toggle travels: the rest of the blocklist state is a device-local
  // download cache (etags, timestamps).
  blocklist: { enabled: blocklist$.enabled.get() },
})

export const exportSettingsJson = () => JSON.stringify(createSettingsBackup(), null, 2)

export const settingsBackupFilename = () => `Nora_settings_${Date.now()}.json`

export interface ParsedSettingsBackup {
  settings?: Settings
  bookmarks?: Bookmark[]
  userStyles?: UserStylesSnapshot
  blocklist?: { enabled: boolean }
}

/**
 * Parse a settings backup file. Unknown or missing sections are dropped, every
 * kept section is normalized so a hand-edited or older file can't poison state.
 */
export const parseSettingsBackup = (text: string): ParsedSettingsBackup => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file')
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Not a Nora settings file')
  }

  const backup = data as Partial<SettingsBackup>
  if (backup.kind !== SETTINGS_BACKUP_KIND) {
    throw new Error('Not a Nora settings file')
  }
  if (backup.version !== SETTINGS_BACKUP_VERSION) {
    throw new Error(
      typeof backup.version === 'number' && backup.version > SETTINGS_BACKUP_VERSION
        ? 'This settings file was created by a newer version of Nora'
        : 'Unsupported Nora settings file version',
    )
  }

  const isObject = (value: unknown) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

  const result: ParsedSettingsBackup = {}
  if (isObject(backup.settings)) {
    result.settings = getSettingsSnapshot(backup.settings)
  }
  if (Array.isArray(backup.bookmarks)) {
    result.bookmarks = normalizeBookmarks(backup.bookmarks)
  }
  if (isObject(backup.userStyles)) {
    result.userStyles = normalizeUserStyles(backup.userStyles)
  }
  if (isObject(backup.blocklist) && typeof backup.blocklist?.enabled === 'boolean') {
    result.blocklist = { enabled: backup.blocklist.enabled }
  }

  if (!result.settings && !result.bookmarks && !result.userStyles && !result.blocklist) {
    throw new Error('Nothing to import in this file')
  }

  return result
}

/** Number of enabled custom scripts in a backup, so the import can warn about them. */
export const countEnabledCustomScripts = (backup: ParsedSettingsBackup) =>
  backup.userStyles?.customScripts.filter((script) => script.enabled).length || 0

/** Apply a parsed backup. Returns the names of the sections that were restored. */
export const applySettingsBackup = (backup: ParsedSettingsBackup) => {
  const restored: string[] = []

  if (backup.settings) {
    settings$.assign(backup.settings)
    restored.push('settings')
  }
  if (backup.bookmarks) {
    bookmarks$.bookmarks.set(backup.bookmarks)
    restored.push('bookmarks')
  }
  if (backup.userStyles) {
    userStyles$.assign(backup.userStyles)
    restored.push('user styles')
  }
  if (backup.blocklist) {
    blocklist$.enabled.set(backup.blocklist.enabled)
    restored.push('blocklist')
  }

  return restored
}

export const importSettingsJson = (text: string) => applySettingsBackup(parseSettingsBackup(text))
