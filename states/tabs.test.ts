import { afterAll, describe, expect, it, jest } from 'bun:test'
import { clearPersistedState, seedPersistedState } from '../test/setup'

// The store hydrates from MMKV at import time, and arms the dormant-wake fallback timer
// while doing so, so both the persisted payload and the fake timers have to be in place
// before the module is pulled in.
seedPersistedState('tabs', {
  tabs: [
    { id: 'tab-a', url: 'https://a.test' },
    { id: 'tab-b', url: 'https://b.test' },
    { id: 'tab-c', url: 'https://c.test' },
  ],
  activeTabIndex: 1,
})
jest.useFakeTimers()

const { tabs$ } = await import('./tabs')

const dormancy = () => tabs$.tabs.get().map((tab) => Boolean(tab.isDormant))

afterAll(() => {
  jest.useRealTimers()
  clearPersistedState()
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
