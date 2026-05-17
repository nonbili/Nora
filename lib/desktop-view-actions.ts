import { savedViews$ } from '@/states/saved-views'
import { openDesktopTab, tabs$ } from '@/states/tabs'

export const openTabForActiveDesktopView = () => {
  const activeViewId = savedViews$.activeViewId.get()
  const activeView = savedViews$.savedViews.get().find((view) => view.id === activeViewId)

  if (activeView?.layout === 'split-view') {
    const tabId = openDesktopTab('')
    if (!tabId) {
      return
    }

    savedViews$.appendSplitViewSlot(activeView.id)
    savedViews$.assignSlotTab(activeView.id, activeView.slotTabIds.length, tabId)
    tabs$.setActiveTabById(tabId, 'open')
    return
  }

  const tabId = openDesktopTab('')
  if (!tabId) {
    return
  }

  tabs$.setActiveTabById(tabId, 'open')
}
