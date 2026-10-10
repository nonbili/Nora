import { describe, expect, it } from 'bun:test'
import { ANONYMOUS_PROFILE_ID, buildAnonymousModeScript, isAnonymousModeActive, isAnonymousProfile } from './anonymous'

describe('isAnonymousProfile', () => {
  it('matches only the reserved profile id', () => {
    expect(isAnonymousProfile(ANONYMOUS_PROFILE_ID)).toBe(true)
    expect(isAnonymousProfile('default')).toBe(false)
    expect(isAnonymousProfile('site:anonymous')).toBe(false)
    expect(isAnonymousProfile('Anonymous')).toBe(false)
    expect(isAnonymousProfile(undefined)).toBe(false)
    expect(isAnonymousProfile(null)).toBe(false)
  })
})

describe('isAnonymousModeActive', () => {
  const base = { enabled: true, profileId: ANONYMOUS_PROFILE_ID, host: 'www.reddit.com', disabledHosts: [] as string[] }

  it('applies to the Anonymous profile when the mode is on', () => {
    expect(isAnonymousModeActive(base)).toBe(true)
  })

  it('leaves every other profile alone', () => {
    expect(isAnonymousModeActive({ ...base, profileId: 'default' })).toBe(false)
    expect(isAnonymousModeActive({ ...base, profileId: undefined })).toBe(false)
    expect(isAnonymousModeActive({ ...base, profileId: 'site:reddit.com' })).toBe(false)
  })

  it('does nothing while the mode is off', () => {
    expect(isAnonymousModeActive({ ...base, enabled: false })).toBe(false)
  })

  it('is off for a site the user turned it off for, and its subdomains', () => {
    expect(isAnonymousModeActive({ ...base, disabledHosts: ['reddit.com'] })).toBe(false)
    expect(isAnonymousModeActive({ ...base, host: 'old.reddit.com', disabledHosts: ['reddit.com'] })).toBe(false)
    expect(isAnonymousModeActive({ ...base, disabledHosts: ['x.com'] })).toBe(true)
  })
})

describe('buildAnonymousModeScript', () => {
  it('is empty unless the tab is in the Anonymous profile with the mode on', () => {
    expect(buildAnonymousModeScript({ enabled: false, profileId: ANONYMOUS_PROFILE_ID, disabledHosts: [] })).toBe('')
    expect(buildAnonymousModeScript({ enabled: true, profileId: 'default', disabledHosts: ['x.com'] })).toBe('')
  })

  it('hands over the disabled hosts as a script that cannot throw', () => {
    const script = buildAnonymousModeScript({ enabled: true, profileId: ANONYMOUS_PROFILE_ID, disabledHosts: ['x.com'] })
    expect(script).toBe('try{window.__noraAnonymousDisabledHosts=["x.com"]}catch(e){}')
    const target: { __noraAnonymousDisabledHosts?: string[] } = {}
    new Function('window', script)(target)
    expect(target.__noraAnonymousDisabledHosts).toEqual(['x.com'])
  })
})
