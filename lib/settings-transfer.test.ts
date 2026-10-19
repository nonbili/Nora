import { describe, expect, it } from 'bun:test'
import { blocklist$ } from '@/states/blocklist'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { userStyles$ } from '@/states/user-styles'
import { watch$ } from '@/states/watch'
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
    blocklist$.excludedHosts.set(['example.com'])

    const backup = JSON.parse(exportSettingsJson())
    expect(backup.kind).toBe(SETTINGS_BACKUP_KIND)
    expect(backup.settings.headerPosition).toBe('bottom')
    expect(backup.settings.defaultZoom).toBe(125)
    expect(backup.bookmarks).toEqual([{ url: 'https://example.com', title: 'Example', icon: '' }])
    expect(backup.blocklist).toEqual({ enabled: false, excludedHosts: ['example.com'] })
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

  it('keeps the anonymous mode off and the public search service default for a file without them', () => {
    const parsed = parseSettingsBackup(backupOf({ settings: { headerPosition: 'bottom' } }))

    expect(parsed.settings?.anonymousMode).toBe(false)
    expect(parsed.settings?.anonymousDisabledHosts).toEqual([])
    expect(parsed.settings?.selectedPublicSearchServiceId).toBe('reddit')
    expect(parsed.settings?.profiles.some((profile) => profile.id === 'anonymous')).toBe(false)
  })

  it('drops the setting for the list of more Instagram posts, which is gone, from an older file', () => {
    const parsed = parseSettingsBackup(backupOf({ settings: { anonymousMode: true, anonymousMorePosts: true } }))

    expect(parsed.settings?.anonymousMode).toBe(true)
    expect(parsed.settings).not.toHaveProperty('anonymousMorePosts')
  })

  it('cleans up the anonymous settings of a hand edited file', () => {
    const parsed = parseSettingsBackup(
      backupOf({
        settings: {
          anonymousMode: 'yes',
          anonymousDisabledHosts: ['WWW.Reddit.com', 'x.com', 'x.com', 42, ''],
          selectedPublicSearchServiceId: 'constructor',
        },
      }),
    )

    expect(parsed.settings?.anonymousMode).toBe(false)
    expect(parsed.settings?.anonymousDisabledHosts).toEqual(['reddit.com', 'x.com'])
    expect(parsed.settings?.selectedPublicSearchServiceId).toBe('reddit')
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
    blocklist$.excludedHosts.set([])
    bookmarks$.bookmarks.set([])

    const restored = applySettingsBackup(
      parseSettingsBackup(
        backupOf({
          settings: { headerPosition: 'bottom' },
          blocklist: { enabled: false, excludedHosts: ['www.Example.com', 'example.com', ''] },
        }),
      ),
    )

    expect(restored).toEqual(['settings', 'blocklist'])
    expect(settings$.headerPosition.get()).toBe('bottom')
    expect(blocklist$.enabled.get()).toBe(false)
    expect(blocklist$.excludedHosts.get()).toEqual(['example.com'])
    expect(bookmarks$.bookmarks.get()).toEqual([])
  })

  it('exports the feed sources and adds them back on import', () => {
    watch$.profiles.set([])
    watch$.timelines.set([])
    watch$.watch({ site: 'reddit', handle: 'r/rust' })
    watch$.createTimeline('News', ['reddit:r/rust'])

    const json = exportSettingsJson()
    expect(JSON.parse(json).watch.profiles).toEqual([{ site: 'reddit', handle: 'r/rust', notify: false }])

    watch$.profiles.set([])
    watch$.timelines.set([])
    watch$.watch({ site: 'x', handle: 'jack' })

    const restored = applySettingsBackup(parseSettingsBackup(json))
    expect(restored).toContain('feed sources')
    expect(watch$.profiles.get().map((profile) => profile.key)).toEqual(['x:jack', 'reddit:r/rust'])
    expect(watch$.timelines.get().map(({ name, profileKeys }) => ({ name, profileKeys }))).toEqual([
      { name: 'News', profileKeys: ['reddit:r/rust'] },
    ])
  })
})
