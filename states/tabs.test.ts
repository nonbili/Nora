import { afterAll, beforeAll, describe, expect, it, jest } from 'bun:test'
import { restoreTabsState, tabs$ } from './tabs'

// bun shares one module registry across test files, so this module may already have
// hydrated (and been mutated) by the time this file runs. Drive the cold-start restore
// explicitly instead of relying on import-time hydration from a seeded MMKV payload.
const dormancy = () => tabs$.tabs.get().map((tab) => Boolean(tab.isDormant))

beforeAll(() => {
  jest.useFakeTimers()
  // The restore arms the dormant-wake fallback timer, so fake timers go in first.
  const restored = restoreTabsState({
    tabs: [
      { id: 'tab-a', url: 'https://a.test' },
      { id: 'tab-b', url: 'https://b.test', isDormant: true, isLoading: true },
      { id: 'tab-c', url: 'https://c.test' },
    ],
    activeTabIndex: 1,
    orders: { 'tab-a': 0, 'tab-b': 1, 'tab-c': 2 },
    recentlyClosedTabs: [],
  })
  tabs$.tabs.set(restored.tabs)
  tabs$.orders.set(restored.orders)
  tabs$.recentlyClosedTabs.set(restored.recentlyClosedTabs)
  tabs$.activeTabIndex.set(restored.activeTabIndex)
})

afterAll(() => {
  jest.useRealTimers()
})

describe('cold-start restore', () => {
  // Ordered: the fallback timer can only fire once, so the tests that depend on it
  // still being armed run before the one that advances it.
  it('mounts only the active tab and holds the restored siblings back', () => {
    expect(tabs$.activeTabIndex.get()).toBe(1)
    expect(dormancy()).toEqual([true, false, true])
  })

  it('does not resurrect a stale persisted flag on the active tab', () => {
    expect(tabs$.tabs[1].isDormant.get()).toBe(false)
    expect(tabs$.tabs[1].isLoading.get()).toBe(false)
  })

  it('wakes a tab the user switches to, and only that tab', () => {
    tabs$.setActiveTabById('tab-c')

    expect(dormancy()).toEqual([true, false, false])
  })

  it('wakes the tabs still held back when the active tab never finishes loading', () => {
    jest.advanceTimersByTime(11000)

    expect(dormancy()).toEqual([false, false, false])
  })

  it('wakes every dormant tab once the active tab reports a finished load', () => {
    // What NoraTab's setTabLoading(false) does on the active tab.
    tabs$.tabs[0].isDormant.set(true)
    tabs$.tabs[2].isDormant.set(true)

    tabs$.wakeDormantTabs()

    expect(dormancy()).toEqual([false, false, false])
  })

  it('keeps a woken tab loaded across a navigation and a pause round trip', () => {
    tabs$.tabs[0].isDormant.set(true)
    tabs$.updateTabUrl('https://moved.test', 0)
    expect(tabs$.tabs[0].isDormant.get()).toBe(false)

    tabs$.tabs[0].isDormant.set(true)
    tabs$.setTabPaused(true, 0)
    tabs$.setTabPaused(false, 0)
    expect(tabs$.tabs[0].isDormant.get()).toBe(false)
  })
})
