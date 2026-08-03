import { describe, expect, it } from 'bun:test'
import { blocklist$ } from '@/states/blocklist'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { userStyles$ } from '@/states/user-styles'
import {
  applySettingsBackup,
  countEnabledCustomScripts,
  exportSettingsJson,
  parseSettingsBackup,
  SETTINGS_BACKUP_KIND,
  SETTINGS_BACKUP_VERSION,
} from './settings-transfer'

const backupOf = (sections: Record<string, unknown>) =>
  JSON.stringify({ kind: SETTINGS_BACKUP_KIND, version: SETTINGS_BACKUP_VERSION, ...sections })

describe('settings transfer', () => {
  it('exports the current settings, bookmarks, user styles and blocklist toggle', () => {
    settings$.headerPosition.set('bottom')
    settings$.defaultZoom.set(125)
    bookmarks$.bookmarks.set([{ url: 'https://example.com', title: 'Example', icon: '' }])
    blocklist$.enabled.set(false)

    const backup = JSON.parse(exportSettingsJson())
    expect(backup.kind).toBe(SETTINGS_BACKUP_KIND)
    expect(backup.settings.headerPosition).toBe('bottom')
    expect(backup.settings.defaultZoom).toBe(125)
    expect(backup.bookmarks).toEqual([{ url: 'https://example.com', title: 'Example', icon: '' }])
    expect(backup.blocklist).toEqual({ enabled: false })
    expect(backup.userStyles.schemaVersion).toBeGreaterThan(0)
  })

  it('rejects files that are not settings backups', () => {
    expect(() => parseSettingsBackup('not json')).toThrow('Not a valid JSON file')
    expect(() => parseSettingsBackup('{"kind":"something-else"}')).toThrow('Not a Nora settings file')
    expect(() => parseSettingsBackup(JSON.stringify({ kind: SETTINGS_BACKUP_KIND }))).toThrow(
      'Unsupported Nora settings file version',
    )
    expect(() => parseSettingsBackup(JSON.stringify({ kind: SETTINGS_BACKUP_KIND, version: 2, settings: {} }))).toThrow(
      'created by a newer version',
    )
    expect(() => parseSettingsBackup(backupOf({}))).toThrow('Nothing to import')
  })

  it('fills defaults for settings missing from the file', () => {
    const parsed = parseSettingsBackup(backupOf({ settings: { headerPosition: 'bottom' } }))

    expect(parsed.settings?.headerPosition).toBe('bottom')
    expect(parsed.settings?.defaultZoom).toBe(100)
    expect(parsed.settings?.allowHttpWebsite).toBe(true)
    expect(parsed.settings?.selectedSearchProviderId).toBe('url')
    expect(parsed.settings?.profiles.some((profile) => profile.id === 'default')).toBe(true)
  })

  it('drops malformed bookmarks and keeps the rest', () => {
    const parsed = parseSettingsBackup(
      backupOf({ bookmarks: [{ title: 'no url' }, null, { url: 'https://example.org', title: 'Example' }] }),
    )

    expect(parsed.bookmarks).toEqual([{ url: 'https://example.org', title: 'Example', icon: undefined }])
  })

  it('counts enabled custom scripts so the import can warn about them', () => {
    const parsed = parseSettingsBackup(
      backupOf({
        userStyles: {
          customScripts: [
            { id: 'a', name: 'A', enabled: true, hostGlobs: ['example.com'], js: 'console.log(1)' },
            { id: 'b', name: 'B', enabled: false, hostGlobs: ['example.com'], js: 'console.log(2)' },
          ],
        },
      }),
    )

    expect(countEnabledCustomScripts(parsed)).toBe(1)
  })

  it('applies only the sections present in the file', () => {
    settings$.headerPosition.set('top')
    blocklist$.enabled.set(true)
    bookmarks$.bookmarks.set([])

    const restored = applySettingsBackup(
      parseSettingsBackup(backupOf({ settings: { headerPosition: 'bottom' }, blocklist: { enabled: false } })),
    )

    expect(restored).toEqual(['settings', 'blocklist'])
    expect(settings$.headerPosition.get()).toBe('bottom')
    expect(blocklist$.enabled.get()).toBe(false)
    expect(bookmarks$.bookmarks.get()).toEqual([])
  })
})
