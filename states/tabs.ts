import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'

export interface Tab {
  id: string
  url: string
  title?: string
  icon?: string
  desktopMode?: boolean
}

interface Store {
  tabs: Tab[]
  activeTabIndex: number
  orders: Record<string, number>

  currentTab: () => Tab | undefined
  // currentUrl: () => string

  openTab: (url: string) => void
  closeTab: (index: number) => void
  closeAll: () => void
  updateTabUrl: (url: string, index?: number) => void
}

export const tabs$ = observable<Store>({
  tabs: [],
  activeTabIndex: 0,
  orders: {},

  currentTab: (): Tab => tabs$.tabs[tabs$.activeTabIndex.get()].get(),
  // currentUrl: (): string => tabs$.tabs[tabs$.activeTabIndex.get()].get()?.url,

  openTab: (url) => {
    const tab = { id: genId(), url }
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
    tabs$.tabs[index].url.set(url)
  },
})

syncObservable(tabs$, {
  persist: {
    name: 'tabs',
    plugin: ObservablePersistMMKV,
  },
})
