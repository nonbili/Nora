import { batch } from '@legendapp/state'
import {
  getSidebarItems,
  getTabOrdersFromSidebarItems,
  groupItemKey,
  replaceSidebarKey,
  tabItemKey,
} from '@/lib/sidebar-order'
import { getGroupedTabIds } from '@/lib/tab-groups'
import { tabGroups$ } from '@/states/tab-groups'
import { getOrderedTabIds, openDesktopTab, tabs$ } from '@/states/tabs'

// Opens a tab in a specific view: a split view fills its first free slot and grows a new
// one when it is full, any other view just takes the tab, and a null group means the
// ungrouped section. Also the path for a URL dropped on a view.
export const openTabInDesktopGroup = (groupId: string | null, url = '') => {
  const group = groupId ? tabGroups$.groups.get().find((currentGroup) => currentGroup.id === groupId) : null
  const tabId = openDesktopTab(url)
  if (!tabId) {
    return undefined
  }

  tabGroups$.setActiveGroup(group?.id ?? null)
  if (group) {
    if (group.layout === 'split-view') {
      const emptySlotIndex = group.tabIds.findIndex((slotTabId) => !slotTabId)
      if (emptySlotIndex >= 0) {
        tabGroups$.assignGroupSlot(group.id, emptySlotIndex, tabId)
      } else {
        const newSlotIndex = group.tabIds.length
        tabGroups$.appendSplitGroupSlot(group.id)
        tabGroups$.assignGroupSlot(group.id, newSlotIndex, tabId)
      }
    } else {
      tabGroups$.moveTabToGroup(tabId, group.id)
    }
  }

  tabs$.setActiveTabById(tabId, 'open')
  return tabId
}

// A URL dropped on a tab -- on its page, on its header, or on its row in the sidebar --
// replaces what that tab is showing.
export const openUrlInDesktopTab = (tabId: string, url: string) => {
  const tabIndex = tabs$.tabs.get().findIndex((tab) => tab?.id === tabId)
  if (tabIndex === -1) {
    return
  }
  tabs$.setActiveTabById(tabId, 'user')
  tabs$.updateTabUrl(url, tabIndex)
}

export const openTabForActiveDesktopView = () => {
  openTabInDesktopGroup(tabGroups$.activeGroupId.get())
}

// Ungrouping leaves the group's tabs behind, and they should stay where the eye last saw
// them. The stored sidebar order only holds what has been reordered, so putting the tabs'
// keys in the group's place means materializing the list first -- otherwise a sidebar
// nobody has reordered stores just those keys, and they jump to the top.
export const ungroupDesktopGroup = (groupId: string) => {
  const groups = tabGroups$.groups.get()
  const group = groups.find((currentGroup) => currentGroup.id === groupId)
  if (!group) {
    return
  }

  const groupedTabIds = getGroupedTabIds(groups)
  const ungroupedTabIds = getOrderedTabIds(tabs$.tabs.get(), tabs$.orders.get()).filter(
    (tabId) => !groupedTabIds.has(tabId),
  )
  const items = getSidebarItems(ungroupedTabIds, groups.map((currentGroup) => currentGroup.id), tabGroups$.sidebarOrder.get())

  const freedTabIds = group.tabIds.filter((tabId): tabId is string => typeof tabId === 'string')
  const nextKeys = replaceSidebarKey(items.map((item) => item.key), groupItemKey(groupId), freedTabIds.map(tabItemKey))

  batch(() => {
    tabGroups$.setSidebarOrder(nextKeys)
    tabGroups$.deleteGroup(groupId)
    // The list is also the tab order, so the freed tabs have to move there too. Left
    // alone, `orders` still has them where the group was not, and the two disagree about
    // where a tab sits -- which is what the workspace, and a reopened tab, read.
    const nextGroups = tabGroups$.groups.get()
    const nextItems = getSidebarItems(
      [...ungroupedTabIds, ...freedTabIds],
      nextGroups.map((currentGroup) => currentGroup.id),
      nextKeys,
    )
    tabs$.orders.set(getTabOrdersFromSidebarItems(nextItems, nextGroups, tabs$.tabs.get().map((tab) => tab.id)))
  })
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
