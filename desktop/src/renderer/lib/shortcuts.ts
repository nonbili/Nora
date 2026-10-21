import { tabs$ } from '../../../../states/tabs'
import { getSidebarOrderedTabIds, openTabForActiveDesktopView } from '../../../../lib/desktop-view-actions'
import { openFindInPage } from '../../../../lib/find-in-page'
import { isFeedTabUrl } from '../../../../lib/feed-tab'

export function handleShortcuts(e: {
  metaKey?: boolean
  ctrlKey?: boolean
  meta?: boolean
  control?: boolean
  altKey?: boolean
  alt?: boolean
  sourceTabId?: string
  shiftKey?: boolean
  shift?: boolean
  key: string
  preventDefault?: () => void
}) {
  const isCmdOrCtrl = e.metaKey || e.ctrlKey || e.meta || e.control
  if (!isCmdOrCtrl || e.altKey || e.alt) return

  const key = e.key.toLowerCase()
  if (key === 't') {
    e.preventDefault?.()
    if (e.shiftKey || e.shift) {
      const history = tabs$.recentlyClosedTabs.get()
      if (history.length) {
        tabs$.reopenClosedTabBatch(history[0].id)
      }
    } else {
      openTabForActiveDesktopView()
    }
  } else if (key === 'w') {
    e.preventDefault?.()
    const index = e.sourceTabId === undefined
      ? tabs$.activeTabIndex.get()
      : tabs$.tabs.get().findIndex((tab) => tab.id === e.sourceTabId)
    if (index >= 0) tabs$.closeTab(index)
  } else if (key === 'f') {
    const tab = e.sourceTabId === undefined
      ? tabs$.tabs.get()[tabs$.activeTabIndex.get()]
      : tabs$.tabs.get().find((tab) => tab.id === e.sourceTabId)
    if (tab?.url && !isFeedTabUrl(tab.url)) {
      e.preventDefault?.()
      openFindInPage(tab.id)
    }
  } else if (key >= '1' && key <= '9') {
    // As in other browsers, 9 is the last tab however many there are.
    const tabIds = getSidebarOrderedTabIds()
    const tabId = key === '9' ? tabIds.at(-1) : tabIds[parseInt(key) - 1]
    if (tabId) {
      e.preventDefault?.()
      tabs$.setActiveTabById(tabId, 'user')
    }
  }
}
