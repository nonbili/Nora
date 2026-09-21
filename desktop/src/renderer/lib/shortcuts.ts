import { tabs$ } from '../../../../states/tabs'
import { openTabForActiveDesktopView } from '../../../../lib/desktop-view-actions'

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
  } else if (key >= '1' && key <= '9') {
    const targetIndex = parseInt(key) - 1
    const tabs = tabs$.tabs.get()
    if (targetIndex < tabs.length) {
      e.preventDefault?.()
      tabs$.setActiveTabIndex(targetIndex, 'user')
    }
  }
}
