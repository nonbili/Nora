import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { ui$ } from './ui'
import { settings$ } from './settings'
import { DECK_VIEW_ID, savedViews$ } from './saved-views'
import { tabGroups$ } from './tab-groups'
import { sortBy } from 'es-toolkit'
import {
  consumeChildBackTarget,
  getChildBackTarget,
  invalidateChildBackTargetOnUserSwitch,
  pruneChildBackParentByTabId,
  pruneRecentTabIds,
  resolveCloseTarget,
  updateRecentTabIds,
  type ChildBackParentByTabId,
} from '@/lib/tab-behavior'
import { removeTrackingParams } from '@/lib/url'
import { autoProfiles$ } from './auto-profiles'
import {
  AUTO_PROFILE_ID,
  getSiteFromProfileId,
  getSiteProfileId,
  isSiteProfileId,
  type ProfileMode,
} from '@/lib/site-profile'

export interface Tab {
  id: string
  url: string
  title?: string
  icon?: string
  isLoading?: boolean
  isPaused?: boolean
  desktopMode?: boolean
  profile?: string
  profileMode?: ProfileMode
  backToNewTab?: boolean
}

export interface ClosedTab extends Tab {
  closedAt: number
  groupId?: string | null
  groupSlotIndex?: number
  precedingTabId?: string | null
}

interface Store {
  tabs: Tab[]
  activeTabIndex: number
  orders: Record<string, number>
  recentlyClosedTabs: ClosedTab[]

  currentTab: () => Tab | undefined
  // currentUrl: () => string

  openTab: (url: string, options?: OpenTabOptions) => string | undefined
  duplicateTab: (tabId: string) => string | undefined
  closeTab: (index: number) => void
  closeAll: () => void
  deleteProfileData: (profileId: string) => void
  reopenClosedTab: (tabId: string) => string | undefined
  updateTabUrl: (url: string, index?: number) => void
  setTabLoading: (loading: boolean, index?: number) => void
  setTabPaused: (paused: boolean, index?: number) => void
  setActiveTabIndex: (index: number, reason?: TabActivationReason) => void
  setActiveTabById: (tabId: string, reason?: TabActivationReason) => void
  handleBackPress: () => boolean
}

let lastOpenedUrl = ''
let recentTabIds: string[] = []
let childBackParentByTabId: ChildBackParentByTabId = {}
const MAX_RECENTLY_CLOSED_TABS = 10

const findGroupForTab = (tabId: string) => {
  const groups = tabGroups$.groups.get()
  for (const group of groups) {
    const slotIndex = group.tabIds.findIndex((currentTabId) => currentTabId === tabId)
    if (slotIndex !== -1) {
      return { groupId: group.id, groupSlotIndex: slotIndex }
    }
  }
  return undefined
}

const restoreTabOrder = (tabId: string, precedingTabId?: string | null) => {
  const orderedTabIds = getOrderedTabIds(tabs$.tabs.get(), tabs$.orders.get())
  const withoutTab = orderedTabIds.filter((id) => id !== tabId)
  // No preceding tab means it sat at the very front of the list.
  if (precedingTabId == null) {
    const nextOrder = [tabId, ...withoutTab]
    tabs$.orders.set(Object.fromEntries(nextOrder.map((id, index) => [id, index])))
    return
  }
  const precedingIndex = withoutTab.indexOf(precedingTabId)
  // Preceding tab is gone; leave the reopened tab at the end (default).
  if (precedingIndex === -1) {
    return
  }
  const insertIndex = precedingIndex + 1
  const nextOrder = [...withoutTab.slice(0, insertIndex), tabId, ...withoutTab.slice(insertIndex)]
  tabs$.orders.set(Object.fromEntries(nextOrder.map((id, index) => [id, index])))
}

const pushRecentlyClosedTabs = (closedTabs: Tab[]) => {
  const orderedTabIds = getOrderedTabIds(tabs$.tabs.get(), tabs$.orders.get())
  const nextClosedTabs = closedTabs
    .filter((tab): tab is Tab => tab != null && Boolean(tab.url))
    .map((tab) => {
      const groupInfo = findGroupForTab(tab.id)
      const orderIndex = orderedTabIds.indexOf(tab.id)
      const precedingTabId = orderIndex > 0 ? orderedTabIds[orderIndex - 1] : null
      return { ...tab, closedAt: Date.now(), ...groupInfo, precedingTabId }
    })

  if (!nextClosedTabs.length) {
    return
  }

  const history = tabs$.recentlyClosedTabs.get()
  const nextHistory = [...nextClosedTabs.reverse(), ...history]
  tabs$.recentlyClosedTabs.set(nextHistory.slice(0, MAX_RECENTLY_CLOSED_TABS))
}

export type OpenTabOptions = {
  parentTabId?: string
  profile?: string
  profileMode?: ProfileMode
  source?: 'manual' | 'child' | 'shared' | 'reuse'
}

export type TabActivationReason = 'user' | 'open' | 'close' | 'back' | 'system'

export const getOrderedTabIds = (tabs: Pick<Tab, 'id'>[], orders: Record<string, number>) => {
  const existingIds = new Set(tabs.map((tab) => tab.id))
  const orderedIds = sortBy(Object.entries(orders), [(entry) => entry[1]])
    .map(([tabId]) => tabId)
    .filter((tabId) => existingIds.has(tabId))

  for (const tab of tabs) {
    if (!(tab.id in orders)) {
      orderedIds.push(tab.id)
    }
  }

  return orderedIds
}

export const sortTabsByOrder = <T extends Pick<Tab, 'id'>>(tabs: T[], orders: Record<string, number>) => {
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]))
  return getOrderedTabIds(tabs, orders)
    .map((tabId) => tabById.get(tabId))
    .filter((tab): tab is T => tab != null)
}

const getActiveTabId = () => {
  const index = tabs$.activeTabIndex.get()
  return tabs$.tabs[index]?.id.get()
}

const syncRuntimeTabMetadata = () => {
  const existingTabIds = tabs$.tabs.get().map((tab) => tab.id)
  recentTabIds = pruneRecentTabIds(recentTabIds, existingTabIds)
  childBackParentByTabId = pruneChildBackParentByTabId(childBackParentByTabId, existingTabIds)
}

const getClosePreferredTabIds = (availableTabIds: string[]) => {
  const activeViewId = savedViews$.activeViewId.get()
  if (activeViewId === DECK_VIEW_ID) {
    return undefined
  }

  const activeView = savedViews$.savedViews.get().find((view) => view.id === activeViewId)
  if (!activeView) {
    return undefined
  }

  const availableTabIdSet = new Set(availableTabIds)
  return activeView.slotTabIds.filter((tabId): tabId is string => typeof tabId === 'string' && availableTabIdSet.has(tabId))
}

const recordAutoProfile = (profileId?: string) => {
  const site = getSiteFromProfileId(profileId)
  if (site) {
    autoProfiles$.recordProfile(profileId!, site)
  }
}

const resolveOpenProfile = (url: string, options?: OpenTabOptions): Pick<Tab, 'profile' | 'profileMode'> => {
  const oneProfilePerSite = settings$.oneProfilePerSite.get()
  const tabs = tabs$.tabs.get()
  const parentTab = options?.parentTabId ? tabs.find((tab) => tab.id === options.parentTabId) : undefined
  const requestedAuto = options?.profile === AUTO_PROFILE_ID || options?.profileMode === 'auto'
  const requestedProfile = requestedAuto ? undefined : options?.profile
  const fallbackProfile = requestedProfile || ui$.lastSelectedProfileId.get() || 'default'

  if (!oneProfilePerSite) {
    return { profile: fallbackProfile, profileMode: 'manual' }
  }

  if (options?.source === 'child' && parentTab?.profile) {
    recordAutoProfile(parentTab.profile)
    return {
      profile: parentTab.profile,
      profileMode: parentTab.profileMode || (isSiteProfileId(parentTab.profile) ? 'auto' : 'manual'),
    }
  }

  const profileMode: ProfileMode = requestedProfile && !requestedAuto ? 'manual' : 'auto'
  if (profileMode === 'auto') {
    const siteProfile = getSiteProfileId(url)
    if (siteProfile) {
      recordAutoProfile(siteProfile)
      return { profile: siteProfile, profileMode: 'auto' }
    }
    return { profile: fallbackProfile, profileMode: 'auto' }
  }

  return { profile: fallbackProfile, profileMode: 'manual' }
}

const shouldResolveTabUrlAsAutoProfile = (tab: Tab) => {
  if (!settings$.oneProfilePerSite.get()) {
    return false
  }
  if (tab.profileMode === 'manual') {
    return false
  }
  if (tab.profileMode === 'auto' || isSiteProfileId(tab.profile)) {
    return true
  }
  return !tab.profile || tab.profile === 'default'
}

const setActiveTabIndexInternal = (index: number, reason: TabActivationReason = 'user') => {
  const tabs = tabs$.tabs.get()
  if (index < 0 || index >= tabs.length) {
    return
  }

  const activeIndex = tabs$.activeTabIndex.get()
  const previousTabId = tabs[activeIndex]?.id
  const nextTabId = tabs[index]?.id
  if (!nextTabId) {
    return
  }

  if (reason === 'user') {
    childBackParentByTabId = invalidateChildBackTargetOnUserSwitch(childBackParentByTabId, previousTabId, nextTabId)
  }

  const shouldTrackRecentTabs = reason === 'user' || reason === 'open' || reason === 'back'
  if (previousTabId !== nextTabId) {
    if (shouldTrackRecentTabs) {
      recentTabIds = updateRecentTabIds(recentTabIds, previousTabId, nextTabId)
    }
    ui$.activeCanGoBack.set(false)
  }

  tabs$.activeTabIndex.set(index)
}

export const openDesktopTab = (url: string, options?: OpenTabOptions) =>
  tabs$.openTab(url, options) as string | undefined

export const tabs$: Observable<Store> = observable<Store>({
  tabs: [],
  activeTabIndex: 0,
  orders: {},
  recentlyClosedTabs: [],

  currentTab: (): Tab | undefined => {
    const index = tabs$.activeTabIndex.get()
    if (index < 0 || index >= tabs$.tabs.length) return undefined
    return tabs$.tabs[index].get()
  },
  // currentUrl: (): string => tabs$.tabs[tabs$.activeTabIndex.get()].get()?.url,

  openTab: (url, options): string | undefined => {
    const cleaned = removeTrackingParams(url.replace('nora://', 'https://'))
    if (cleaned && cleaned === lastOpenedUrl) {
      return undefined
    }
    lastOpenedUrl = cleaned
    setTimeout(() => {
      lastOpenedUrl = ''
    }, 1000)

    if (settings$.oneTabPerSite.get()) {
      try {
        const newUrl = new URL(url)
        if (newUrl.hostname) {
          const tabs = tabs$.tabs.get()
          const existingTabIndex = tabs.findIndex((t) => {
            try {
              const tabUrl = new URL(t.url)
              return tabUrl.hostname === newUrl.hostname
            } catch {
              return false
            }
          })

          if (existingTabIndex !== -1) {
            tabs$.setActiveTabIndex(existingTabIndex, 'open')
            const existingTab = tabs[existingTabIndex]
            if (existingTab && options?.source === 'child' && options.parentTabId && options.parentTabId !== existingTab.id) {
              childBackParentByTabId[existingTab.id] = options.parentTabId
            }
            if (existingTab && shouldResolveTabUrlAsAutoProfile(existingTab)) {
              const siteProfile = getSiteProfileId(url)
              if (siteProfile) {
                recordAutoProfile(siteProfile)
                tabs$.tabs[existingTabIndex].profile.set(siteProfile)
                tabs$.tabs[existingTabIndex].profileMode.set('auto')
              }
            }
            tabs$.tabs[existingTabIndex].url.set(url)
            tabs$.tabs[existingTabIndex].isLoading.set(Boolean(url))
            return tabs$.tabs[existingTabIndex].id.get()
          }
        }
      } catch {
        // ignore
      }
    }

    const profile = resolveOpenProfile(cleaned || url, options)
    const tab: Tab = {
      id: genId(),
      url,
      isLoading: Boolean(url),
      ...profile,
      backToNewTab: !url,
    }
    tabs$.tabs.push(tab)
    if (options?.source === 'child' && options.parentTabId && options.parentTabId !== tab.id) {
      childBackParentByTabId[tab.id] = options.parentTabId
    }
    tabs$.setActiveTabIndex(tabs$.tabs.length - 1, 'open')
    return tab.id
  },

  closeTab: (index) => {
    const tabs = tabs$.tabs.get()
    const closedTab = tabs[index]
    const tabId = closedTab?.id
    if (!tabId) {
      return
    }

    const activeIndex = tabs$.activeTabIndex.get()
    const activeTabId = tabs[activeIndex]?.id
    const remainingTabIds = tabs.filter((_, tabIndex) => tabIndex !== index).map((tab) => tab.id)
    const adjacentTabId = tabs[index + 1]?.id || tabs[index - 1]?.id
    const preferredTabIds = getClosePreferredTabIds(remainingTabIds)
    const nextActiveTabId = resolveCloseTarget({
      activeTabId,
      closingTabId: tabId,
      recentTabIds,
      availableTabIds: remainingTabIds,
      preferredTabIds,
      adjacentTabId,
    })

    pushRecentlyClosedTabs(closedTab ? [closedTab] : [])
    tabs$.tabs.splice(index, 1)
    if (tabId in tabs$.orders.get()) {
      tabs$.orders[tabId].delete()
    }
    savedViews$.cleanupClosedTabIds([tabId])
    tabGroups$.cleanupClosedTabIds([tabId])
    syncRuntimeTabMetadata()

    const remainingTabs = tabs$.tabs.get()
    if (!remainingTabs.length) {
      tabs$.activeTabIndex.set(0)
      ui$.activeCanGoBack.set(false)
      return
    }

    if (activeTabId && nextActiveTabId === activeTabId) {
      const nextIndex = remainingTabs.findIndex((tab) => tab.id === activeTabId)
      if (nextIndex !== -1) {
        tabs$.activeTabIndex.set(nextIndex)
        return
      }
    }

    tabs$.setActiveTabById(nextActiveTabId || remainingTabs[0].id, 'close')
  },

  closeAll: () => {
    const closedTabs = tabs$.tabs.get()
    const closedTabIds = closedTabs.map((tab) => tab.id)
    pushRecentlyClosedTabs(closedTabs)
    tabs$.assign({ tabs: [{ id: genId(), url: '' }], activeTabIndex: 0 })
    recentTabIds = []
    childBackParentByTabId = {}
    ui$.activeCanGoBack.set(false)
    savedViews$.cleanupClosedTabIds(closedTabIds)
    tabGroups$.cleanupClosedTabIds(closedTabIds)
  },

  deleteProfileData: (profileId) => {
    if (!profileId) {
      return
    }

    const matchesProfile = (tabProfile: string | undefined) =>
      profileId === 'default' ? !tabProfile || tabProfile === 'default' : tabProfile === profileId

    const tabs = tabs$.tabs.get()
    const activeTabId = tabs[tabs$.activeTabIndex.get()]?.id
    const removedTabs = tabs.filter((tab) => matchesProfile(tab?.profile))
    const removedTabIds = removedTabs.map((tab) => tab.id)
    const nextRecentlyClosedTabs = tabs$.recentlyClosedTabs.get().filter((tab) => !matchesProfile(tab?.profile))

    if (!removedTabIds.length && nextRecentlyClosedTabs.length === tabs$.recentlyClosedTabs.get().length) {
      return
    }

    if (removedTabIds.length) {
      const removedTabIdSet = new Set(removedTabIds)
      const remainingTabs = tabs.filter((tab) => !matchesProfile(tab?.profile))
      const nextOrders = Object.fromEntries(Object.entries(tabs$.orders.get()).filter(([tabId]) => !removedTabIdSet.has(tabId)))

      tabs$.orders.set(nextOrders)
      tabs$.tabs.set(remainingTabs.length ? remainingTabs : [{ id: genId(), url: '' }])
      savedViews$.cleanupClosedTabIds(removedTabIds)
      tabGroups$.cleanupClosedTabIds(removedTabIds)
      syncRuntimeTabMetadata()

      const activeDeleted = activeTabId != null && removedTabIdSet.has(activeTabId)
      const nextTabs = tabs$.tabs.get()
      const nextActiveIndex = activeDeleted ? 0 : Math.max(0, nextTabs.findIndex((tab) => tab.id === activeTabId))
      tabs$.activeTabIndex.set(nextActiveIndex)
      if (activeDeleted) {
        ui$.webview.set(undefined)
        ui$.activeCanGoBack.set(false)
      }
    }

    tabs$.recentlyClosedTabs.set(nextRecentlyClosedTabs)
  },

  duplicateTab: (tabId) => {
    const tabs = tabs$.tabs.get()
    const source = tabs.find((tab) => tab.id === tabId)
    if (!source) {
      return undefined
    }

    const duplicated: Tab = {
      ...source,
      id: genId(),
      isLoading: Boolean(source.url),
    }
    tabs$.tabs.push(duplicated)

    const orders = tabs$.orders.get()
    const sourceOrder = orders[tabId]
    if (typeof sourceOrder === 'number') {
      const nextOrders: Record<string, number> = {}
      Object.entries(orders).forEach(([id, order]) => {
        nextOrders[id] = order > sourceOrder ? order + 1 : order
      })
      nextOrders[duplicated.id] = sourceOrder + 1
      tabs$.orders.set(nextOrders)
    }

    const activeViewId = savedViews$.activeViewId.get()
    if (activeViewId && activeViewId !== DECK_VIEW_ID) {
      const viewIndex = savedViews$.savedViews.get().findIndex((view) => view?.id === activeViewId)
      if (viewIndex !== -1) {
        const view$ = savedViews$.savedViews[viewIndex]
        const layout = view$.layout.get()
        const slotTabIds = view$.slotTabIds.get()
        const sourceSlotIndex = slotTabIds.findIndex((slotTabId) => slotTabId === tabId)
        if (sourceSlotIndex !== -1) {
          if (layout === 'split-view') {
            view$.slotTabIds.splice(sourceSlotIndex + 1, 0, duplicated.id)
          } else {
            const emptySlotIndex = slotTabIds.findIndex((slotTabId) => !slotTabId)
            if (emptySlotIndex !== -1) {
              view$.slotTabIds[emptySlotIndex].set(duplicated.id)
            }
          }
        }
      }
    }
    const activeGroupId = tabGroups$.activeGroupId.get()
    if (activeGroupId) {
      const group = tabGroups$.groups.get().find((currentGroup) => currentGroup?.id === activeGroupId)
      const sourceSlotIndex = group?.tabIds.findIndex((slotTabId) => slotTabId === tabId) ?? -1
      if (group && sourceSlotIndex !== -1) {
        if (group.layout === 'grid-4') {
          const emptySlotIndex = group.tabIds.findIndex((slotTabId) => !slotTabId)
          if (emptySlotIndex !== -1) {
            tabGroups$.assignGroupSlot(group.id, emptySlotIndex, duplicated.id)
          }
        } else {
          tabGroups$.moveTabToGroup(duplicated.id, group.id, sourceSlotIndex + 1)
        }
      }
    }

    tabs$.setActiveTabIndex(tabs$.tabs.length - 1, 'open')
    return duplicated.id
  },

  reopenClosedTab: (tabId) => {
    const recentlyClosedTabs = tabs$.recentlyClosedTabs.get()
    const closedTab = recentlyClosedTabs.find((tab) => tab.id === tabId)
    if (!closedTab) {
      return undefined
    }

    tabs$.recentlyClosedTabs.set(recentlyClosedTabs.filter((tab) => tab.id !== tabId))
    const { id: _closedTabId, closedAt: _closedAt, groupId, groupSlotIndex, precedingTabId, ...rest } = closedTab
    const reopenedTab: Tab = { ...rest, id: genId(), isLoading: Boolean(rest.url) }
    tabs$.tabs.push(reopenedTab)

    if (groupId && tabGroups$.groups.get().some((group) => group?.id === groupId)) {
      const group = tabGroups$.groups.get().find((currentGroup) => currentGroup?.id === groupId)!
      if (group.layout === 'grid-4') {
        const targetSlot =
          typeof groupSlotIndex === 'number' && groupSlotIndex >= 0 && groupSlotIndex < group.tabIds.length && !group.tabIds[groupSlotIndex]
            ? groupSlotIndex
            : group.tabIds.findIndex((slotTabId) => !slotTabId)
        if (targetSlot !== -1) {
          tabGroups$.assignGroupSlot(groupId, targetSlot, reopenedTab.id)
        }
      } else {
        tabGroups$.moveTabToGroup(reopenedTab.id, groupId, groupSlotIndex)
      }
    } else {
      restoreTabOrder(reopenedTab.id, precedingTabId)
    }

    tabs$.setActiveTabIndex(tabs$.tabs.length - 1, 'open')
    return reopenedTab.id
  },

  updateTabUrl: (url, index) => {
    if (!tabs$.tabs.length) {
      return tabs$.openTab(url)
    }
    const targetIndex = index ?? tabs$.activeTabIndex.get()
      const tab$ = tabs$.tabs[targetIndex]
    const tab = tab$.get()
    if (tab) {
      const previousUrl = tab$.url.get()
      if (url && shouldResolveTabUrlAsAutoProfile(tab)) {
        const siteProfile = getSiteProfileId(url)
        if (siteProfile) {
          recordAutoProfile(siteProfile)
          tab$.profile.set(siteProfile)
          tab$.profileMode.set('auto')
        }
      }
      tab$.url.set(url)
      tab$.isLoading.set(Boolean(url))
      tab$.isPaused.set(false)
      if (!previousUrl && url) {
        tab$.backToNewTab.set(true)
      }
      if (!url) {
        tab$.title.set(undefined)
        tab$.icon.set(undefined)
      }
    }
  },

  setTabLoading: (loading, index) => {
    const targetIndex = index ?? tabs$.activeTabIndex.get()
    const tab$ = tabs$.tabs[targetIndex]
    if (tab$.get()) {
      tab$.isLoading.set(loading)
    }
  },

  setTabPaused: (paused, index) => {
    const targetIndex = index ?? tabs$.activeTabIndex.get()
    const tab$ = tabs$.tabs[targetIndex]
    if (tab$.get()) {
      tab$.isPaused.set(paused)
      if (paused) {
        tab$.isLoading.set(false)
      }
    }
  },

  setActiveTabIndex: (index, reason = 'user') => {
    setActiveTabIndexInternal(index, reason)
  },

  setActiveTabById: (tabId, reason = 'user') => {
    const index = tabs$.tabs.get().findIndex((tab) => tab?.id === tabId)
    if (index !== -1) {
      setActiveTabIndexInternal(index, reason)
    }
  },

  handleBackPress: () => {
    const activeTabId = getActiveTabId()
    const webview = ui$.webview.get()
    const canGoBack = ui$.activeCanGoBack.get()
    if (canGoBack) {
      webview?.goBack?.()
      return true
    }

    const targetTabId = getChildBackTarget(
      childBackParentByTabId,
      activeTabId,
      canGoBack,
      tabs$.tabs.get().map((tab) => tab.id),
    )
    if (!targetTabId) {
      const activeIndex = tabs$.activeTabIndex.get()
      const activeTab = tabs$.tabs[activeIndex].get()
      if (activeTab?.url && activeTab.backToNewTab) {
        tabs$.updateTabUrl('', activeIndex)
        ui$.webview.set(undefined)
        ui$.activeCanGoBack.set(false)
        return true
      }
      return false
    }

    childBackParentByTabId = consumeChildBackTarget(childBackParentByTabId, activeTabId)
    const activeIndex = tabs$.tabs.get().findIndex((tab) => tab?.id === activeTabId)
    if (activeIndex === -1) {
      return false
    }

    const closedTab = tabs$.tabs[activeIndex].get()
    pushRecentlyClosedTabs(closedTab ? [closedTab] : [])
    tabs$.tabs.splice(activeIndex, 1)
    savedViews$.cleanupClosedTabIds(activeTabId ? [activeTabId] : [])
    tabGroups$.cleanupClosedTabIds(activeTabId ? [activeTabId] : [])
    syncRuntimeTabMetadata()
    ui$.webview.set(undefined)
    ui$.activeCanGoBack.set(false)

    const remainingTabs = tabs$.tabs.get()
    if (!remainingTabs.length) {
      tabs$.assign({ tabs: [{ id: genId(), url: '' }], activeTabIndex: 0 })
      return true
    }

    tabs$.setActiveTabById(targetTabId, 'back')
    return true
  },
})

syncObservable(tabs$, {
  persist: {
    name: 'tabs',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => {
        if (data?.tabs) {
          const seenIds = new Set<string>()
          data.tabs = data.tabs
            .filter((tab) => tab != null)
            .map((tab) => {
              if (!tab.id || seenIds.has(tab.id)) {
                tab.id = genId()
              }
              tab.isLoading = false
              if (isSiteProfileId(tab.profile)) {
                tab.profileMode = 'auto'
                recordAutoProfile(tab.profile)
              } else if (tab.profileMode !== 'auto' && tab.profileMode !== 'manual') {
                tab.profileMode = undefined
              }
              tab.backToNewTab = Boolean(tab.backToNewTab || !tab.url)
              seenIds.add(tab.id)
              return tab
            })
          if (!data.tabs.length) {
            data.tabs = [{ id: genId(), url: '' }]
          }          if (typeof data.activeTabIndex !== 'number' || data.activeTabIndex < 0) {
            data.activeTabIndex = 0
          }
          if (data.activeTabIndex >= data.tabs.length) {
            data.activeTabIndex = data.tabs.length - 1
          }
        }
        if (data?.recentlyClosedTabs) {
          data.recentlyClosedTabs = data.recentlyClosedTabs
            .filter((tab): tab is ClosedTab => tab != null && typeof tab.url === 'string')
            .map((tab) => ({
              ...tab,
              id: tab.id || genId(),
              closedAt: typeof tab.closedAt === 'number' ? tab.closedAt : Date.now(),
            }))
            .slice(0, MAX_RECENTLY_CLOSED_TABS)
        }
        return data
      },
    },
  },
})
