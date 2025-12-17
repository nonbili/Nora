import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'

export interface Tab {
  id: string
  url: string
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
  setTab: (index: number, url: string) => void
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
    if (index == tabs$.tabs.length - 1) {
      tabs$.activeTabIndex.set(index - 1)
    }
    tabs$.tabs.splice(index, 1)
  },

  setTab: (index, url) => {
    tabs$.tabs[index].url.set(url)
  },
})

syncObservable(tabs$, {
  persist: {
    name: 'tabs',
    plugin: ObservablePersistMMKV,
  },
})
