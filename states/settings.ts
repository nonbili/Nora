import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { normalizeXHomeTimeline, type XHomeTimeline } from '@/lib/settings/twitter'

export interface Profile {
  id: string
  name: string
  color: string
  isDefault?: boolean
}

const DEFAULT_PROFILE_ID = 'default'
const DEFAULT_PROFILE: Profile = { id: DEFAULT_PROFILE_ID, name: 'Default', color: '#6366f1', isDefault: true }

const ensureProfiles = (profiles?: (Profile | null | undefined)[]) => {
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
  xDefaultHomeTimeline: XHomeTimeline
  hideXHomeTimelineTabs: boolean
  allowHttpWebsite: boolean
  inspectable: boolean
  videoEdgeLongPressTo2x: boolean

  showNewTabButtonInHeader: boolean
  showBackButtonInHeader: boolean
  showForwardButtonInHeader: boolean
  showReloadButtonInHeader: boolean
  showScrollButtonInHeader: boolean
  oneHandMode: boolean
  oneTabPerSite: boolean

  deckTabWidth: number

  disabledServicesArr: string[]
  profiles: Profile[]
}

interface Store extends Settings {
  toggleService: (service: string) => void
  addProfile: (name: string, color: string) => void
  updateProfile: (id: string, name: string, color: string) => void
  deleteProfile: (id: string) => void
}

export const normalizeSettings = <T extends Partial<Settings> | undefined>(data: T) => {
  if (!data) {
    return data
  }

  if ('profiles' in data) {
    data.profiles = ensureProfiles(data.profiles)
  }
  if (typeof data.videoEdgeLongPressTo2x !== 'boolean') {
    data.videoEdgeLongPressTo2x = true
  }
  data.xDefaultHomeTimeline = normalizeXHomeTimeline(data.xDefaultHomeTimeline)
  if (typeof data.hideXHomeTimelineTabs !== 'boolean') {
    data.hideXHomeTimelineTabs = false
  }
  if (typeof data.showReloadButtonInHeader !== 'boolean') {
    data.showReloadButtonInHeader = false
  }
  if (typeof data.deckTabWidth !== 'number') {
    data.deckTabWidth = 400
  }
  return data
}

export const settings$ = observable<Store>({
  autoHideHeader: false,
  headerPosition: 'top',
  theme: null,
  openExternalLinkInSystemBrowser: false,
  redirectToOldReddit: false,
  xDefaultHomeTimeline: 'for-you',
  hideXHomeTimelineTabs: false,
  allowHttpWebsite: false,
  inspectable: false,
  videoEdgeLongPressTo2x: true,

  showNewTabButtonInHeader: true,
  showBackButtonInHeader: false,
  showForwardButtonInHeader: false,
  showReloadButtonInHeader: false,
  showScrollButtonInHeader: false,
  oneHandMode: false,
  oneTabPerSite: false,

  deckTabWidth: 400,

  disabledServicesArr: [],
  profiles: [DEFAULT_PROFILE],
  toggleService: (service) => {
    const index = settings$.disabledServicesArr.indexOf(service)
    if (index === -1) {
      settings$.disabledServicesArr.push(service)
    } else {
      settings$.disabledServicesArr.splice(index, 1)
    }
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
      void import('@/lib/profile-data')
        .then(({ deleteProfileData }) => deleteProfileData(id))
        .catch((error) => {
          console.warn('Failed to delete profile data', error)
        })
    }
  },
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => {
        return normalizeSettings(data)
      },
    },
  },
})
