import { batch, observable, type Observable } from '@legendapp/state'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { syncObservable } from '@legendapp/state/sync'
import {
  addTabToGroup,
  createTabGroupId,
  getDefaultGroupName,
  normalizeTabGroups,
  removeTabFromGroups,
  sanitizeGroupTabIds,
  type TabGroup,
  type TabGroupLayout,
} from '@/lib/tab-groups'

export type { TabGroup, TabGroupLayout } from '@/lib/tab-groups'

interface Store {
  activeGroupId: string | null
  groups: TabGroup[]

  createGroupFromTab: (tabId: string, name?: string) => string
  createGroup: (layout: TabGroupLayout, name?: string) => string
  renameGroup: (groupId: string, name: string) => void
  deleteGroup: (groupId: string) => void
  setActiveGroup: (groupId: string | null) => void
  setGroupLayout: (groupId: string, layout: TabGroupLayout) => void
  assignGroupSlot: (groupId: string, slotIndex: number, tabId: string | null) => void
  moveTabToGroup: (tabId: string, groupId: string | null, targetIndex?: number) => void
  appendSplitGroupSlot: (groupId: string) => void
  removeSplitGroupSlot: (groupId: string, slotIndex: number) => void
  reorderGroupSlots: (groupId: string, fromSlotIndex: number, toSlotIndex: number) => void
  cleanupClosedTabIds: (tabIds: string[]) => void
}

const findGroupIndex = (groupId: string) => tabGroups$.groups.get().findIndex((group) => group?.id === groupId)

// Legend-State mutates arrays in place, so push/splice/nested sets keep the same array
// reference and leave memoized consumers stale. Always replace the whole groups array.
const setGroups = (groups: TabGroup[]) => tabGroups$.groups.set(groups)

const updateGroup = (groupId: string, update: (group: TabGroup) => TabGroup) => {
  const groups = tabGroups$.groups.get()
  if (!groups.some((group) => group.id === groupId)) {
    return
  }
  setGroups(groups.map((group) => (group.id === groupId ? update(group) : group)))
}

export const createDesktopTabGroupFromTab = (tabId: string, name?: string) => {
  const groupId = createTabGroupId()
  const group: TabGroup = {
    id: groupId,
    name: name?.trim() || getDefaultGroupName(tabGroups$.groups.get().length + 1),
    layout: 'deck',
    tabIds: [tabId],
  }
  setGroups([...removeTabFromGroups(tabGroups$.groups.get(), tabId), group])
  tabGroups$.activeGroupId.set(groupId)
  return groupId
}

export const createDesktopTabGroup = (layout: TabGroupLayout, name?: string) => {
  const groupId = createTabGroupId()
  const group: TabGroup = {
    id: groupId,
    name: name?.trim() || getDefaultGroupName(tabGroups$.groups.get().length + 1),
    layout,
    tabIds: sanitizeGroupTabIds(layout, []),
  }
  setGroups([...tabGroups$.groups.get(), group])
  tabGroups$.activeGroupId.set(groupId)
  return groupId
}

export const tabGroups$: Observable<Store> = observable<Store>({
  activeGroupId: null,
  groups: [],

  createGroupFromTab: (tabId, name) => createDesktopTabGroupFromTab(tabId, name),
  createGroup: (layout, name) => createDesktopTabGroup(layout, name),

  renameGroup: (groupId, name) => {
    const nextName = name.trim()
    if (!nextName) {
      return
    }
    updateGroup(groupId, (group) => ({ ...group, name: nextName }))
  },

  deleteGroup: (groupId) => {
    const groups = tabGroups$.groups.get()
    if (!groups.some((group) => group.id === groupId)) {
      return
    }
    batch(() => {
      setGroups(groups.filter((group) => group.id !== groupId))
      if (tabGroups$.activeGroupId.get() === groupId) {
        tabGroups$.activeGroupId.set(null)
      }
    })
  },

  setActiveGroup: (groupId) => {
    if (groupId == null || findGroupIndex(groupId) !== -1) {
      tabGroups$.activeGroupId.set(groupId)
    }
  },

  setGroupLayout: (groupId, layout) => {
    updateGroup(groupId, (group) => ({
      ...group,
      layout,
      tabIds: sanitizeGroupTabIds(layout, group.tabIds),
    }))
  },

  assignGroupSlot: (groupId, slotIndex, tabId) => {
    const index = findGroupIndex(groupId)
    if (index === -1) {
      return
    }
    const group = tabGroups$.groups[index].get()
    if (slotIndex < 0 || slotIndex >= group.tabIds.length) {
      return
    }
    if (tabId) {
      const groupsWithoutTab = removeTabFromGroups(tabGroups$.groups.get(), tabId)
      const nextGroups = groupsWithoutTab.map((currentGroup) =>
        currentGroup.id === groupId
          ? {
              ...currentGroup,
              tabIds: currentGroup.tabIds.map((currentTabId, currentIndex) =>
                currentIndex === slotIndex ? tabId : currentTabId,
              ),
            }
          : currentGroup,
      )
      setGroups(nextGroups)
      return
    }

    updateGroup(groupId, (currentGroup) => ({
      ...currentGroup,
      tabIds:
        currentGroup.layout === 'grid-4'
          ? currentGroup.tabIds.map((currentTabId, currentIndex) => (currentIndex === slotIndex ? null : currentTabId))
          : currentGroup.tabIds.filter((_, currentIndex) => currentIndex !== slotIndex),
    }))
  },

  moveTabToGroup: (tabId, groupId, targetIndex) => {
    const currentGroups = tabGroups$.groups.get()
    const targetGroup = groupId ? currentGroups.find((group) => group.id === groupId) : null
    if (targetGroup) {
      const nextTargetGroup = addTabToGroup(targetGroup, tabId, targetIndex)
      if (nextTargetGroup === targetGroup && !targetGroup.tabIds.includes(tabId)) {
        return
      }
    }

    let nextGroups = removeTabFromGroups(currentGroups, tabId)
    if (groupId) {
      nextGroups = nextGroups.map((group) => (group.id === groupId ? addTabToGroup(group, tabId, targetIndex) : group))
    }
    batch(() => {
      setGroups(nextGroups)
      tabGroups$.activeGroupId.set(groupId)
    })
  },

  appendSplitGroupSlot: (groupId) => {
    updateGroup(groupId, (group) =>
      group.layout === 'split-view' ? { ...group, tabIds: [...group.tabIds, null] } : group,
    )
  },

  removeSplitGroupSlot: (groupId, slotIndex) => {
    updateGroup(groupId, (group) =>
      group.layout === 'split-view' && slotIndex >= 0 && slotIndex < group.tabIds.length
        ? { ...group, tabIds: group.tabIds.filter((_, currentIndex) => currentIndex !== slotIndex) }
        : group,
    )
  },

  reorderGroupSlots: (groupId, fromSlotIndex, toSlotIndex) => {
    updateGroup(groupId, (group) => {
      const slotCount = group.tabIds.length
      if (
        fromSlotIndex < 0 ||
        fromSlotIndex >= slotCount ||
        toSlotIndex < 0 ||
        toSlotIndex >= slotCount ||
        fromSlotIndex === toSlotIndex
      ) {
        return group
      }
      const nextTabIds = [...group.tabIds]
      const [moved] = nextTabIds.splice(fromSlotIndex, 1)
      nextTabIds.splice(toSlotIndex, 0, moved)
      return { ...group, tabIds: nextTabIds }
    })
  },

  cleanupClosedTabIds: (tabIds) => {
    if (!tabIds.length) {
      return
    }
    const closedTabIds = new Set(tabIds)
    setGroups(
      tabGroups$.groups.get().map((group) => ({
        ...group,
        tabIds:
          group.layout === 'grid-4'
            ? group.tabIds.map((tabId) => (tabId && closedTabIds.has(tabId) ? null : tabId))
            : group.tabIds.filter((tabId) => !tabId || !closedTabIds.has(tabId)),
      })),
    )
  },
})

syncObservable(tabGroups$, {
  persist: {
    name: 'desktop-tab-groups',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => normalizeTabGroups(data),
    },
  },
})
