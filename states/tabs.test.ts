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

it('opens a child in its supplied profile even with one tab per site enabled', async () => {
  const { settings$ } = await import('./settings')
  const { ui$ } = await import('./ui')
  const previousTabs = tabs$.tabs.get()
  const previousIndex = tabs$.activeTabIndex.get()
  const previousOneTab = settings$.oneTabPerSite.get()
  const previousOneProfile = settings$.oneProfilePerSite.get()
  const previousProfile = ui$.lastSelectedProfileId.get()
  try {
    settings$.oneTabPerSite.set(true)
    settings$.oneProfilePerSite.set(false)
    ui$.lastSelectedProfileId.set('other')
    tabs$.tabs.set([
      { id: 'source', url: 'https://source.test', profile: 'work' },
      { id: 'other', url: 'https://target.test', profile: 'other' },
    ])
    tabs$.activeTabIndex.set(1)
    const id = tabs$.openTab('https://target.test/image-link', {
      parentTabId: 'source', profile: 'work', source: 'child',
    })
    expect(id).not.toBe('other')
    expect(tabs$.tabs.get().find((tab) => tab.id === id)?.profile).toBe('work')
    expect(tabs$.tabs.get().find((tab) => tab.id === 'other')?.url).toBe('https://target.test')
  } finally {
    tabs$.tabs.set(previousTabs)
    tabs$.activeTabIndex.set(previousIndex)
    settings$.oneTabPerSite.set(previousOneTab)
    settings$.oneProfilePerSite.set(previousOneProfile)
    ui$.lastSelectedProfileId.set(previousProfile)
  }
})

it('does not reuse a tab of the Anonymous profile for a link from a tab of another profile', async () => {
  const { settings$ } = await import('./settings')
  const previousTabs = tabs$.tabs.get()
  const previousIndex = tabs$.activeTabIndex.get()
  const previousOneTab = settings$.oneTabPerSite.get()
  try {
    settings$.oneTabPerSite.set(true)
    tabs$.tabs.set([
      { id: 'source', url: 'https://source.test', profile: 'default' },
      { id: 'anon', url: 'https://target.test', profile: 'anonymous' },
    ])
    tabs$.activeTabIndex.set(0)
    const id = tabs$.openTab('https://target.test/post', { parentTabId: 'source', source: 'child' })
    expect(id).not.toBe('anon')
    expect(tabs$.tabs.get().find((tab) => tab.id === 'anon')?.url).toBe('https://target.test')

    // A link that asks for the Anonymous profile does reuse it.
    const again = tabs$.openTab('https://target.test/other', { profile: 'anonymous', source: 'child' })
    expect(again).toBe('anon')
  } finally {
    tabs$.tabs.set(previousTabs)
    tabs$.activeTabIndex.set(previousIndex)
    settings$.oneTabPerSite.set(previousOneTab)
  }
})

it('opens a tab in the background without switching to it', () => {
  const previousTabs = tabs$.tabs.get()
  const previousIndex = tabs$.activeTabIndex.get()
  try {
    tabs$.tabs.set([{ id: 'front', url: 'https://front.test' }])
    tabs$.activeTabIndex.set(0)
    const id = tabs$.openTab('https://background.test', { background: true })
    expect(id).toBeTruthy()
    expect(tabs$.tabs.get()).toHaveLength(2)
    expect(tabs$.tabs.get()[tabs$.activeTabIndex.get()].id).toBe('front')
  } finally {
    tabs$.tabs.set(previousTabs)
    tabs$.activeTabIndex.set(previousIndex)
  }
})

it('closes a tab the app opened for its own work without offering it for reopening', () => {
  const previousTabs = tabs$.tabs.get()
  const previousIndex = tabs$.activeTabIndex.get()
  const previousClosed = tabs$.recentlyClosedTabs.get()
  try {
    tabs$.tabs.set([
      { id: 'front', url: 'https://front.test' },
      { id: 'work', url: 'https://work.test' },
      { id: 'other', url: 'https://other.test' },
    ])
    tabs$.activeTabIndex.set(0)
    tabs$.recentlyClosedTabs.set([])
    tabs$.closeTab(1, { forget: true })
    expect(tabs$.recentlyClosedTabs.get()).toEqual([])
    tabs$.closeTab(1)
    expect(tabs$.recentlyClosedTabs.get().map((tab) => tab.id)).toEqual(['other'])
  } finally {
    tabs$.tabs.set(previousTabs)
    tabs$.activeTabIndex.set(previousIndex)
    tabs$.recentlyClosedTabs.set(previousClosed)
  }
})
