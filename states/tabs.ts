import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'

interface Tab {
  id: string
  url: string
}

interface Store {
  tabs: Tab[]
  activeTabIndex: number

  openTab: (url: string) => void
  closeTab: (index: number) => void
  setTab: (index: number, url: string) => void
}

export const tabs$ = observable<Store>({
  tabs: [],
  activeTabIndex: 0,

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
