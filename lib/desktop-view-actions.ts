import { batch } from '@legendapp/state'
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

export const closeDesktopGroupWithTabs = (groupId: string) => {
  const group = tabGroups$.groups.get().find((currentGroup) => currentGroup.id === groupId)
  if (!group) {
    return
  }
  const groupTabIds = group.tabIds.filter((tabId): tabId is string => typeof tabId === 'string')
  batch(() => {
    tabs$.closeTabsByIds(groupTabIds)
    tabGroups$.deleteGroup(groupId)
    // Closing may have activated a tab that lives in another group. deleteGroup clears
    // activeGroupId, so follow the active tab to its group or the workspace renders nothing.
    const tabs = tabs$.tabs.get()
    const activeTabId = tabs[tabs$.activeTabIndex.get()]?.id
    const nextGroup = activeTabId
      ? tabGroups$.groups.get().find((group) => group.tabIds.includes(activeTabId))
      : undefined
    tabGroups$.setActiveGroup(nextGroup?.id ?? null)
  })
}
