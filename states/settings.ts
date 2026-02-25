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

const DEFAULT_PROFILE_ID = 'default'
const DEFAULT_PROFILE: Profile = { id: DEFAULT_PROFILE_ID, name: 'Default', color: '#6366f1', isDefault: true }

const ensureProfiles = (profiles?: Array<Profile | null | undefined>) => {
  const sanitized = (profiles || []).filter((p): p is Profile => p != null)
  const defaultProfile = sanitized.find((p) => p.id === DEFAULT_PROFILE_ID)
  if (!defaultProfile) {
    return [DEFAULT_PROFILE, ...sanitized]
  }
  return sanitized
}

export interface Settings {
  autoHideHeader: boolean
  headerPosition: 'top' | 'bottom'
  theme: null | 'dark' | 'light'
  openExternalLinkInSystemBrowser: boolean
  redirectToOldReddit: boolean
  allowHttpWebsite: boolean
  inspectable: boolean

  showNewTabButtonInHeader: boolean
  showBackButtonInHeader: boolean
  showScrollButtonInHeader: boolean
  oneHandMode: boolean
  oneTabPerSite: boolean

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
  allowHttpWebsite: false,
  inspectable: false,

  showNewTabButtonInHeader: true,
  showBackButtonInHeader: false,
  showScrollButtonInHeader: false,
  oneHandMode: false,
  oneTabPerSite: false,

  disabledServicesArr: [],
  profiles: [DEFAULT_PROFILE],
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
    const index = profiles.findIndex((p) => p?.id === id)
    if (index !== -1) {
      settings$.profiles[index].assign({ name, color })
    }
  },
  deleteProfile: (id) => {
    const profiles = settings$.profiles.get()
    const index = profiles.findIndex((p) => p?.id === id)
    if (index !== -1 && profiles[index] && !profiles[index].isDefault) {
      settings$.profiles.splice(index, 1)
    }
  },
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => {
        if (data) {
          data.profiles = ensureProfiles(data.profiles)
        }
        return data
      },
    },
  },
})
