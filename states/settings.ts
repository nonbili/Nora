import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

interface Store {
  home: 'instagram' | 'reddit' | 'threads' | 'x'

  hideShorts: boolean
  theme: null | 'dark' | 'light'
}

export const settings$ = observable<Store>({
  home: 'x',

  hideShorts: true,
  theme: null,
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
  },
})
