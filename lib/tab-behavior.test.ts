import { describe, expect, it } from 'bun:test'
import {
  consumeChildBackTarget,
  getChildBackTarget,
  invalidateChildBackTargetOnUserSwitch,
  pruneChildBackParentByTabId,
  pruneRecentTabIds,
  resolveCloseTarget,
  shouldTabStartDormant,
  updateRecentTabIds,
} from './tab-behavior'

describe('updateRecentTabIds', () => {
  it('tracks the previous tab as most recent when the active tab changes', () => {
    expect(updateRecentTabIds(['tab-1'], 'tab-2', 'tab-3')).toEqual(['tab-2', 'tab-1'])
  })

  it('deduplicates the previous and next tab ids', () => {
    expect(updateRecentTabIds(['tab-2', 'tab-1'], 'tab-1', 'tab-2')).toEqual(['tab-1'])
  })
})

describe('resolveCloseTarget', () => {
  it('uses the MRU tab when closing the active tab', () => {
    expect(
      resolveCloseTarget({
        activeTabId: 'tab-5',
        closingTabId: 'tab-5',
        recentTabIds: ['tab-3', 'tab-2'],
        availableTabIds: ['tab-2', 'tab-3'],
        adjacentTabId: 'tab-2',
      }),
    ).toBe('tab-3')
  })

  it('keeps the current active tab when closing a background tab', () => {
    expect(
      resolveCloseTarget({
        activeTabId: 'tab-5',
        closingTabId: 'tab-2',
        recentTabIds: ['tab-3', 'tab-2'],
        availableTabIds: ['tab-3', 'tab-5'],
        adjacentTabId: 'tab-3',
      }),
    ).toBe('tab-5')
  })

  it('filters MRU candidates to visible tabs when preferred ids are provided', () => {
    expect(
      resolveCloseTarget({
        activeTabId: 'tab-5',
        closingTabId: 'tab-5',
        recentTabIds: ['tab-3', 'tab-2'],
        availableTabIds: ['tab-2', 'tab-3', 'tab-4'],
        preferredTabIds: ['tab-4', 'tab-2'],
        adjacentTabId: 'tab-4',
      }),
    ).toBe('tab-2')
  })
})

describe('child back fallback', () => {
  it('returns the opener tab at the child root when no back history exists', () => {
    expect(getChildBackTarget({ 'tab-5': 'tab-2' }, 'tab-5', false, ['tab-2', 'tab-5'])).toBe('tab-2')
  })

  it('does not return the opener when the tab can still go back', () => {
    expect(getChildBackTarget({ 'tab-5': 'tab-2' }, 'tab-5', true, ['tab-2', 'tab-5'])).toBeUndefined()
  })

  it('cancels the opener fallback after an explicit user tab switch', () => {
    expect(invalidateChildBackTargetOnUserSwitch({ 'tab-5': 'tab-2' }, 'tab-5', 'tab-3')).toEqual({})
  })

  it('consumes the opener fallback once it is used', () => {
    expect(consumeChildBackTarget({ 'tab-5': 'tab-2', 'tab-6': 'tab-4' }, 'tab-5')).toEqual({ 'tab-6': 'tab-4' })
  })

  it('prunes mappings whose child or parent tab no longer exists', () => {
    expect(pruneChildBackParentByTabId({ 'tab-5': 'tab-2', 'tab-6': 'tab-4' }, ['tab-2', 'tab-5'])).toEqual({
      'tab-5': 'tab-2',
    })
  })
})

describe('pruneRecentTabIds', () => {
  it('drops closed tabs from MRU history', () => {
    expect(pruneRecentTabIds(['tab-5', 'tab-3', 'tab-2'], ['tab-2', 'tab-5'])).toEqual(['tab-5', 'tab-2'])
  })
})

describe('shouldTabStartDormant', () => {
  const tabs = [{ url: 'https://a.test' }, { url: 'https://b.test' }, { url: 'https://c.test' }]

  it('loads the active tab and holds the rest back', () => {
    expect(tabs.map((_, index) => shouldTabStartDormant(tabs, 1, index))).toEqual([true, false, true])
  })

  it('holds nothing back when the active tab is blank', () => {
    const withBlankActive = [{ url: '' }, { url: 'https://b.test' }]
    expect(withBlankActive.map((_, index) => shouldTabStartDormant(withBlankActive, 0, index))).toEqual([false, false])
  })

  it('holds nothing back when the active tab is paused', () => {
    const withPausedActive = [{ url: 'https://a.test', isPaused: true }, { url: 'https://b.test' }]
    expect(withPausedActive.map((_, index) => shouldTabStartDormant(withPausedActive, 0, index))).toEqual([
      false,
      false,
    ])
  })

  it('leaves blank and paused background tabs alone', () => {
    const mixed = [{ url: 'https://a.test' }, { url: '' }, { url: 'https://c.test', isPaused: true }]
    expect(mixed.map((_, index) => shouldTabStartDormant(mixed, 0, index))).toEqual([false, false, false])
  })
})
