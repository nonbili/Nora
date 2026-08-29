import { beforeAll, describe, expect, it } from 'bun:test'
import { restoreTabsState, tabs$ } from './tabs'

// bun shares one module registry across test files, so this module may already have
// hydrated (and been mutated) by the time this file runs. Drive the cold-start restore
// explicitly instead of relying on import-time hydration from a seeded MMKV payload.
const dormancy = () => tabs$.tabs.get().map((tab) => Boolean(tab.isDormant))

beforeAll(() => {
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

describe('cold-start restore', () => {
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

  it('keeps the tabs the user never visits held back', () => {
    // Nothing wakes a dormant tab on a timer any more: it loads when it is shown.
    expect(dormancy()).toEqual([true, false, false])
  })

  it('wakes a tab a layout puts on screen without activating it', () => {
    // What NoraTab does when a dormant tab mounts visible in a deck or split view.
    tabs$.wakeTab('tab-a')

    expect(dormancy()).toEqual([false, false, false])
  })

  it('ignores a wake for a tab that is gone', () => {
    expect(() => tabs$.wakeTab('tab-missing')).not.toThrow()
  })

  it('wakes a tab that navigates', () => {
    tabs$.tabs[0].isDormant.set(true)
    tabs$.updateTabUrl('https://moved.test', 0)
    expect(tabs$.tabs[0].isDormant.get()).toBe(false)
  })

  it('keeps a tab that was never loaded dormant across a pause round trip', () => {
    // Pausing a restored tab must not be the thing that finally loads it: it stays
    // unloaded either way, and NoraTab wakes it when the resumed tab is on screen.
    tabs$.tabs[0].isDormant.set(true)
    tabs$.setTabPaused(true, 0)
    expect(tabs$.tabs[0].isDormant.get()).toBe(true)

    tabs$.setTabPaused(false, 0)
    expect(tabs$.tabs[0].isDormant.get()).toBe(true)
    tabs$.tabs[0].isDormant.set(false)
  })
})
