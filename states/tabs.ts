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

  openTab: (url: string) => void
  closeTab: (index: number) => void
  setTab: (index: number, url: string) => void
}

export const tabs$ = observable<Store>({
  tabs: [],

  openTab: (url) => {
    const tab = { id: genId(), url }
    tabs$.tabs.push(tab)
  },

  closeTab: (index) => {
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
