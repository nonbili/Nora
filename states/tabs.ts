import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { ui$ } from './ui'

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

  openTab: (url: string, profile?: string) => void
  closeTab: (index: number) => void
  closeAll: () => void
  updateTabUrl: (url: string, index?: number) => void
}

let lastOpenedUrl = ''

export const tabs$ = observable<Store>({
  tabs: [],
  activeTabIndex: 0,
  orders: {},

  currentTab: (): Tab | undefined => {
    const index = tabs$.activeTabIndex.get()
    if (index < 0 || index >= tabs$.tabs.length) return undefined
    return tabs$.tabs[index].get()
  },
  // currentUrl: (): string => tabs$.tabs[tabs$.activeTabIndex.get()].get()?.url,

  openTab: (url, profile) => {
    const cleaned = removeTrackingParams(url.replace('nora://', 'https://'))
    if (cleaned && cleaned === lastOpenedUrl) {
      return
    }
    lastOpenedUrl = cleaned
    setTimeout(() => {
      lastOpenedUrl = ''
    }, 1000)

    const tab: Tab = { id: genId(), url, profile: profile || ui$.lastSelectedProfileId.get() }
    tabs$.activeTabIndex.set(tabs$.tabs.length)
    tabs$.tabs.push(tab)
  },

  closeTab: (index) => {
    const activeIndex = tabs$.activeTabIndex.get()
    if (activeIndex >= index) {
      tabs$.activeTabIndex.set(activeIndex - 1)
    }
    tabs$.tabs.splice(index, 1)
  },

  closeAll: () => {
    tabs$.assign({ tabs: [{ id: genId(), url: '' }], activeTabIndex: 0 })
  },

  updateTabUrl: (url, index) => {
    if (!tabs$.tabs.length) {
      return tabs$.openTab(url)
    }
    if (index == undefined) {
      index = tabs$.activeTabIndex.get()
    }
    const tab$ = tabs$.tabs[index]
    if (tab$.get()) {
      tab$.url.set(url)
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
        }
        return data
      },
    },
  },
})
