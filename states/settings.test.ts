import { beforeEach, describe, expect, it } from 'bun:test'
import { getSettingsSnapshot, normalizeSettings, settings$ } from './settings'

beforeEach(() => {
  settings$.profiles.set([{ id: 'default', name: 'Default', color: '#6366f1', isDefault: true }])
  settings$.anonymousMode.set(false)
  settings$.anonymousDisabledHosts.set([])
})

describe('Anonymous profile', () => {
  it('is not there until something asks for it', () => {
    expect(settings$.profiles.get().map((profile) => profile.id)).toEqual(['default'])
  })

  it('is created once, however often it is asked for', () => {
    expect(settings$.ensureAnonymousProfile()).toBe('anonymous')
    expect(settings$.ensureAnonymousProfile()).toBe('anonymous')
    expect(settings$.profiles.get().filter((profile) => profile.id === 'anonymous')).toHaveLength(1)
  })

  it('is created by turning the mode on, and not by turning it off', () => {
    settings$.setAnonymousMode(false)
    expect(settings$.profiles.get().some((profile) => profile.id === 'anonymous')).toBe(false)

    settings$.setAnonymousMode(true)
    expect(settings$.anonymousMode.get()).toBe(true)
    expect(settings$.profiles.get().some((profile) => profile.id === 'anonymous')).toBe(true)

    settings$.setAnonymousMode(false)
    expect(settings$.anonymousMode.get()).toBe(false)
  })
})

describe('deleting the Anonymous profile', () => {
  it('turns the mode off with it', () => {
    settings$.setAnonymousMode(true)
    settings$.deleteProfile('anonymous')
    expect(settings$.anonymousMode.get()).toBe(false)
    expect(settings$.profiles.get().some((profile) => profile.id === 'anonymous')).toBe(false)
  })
})

describe('anonymous mode per-site switch', () => {
  it('turns the mode off for a site and back on, covering subdomains', () => {
    settings$.setAnonymousHostDisabled('www.reddit.com', true)
    expect(settings$.anonymousDisabledHosts.get()).toEqual(['reddit.com'])

    settings$.setAnonymousHostDisabled('old.reddit.com', false)
    expect(settings$.anonymousDisabledHosts.get()).toEqual([])
  })
})

describe('Anonymous profile and the mode', () => {
  it('is added to a backup that has the mode on and no such profile', () => {
    const snapshot = getSettingsSnapshot({ anonymousMode: true, profiles: [{ id: 'default', name: 'Default', color: '#6366f1', isDefault: true }] })
    expect(snapshot.profiles.map((profile) => profile.id)).toEqual(['default', 'anonymous'])
  })

  it('is not added when the mode is off, or twice', () => {
    expect(getSettingsSnapshot({ anonymousMode: false }).profiles.some((profile) => profile.id === 'anonymous')).toBe(false)
    const once = getSettingsSnapshot({ anonymousMode: true })
    expect(getSettingsSnapshot(once).profiles.filter((profile) => profile.id === 'anonymous')).toHaveLength(1)
  })

  it('is added when settings are loaded with the mode on and no such profile', () => {
    const loaded = normalizeSettings({ anonymousMode: true, profiles: [{ id: 'default', name: 'Default', color: '#000', isDefault: true }] } as any)
    expect(loaded!.profiles!.some((profile: { id: string }) => profile.id === 'anonymous')).toBe(true)
  })
})
