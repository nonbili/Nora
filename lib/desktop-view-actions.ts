import { tabGroups$ } from '@/states/tab-groups'
import { openDesktopTab, tabs$ } from '@/states/tabs'

export const openTabForActiveDesktopView = () => {
  const activeGroupId = tabGroups$.activeGroupId.get()
  const activeGroup = activeGroupId ? tabGroups$.groups.get().find((group) => group.id === activeGroupId) : null
  if (activeGroup) {
    const tabId = openDesktopTab('')
    if (!tabId) {
      return
    }
    if (activeGroup.layout === 'split-view') {
      const emptySlotIndex = activeGroup.tabIds.findIndex((slotTabId) => !slotTabId)
      if (emptySlotIndex >= 0) {
        tabGroups$.assignGroupSlot(activeGroup.id, emptySlotIndex, tabId)
      } else {
        const newSlotIndex = activeGroup.tabIds.length
        tabGroups$.appendSplitGroupSlot(activeGroup.id)
        tabGroups$.assignGroupSlot(activeGroup.id, newSlotIndex, tabId)
      }
    } else {
      tabGroups$.moveTabToGroup(tabId, activeGroup.id)
    }
    tabs$.setActiveTabById(tabId, 'open')
    return
  }

  const tabId = openDesktopTab('')
  if (!tabId) {
    return
  }
  tabGroups$.setActiveGroup(null)
  tabs$.setActiveTabById(tabId, 'open')
}
