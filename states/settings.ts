import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

interface Store {
  home: 'instagram' | 'reddit' | 'threads' | 'x'

  hideShorts: boolean
  theme: null | 'dark' | 'light'

  disabledServices: Set<string>
  toggleService: (service: string) => void
}

export const settings$ = observable<Store>({
  home: 'x',

  hideShorts: true,
  theme: null,

  disabledServices: new Set(),
  toggleService: (service) => {
    if (settings$.disabledServices.has(service)) {
      settings$.disabledServices.delete(service)
    } else {
      settings$.disabledServices.add(service)
    }
  },
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
  },
})
