import { describe, expect, it } from 'bun:test'
import { BLOCKLIST_BACKGROUND_REFRESH_MS, shouldAutoRefresh } from './policy'
import type { BlocklistSnapshot } from './types'

function createSnapshot(overrides: Partial<BlocklistSnapshot> = {}): BlocklistSnapshot {
  return {
    enabled: true,
    phase: 'ready',
    hasSnapshot: true,
    revision: 1,
    schemaVersion: 1,
    lastUpdatedAt: 1_000,
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
