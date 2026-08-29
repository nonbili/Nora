import { describe, expect, it } from 'bun:test'
import {
  BLOCKLIST_BACKGROUND_REFRESH_MS,
  isBlocklistExcludedHost,
  shouldAutoRefresh,
  toBlocklistSiteKey,
  updateBlocklistExclusions,
} from './policy'
import type { BlocklistSnapshot } from './types'

function createSnapshot(overrides: Partial<BlocklistSnapshot> = {}): BlocklistSnapshot {
  return {
    enabled: true,
    phase: 'ready',
    hasSnapshot: true,
    revision: 1,
    schemaVersion: 1,
    lastUpdatedAt: 1_000,
    excludedHosts: [],
    sources: {
      easylist: {
        url: 'https://easylist.to/easylist/easylist.txt',
      },
      easyprivacy: {
        url: 'https://easylist.to/easylist/easyprivacy.txt',
      },
      braveFirstparty: {
        url: 'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty.txt',
      },
      braveFirstpartyRegional: {
        url: 'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty-regional.txt',
      },
    },
    ...overrides,
  }
}

describe('shouldAutoRefresh', () => {
  it('refreshes when the blocklist has never been downloaded', () => {
    expect(shouldAutoRefresh(createSnapshot({ hasSnapshot: false, lastUpdatedAt: undefined }), 1_000)).toBe(true)
  })

  it('refreshes when the blocklist is older than a week', () => {
    expect(shouldAutoRefresh(createSnapshot(), 1_000 + BLOCKLIST_BACKGROUND_REFRESH_MS)).toBe(true)
  })

  it('does not refresh when disabled, already fetching, or still fresh', () => {
    expect(shouldAutoRefresh(createSnapshot({ enabled: false }), 2_000)).toBe(false)
    expect(shouldAutoRefresh(createSnapshot({ phase: 'fetching' }), 2_000)).toBe(false)
    expect(shouldAutoRefresh(createSnapshot(), 2_000)).toBe(false)
  })
})

describe('per-site exceptions', () => {
  it('keys a site by its host without a www prefix', () => {
    expect(toBlocklistSiteKey('www.Example.com')).toBe('example.com')
    expect(toBlocklistSiteKey('news.example.com.')).toBe('news.example.com')
    expect(toBlocklistSiteKey('')).toBe('')
  })

  it('excludes the stored site and its subdomains only', () => {
    expect(isBlocklistExcludedHost('www.example.com', ['example.com'])).toBe(true)
    expect(isBlocklistExcludedHost('login.example.com', ['example.com'])).toBe(true)
    expect(isBlocklistExcludedHost('example.com', ['login.example.com'])).toBe(false)
    expect(isBlocklistExcludedHost('notexample.com', ['example.com'])).toBe(false)
    expect(isBlocklistExcludedHost('example.com', [])).toBe(false)
    expect(isBlocklistExcludedHost('', ['example.com'])).toBe(false)
  })
})

describe('updateBlocklistExclusions', () => {
  it('stores the site key when blocking is turned off', () => {
    expect(updateBlocklistExclusions([], 'www.example.com', true)).toEqual(['example.com'])
    expect(updateBlocklistExclusions(['other.com'], 'example.com', true)).toEqual(['other.com', 'example.com'])
    expect(updateBlocklistExclusions(['example.com'], 'example.com', true)).toEqual(['example.com'])
  })

  it('drops the ancestor exception when blocking is turned back on from a subdomain', () => {
    const excludedHosts = updateBlocklistExclusions([], 'www.example.com', true)
    expect(isBlocklistExcludedHost('login.example.com', excludedHosts)).toBe(true)

    const reEnabled = updateBlocklistExclusions(excludedHosts, 'login.example.com', false)
    expect(reEnabled).toEqual([])
    expect(isBlocklistExcludedHost('login.example.com', reEnabled)).toBe(false)
    expect(isBlocklistExcludedHost('www.example.com', reEnabled)).toBe(false)
  })

  it('drops subdomain exceptions when blocking is turned back on from the parent site', () => {
    expect(updateBlocklistExclusions(['login.example.com', 'other.com'], 'example.com', false)).toEqual(['other.com'])
  })

  it('leaves unrelated sites alone', () => {
    expect(updateBlocklistExclusions(['notexample.com'], 'example.com', false)).toEqual(['notexample.com'])
    expect(updateBlocklistExclusions(['example.com'], '', true)).toEqual(['example.com'])
  })
})
