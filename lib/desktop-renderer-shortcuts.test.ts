import { describe, expect, mock, test } from 'bun:test'
import { tabs$ } from '@/states/tabs'
import { tabGroups$ } from '@/states/tab-groups'
import { handleShortcuts } from '../desktop/src/renderer/lib/shortcuts'

describe('renderer tab shortcuts', () => {
  test('ignores AltGr in DOM and forwarded input', () => {
    const preventDefault = mock(() => {})
    for (const key of ['t', 'w', '1']) {
      handleShortcuts({ key, ctrlKey: true, altKey: true, preventDefault })
      handleShortcuts({ key, control: true, alt: true, preventDefault })
    }
    expect(preventDefault).not.toHaveBeenCalled()
  })

  test('closes the originating tab rather than the active tab', () => {
    const previousTabs = tabs$.tabs.get()
    const previousIndex = tabs$.activeTabIndex.get()
    const previousHistory = tabs$.recentlyClosedTabs.get()
    const previousOrders = tabs$.orders.get()
    try {
      tabs$.tabs.set([{ id: 'active', url: '' }, { id: 'focused', url: '' }])
      tabs$.activeTabIndex.set(0)
      handleShortcuts({ key: 'w', control: true, sourceTabId: 'focused' })
      expect(tabs$.tabs.get().map((tab) => tab.id)).toEqual(['active'])
      handleShortcuts({ key: 'w', control: true, sourceTabId: 'removed' })
      expect(tabs$.tabs.get().map((tab) => tab.id)).toEqual(['active'])
      handleShortcuts({ key: 'w', ctrlKey: true })
      expect(tabs$.tabs.get()).toEqual([])
    } finally {
      tabs$.tabs.set(previousTabs)
      tabs$.activeTabIndex.set(previousIndex)
      tabs$.recentlyClosedTabs.set(previousHistory)
      tabs$.orders.set(previousOrders)
    }
  })

  test('switches by number in sidebar order', () => {
    const previousTabs = tabs$.tabs.get()
    const previousIndex = tabs$.activeTabIndex.get()
    const previousOrders = tabs$.orders.get()
    const previousGroups = tabGroups$.groups.get()
    const previousSidebarOrder = tabGroups$.sidebarOrder.get()
    const previousActiveGroupId = tabGroups$.activeGroupId.get()
    try {
      tabs$.tabs.set([
        { id: 'a', url: '' },
        { id: 'b', url: '' },
        { id: 'c', url: '' },
        { id: 'd', url: '' },
      ])
      tabs$.orders.set({ a: 0, b: 1, c: 2, d: 3 })
      tabGroups$.groups.set([{ id: 'split', name: 'Split', layout: 'split-view', tabIds: ['d', null, 'b'] }])
      // The sidebar shows: c, [split: d, b], a
      tabGroups$.sidebarOrder.set(['tab:c', 'group:split', 'tab:a'])
      tabs$.activeTabIndex.set(0)

      const press = (key: string) => {
        handleShortcuts({ key, ctrlKey: true })
        return tabs$.currentTab()?.id
      }
      expect(press('1')).toBe('c')
      expect(press('2')).toBe('d')
      expect(tabGroups$.activeGroupId.get()).toBe('split')
      expect(press('3')).toBe('b')
      expect(press('4')).toBe('a')
      expect(tabGroups$.activeGroupId.get()).toBeNull()
      expect(press('1')).toBe('c')
      expect(press('5')).toBe('c')
      expect(press('9')).toBe('a')
    } finally {
      tabs$.tabs.set(previousTabs)
      tabs$.activeTabIndex.set(previousIndex)
      tabs$.orders.set(previousOrders)
      tabGroups$.groups.set(previousGroups)
      tabGroups$.sidebarOrder.set(previousSidebarOrder)
      tabGroups$.activeGroupId.set(previousActiveGroupId)
    }
  })
})
