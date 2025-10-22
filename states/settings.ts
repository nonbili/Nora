import { observable, syncState, when } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

interface Store {
  home: 'instagram' | 'reddit' | 'threads' | 'x'

  theme: null | 'dark' | 'light'

  disabledServices: Set<string>
  disabledServicesArr: string[]
  toggleService: (service: string) => void
}

export const settings$ = observable<Store>({
  home: 'x',

  theme: null,

  disabledServices: new Set(),
  disabledServicesArr: [],
  toggleService: (service) => {
    const index = settings$.disabledServicesArr.indexOf(service)
    if (index == -1) {
      settings$.disabledServicesArr.push(service)
    } else {
      settings$.disabledServicesArr.splice(index, 1)
    }
  },
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
  },
})

export async function migrateDisabledServices() {
  await when(syncState(settings$).isPersistLoaded)

  if (settings$.disabledServices.size) {
    settings$.disabledServicesArr.set([...settings$.disabledServices.get()])
    settings$.disabledServices.clear()
  }
}
