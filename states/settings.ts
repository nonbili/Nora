import { observable, syncState, when } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'

export interface Profile {
  id: string
  name: string
  color: string
  isDefault?: boolean
}

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
  profiles: Profile[]
}

interface Store extends Settings {
  updatedAt: number
  syncedAt: number

  toggleService: (service: string) => void
  setSyncedTime: () => void
  addProfile: (name: string, color: string) => void
  updateProfile: (id: string, name: string, color: string) => void
  deleteProfile: (id: string) => void
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
  profiles: [{ id: 'default', name: 'Default', color: '#6366f1', isDefault: true }],
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
  addProfile: (name, color) => {
    settings$.profiles.push({ id: genId(), name, color })
  },
  updateProfile: (id, name, color) => {
    const profiles = settings$.profiles.get()
    const index = profiles.findIndex((p) => p.id === id)
    if (index !== -1) {
      settings$.profiles[index].assign({ name, color })
    }
  },
  deleteProfile: (id) => {
    const profiles = settings$.profiles.get()
    const index = profiles.findIndex((p) => p.id === id)
    if (index !== -1 && !profiles[index].isDefault) {
      settings$.profiles.splice(index, 1)
    }
  },
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
  },
})
