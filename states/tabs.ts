import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { ui$ } from './ui'
import { settings$ } from './settings'
import { savedViews$ } from './saved-views'
import { sortBy } from 'es-toolkit'

import { removeTrackingParams } from '@/lib/url'

export interface Tab {
  id: string
  url: string
  title?: string
  icon?: string
  desktopMode?: boolean
  profile?: string
}

interface Store {
  tabs: Tab[]
  activeTabIndex: number
  orders: Record<string, number>

  currentTab: () => Tab | undefined
  // currentUrl: () => string

  openTab: (url: string, profile?: string) => string | undefined
  closeTab: (index: number) => void
  closeAll: () => void
  updateTabUrl: (url: string, index?: number) => void
  setActiveTabById: (tabId: string) => void
}

let lastOpenedUrl = ''

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

export const openDesktopTab = (url: string, profile?: string) => tabs$.openTab(url, profile) as string | undefined

export const tabs$: Observable<Store> = observable<Store>({
  tabs: [],
  activeTabIndex: 0,
  orders: {},

  currentTab: (): Tab | undefined => {
    const index = tabs$.activeTabIndex.get()
    if (index < 0 || index >= tabs$.tabs.length) return undefined
    return tabs$.tabs[index].get()
  },
  // currentUrl: (): string => tabs$.tabs[tabs$.activeTabIndex.get()].get()?.url,

  openTab: (url, profile): string | undefined => {
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
            } catch (e) {
              return false
            }
          })

          if (existingTabIndex !== -1) {
            tabs$.activeTabIndex.set(existingTabIndex)
            tabs$.tabs[existingTabIndex].url.set(url)
            return tabs$.tabs[existingTabIndex].id.get()
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const tab: Tab = { id: genId(), url, profile: profile || ui$.lastSelectedProfileId.get() }
    tabs$.tabs.push(tab)
    tabs$.activeTabIndex.set(tabs$.tabs.length - 1)
    return tab.id
  },

  closeTab: (index) => {
    const tabs = tabs$.tabs.get()
    const tabId = tabs[index]?.id
    if (!tabId) {
      return
    }

    const activeIndex = tabs$.activeTabIndex.get()
    tabs$.tabs.splice(index, 1)
    savedViews$.cleanupClosedTabIds([tabId])

    const remainingTabs = tabs$.tabs.get()
    if (!remainingTabs.length) {
      tabs$.activeTabIndex.set(0)
      return
    }

    if (activeIndex > index) {
      tabs$.activeTabIndex.set(activeIndex - 1)
      return
    }

    if (activeIndex === index) {
      tabs$.activeTabIndex.set(Math.min(index, remainingTabs.length - 1))
    }
  },

  closeAll: () => {
    const closedTabIds = tabs$.tabs.get().map((tab) => tab.id)
    tabs$.assign({ tabs: [{ id: genId(), url: '' }], activeTabIndex: 0 })
    savedViews$.cleanupClosedTabIds(closedTabIds)
  },

  updateTabUrl: (url, index) => {
    if (!tabs$.tabs.length) {
      return tabs$.openTab(url)
    }
    const targetIndex = index ?? tabs$.activeTabIndex.get()
    const tab$ = tabs$.tabs[targetIndex]
    if (tab$.get()) {
      tab$.url.set(url)
    }
  },

  setActiveTabById: (tabId) => {
    const index = tabs$.tabs.get().findIndex((tab) => tab?.id === tabId)
    if (index !== -1) {
      tabs$.activeTabIndex.set(index)
    }
  },
})

syncObservable(tabs$, {
  persist: {
    name: 'tabs',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => {
        if (data?.tabs) {
          data.tabs = data.tabs.filter((tab) => tab != null)
          if (!data.tabs.length) {
            data.tabs = [{ id: genId(), url: '' }]
          }
          if (typeof data.activeTabIndex !== 'number' || data.activeTabIndex < 0) {
            data.activeTabIndex = 0
          }
          if (data.activeTabIndex >= data.tabs.length) {
            data.activeTabIndex = data.tabs.length - 1
          }
        }
        return data
      },
    },
  },
})
