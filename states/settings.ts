import { observable, syncState, when } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

export interface Settings {
  autoHideHeader: boolean
  headerPosition: 'top' | 'bottom'
  theme: null | 'dark' | 'light'
  openExternalLinkInSystemBrowser: boolean
  redirectToOldReddit: boolean

  showNewTabButtonInHeader: boolean
  showBackButtonInHeader: boolean
  showScrollButtonInHeader: boolean
  oneHandMode: boolean

  disabledServicesArr: string[]
}

interface Store extends Settings {
  updatedAt: number
  syncedAt: number

  toggleService: (service: string) => void
  setSyncedTime: () => void
}

export const settings$ = observable<Store>({
  autoHideHeader: false,
  headerPosition: 'top',
  theme: null,
  openExternalLinkInSystemBrowser: true,
  redirectToOldReddit: false,

  showNewTabButtonInHeader: true,
  showBackButtonInHeader: false,
  showScrollButtonInHeader: false,
  oneHandMode: false,

  disabledServicesArr: [],
  updatedAt: 1,
  syncedAt: 0,
  toggleService: (service) => {
    const index = settings$.disabledServicesArr.indexOf(service)
    if (index == -1) {
      settings$.disabledServicesArr.push(service)
    } else {
      settings$.disabledServicesArr.splice(index, 1)
    }
  },
  setSyncedTime: () => {
    settings$.syncedAt.set(Date.now())
  },
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
  },
})
