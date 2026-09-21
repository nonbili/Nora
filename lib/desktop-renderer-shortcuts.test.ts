import { describe, expect, mock, test } from 'bun:test'
import { tabs$ } from '@/states/tabs'
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
})
