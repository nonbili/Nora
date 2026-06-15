import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { normalizeXHomeTimeline, type XHomeTimeline } from '@/lib/settings/twitter'
import { normalizeI18nLanguage, type SupportedI18nLanguage } from '@/lib/i18n'
import {
  type CustomSearchProvider,
  normalizeCustomSearchProviders,
  normalizeEnabledSearchProviderIds,
  normalizeSelectedSearchProviderId,
  getFaviconUrl,
  isValidSearchTemplate,
} from '@/lib/search'

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
  language: SupportedI18nLanguage | null
  autoHideHeader: boolean
  hideToolbarWhenScrolled: boolean
  headerPosition: 'top' | 'bottom'
  theme: null | 'dark' | 'light'
  openExternalLinkInSystemBrowser: boolean
  redirectToOldReddit: boolean
  xDefaultHomeTimeline: XHomeTimeline
  hideXHomeTimelineTabs: boolean
  allowHttpWebsite: boolean
  inspectable: boolean
  videoEdgeLongPressTo2x: boolean
  doubleBackToExitApp: boolean
  mentionNotificationsEnabled: boolean

  proxyEnabled: boolean
  proxyType: 'http' | 'socks'
  proxyHost: string
  proxyPort: string

  showNewTabButtonInHeader: boolean
  showBackButtonInHeader: boolean
  showForwardButtonInHeader: boolean
  showReloadButtonInHeader: boolean
  showScrollButtonInHeader: boolean
  oneHandMode: boolean
  oneTabPerSite: boolean
  oneProfilePerSite: boolean

  deckTabWidth: number
  sidebarCollapsed: boolean

  disabledServicesArr: string[]
  enabledSearchProviderIds: string[]
  selectedSearchProviderId: string
  customSearchProviders: CustomSearchProvider[]
  profiles: Profile[]
}

interface Store extends Settings {
  setLanguage: (language: SupportedI18nLanguage | null) => void
  toggleService: (service: string) => void
  toggleSearchProvider: (providerId: string) => void
  setSelectedSearchProvider: (providerId: string) => void
  addCustomSearchProvider: (name: string, templateUrl: string) => string | null
  updateCustomSearchProvider: (id: string, name: string, templateUrl: string) => void
  deleteCustomSearchProvider: (id: string) => void
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
  data.customSearchProviders = normalizeCustomSearchProviders(data.customSearchProviders)
  data.enabledSearchProviderIds = normalizeEnabledSearchProviderIds(
    data.enabledSearchProviderIds,
    data.customSearchProviders,
  )
  data.selectedSearchProviderId = normalizeSelectedSearchProviderId(
    data.selectedSearchProviderId,
    data.enabledSearchProviderIds,
  )
  if (typeof data.videoEdgeLongPressTo2x !== 'boolean') {
    data.videoEdgeLongPressTo2x = true
  }
  if (!('language' in data)) {
    data.language = null
  } else {
    data.language = normalizeI18nLanguage(data.language as string | null | undefined)
  }
  if (typeof data.doubleBackToExitApp !== 'boolean') {
    data.doubleBackToExitApp = false
  }
  if (typeof data.mentionNotificationsEnabled !== 'boolean') {
    data.mentionNotificationsEnabled = false
  }
  data.xDefaultHomeTimeline = normalizeXHomeTimeline(data.xDefaultHomeTimeline)
  if (typeof data.hideXHomeTimelineTabs !== 'boolean') {
    data.hideXHomeTimelineTabs = false
  }
  if (typeof data.showReloadButtonInHeader !== 'boolean') {
    data.showReloadButtonInHeader = false
  }
  if (typeof data.hideToolbarWhenScrolled !== 'boolean') {
    data.hideToolbarWhenScrolled = false
  }
  if (typeof data.deckTabWidth !== 'number') {
    data.deckTabWidth = 400
  }
  if (typeof data.sidebarCollapsed !== 'boolean') {
    data.sidebarCollapsed = false
  }
  if (typeof data.oneProfilePerSite !== 'boolean') {
    data.oneProfilePerSite = false
  }
  if (typeof data.proxyEnabled !== 'boolean') {
    data.proxyEnabled = false
  }
  if (data.proxyType !== 'http' && data.proxyType !== 'socks') {
    data.proxyType = 'http'
  }
  if (typeof data.proxyHost !== 'string') {
    data.proxyHost = ''
  }
  if (typeof data.proxyPort !== 'string') {
    data.proxyPort = ''
  }
  return data
}

export const settings$: Observable<Store> = observable<Store>({
  language: null,
  autoHideHeader: false,
  hideToolbarWhenScrolled: false,
  headerPosition: 'top',
  theme: null,
  openExternalLinkInSystemBrowser: false,
  redirectToOldReddit: false,
  xDefaultHomeTimeline: 'for-you',
  hideXHomeTimelineTabs: false,
  allowHttpWebsite: true,
  inspectable: false,
  videoEdgeLongPressTo2x: true,
  doubleBackToExitApp: false,
  mentionNotificationsEnabled: false,

  proxyEnabled: false,
  proxyType: 'http',
  proxyHost: '',
  proxyPort: '',

  showNewTabButtonInHeader: true,
  showBackButtonInHeader: false,
  showForwardButtonInHeader: false,
  showReloadButtonInHeader: false,
  showScrollButtonInHeader: false,
  oneHandMode: false,
  oneTabPerSite: false,
  oneProfilePerSite: false,

  deckTabWidth: 400,
  sidebarCollapsed: false,

  disabledServicesArr: [],
  enabledSearchProviderIds: ['url', 'duckduckgo', 'google'],
  selectedSearchProviderId: 'url',
  customSearchProviders: [],
  profiles: [DEFAULT_PROFILE],
  setLanguage: (language) => {
    settings$.language.set(normalizeI18nLanguage(language))
  },
  toggleService: (service) => {
    const index = settings$.disabledServicesArr.indexOf(service)
    if (index === -1) {
      settings$.disabledServicesArr.push(service)
    } else {
      settings$.disabledServicesArr.splice(index, 1)
    }
  },
  toggleSearchProvider: (providerId) => {
    if (providerId === 'url') {
      return
    }

    const ids = settings$.enabledSearchProviderIds.get()
    const index = ids.indexOf(providerId)
    if (index === -1) {
      settings$.enabledSearchProviderIds.push(providerId)
      return
    }

    settings$.enabledSearchProviderIds.splice(index, 1)
    if (settings$.selectedSearchProviderId.get() === providerId) {
      settings$.selectedSearchProviderId.set('url')
    }
  },
  setSelectedSearchProvider: (providerId) => {
    const enabledIds = settings$.enabledSearchProviderIds.get()
    settings$.selectedSearchProviderId.set(enabledIds.includes(providerId) ? providerId : 'url')
  },
  addCustomSearchProvider: (name, templateUrl): string | null => {
    const trimmedName = name.trim()
    const trimmedTemplateUrl = templateUrl.trim()
    if (!trimmedName || !isValidSearchTemplate(trimmedTemplateUrl)) {
      return null
    }

    const id = genId()
    settings$.customSearchProviders.push({
      id,
      name: trimmedName,
      templateUrl: trimmedTemplateUrl,
      iconUrl: getFaviconUrl(trimmedTemplateUrl),
    })
    if (!settings$.enabledSearchProviderIds.get().includes(id)) {
      settings$.enabledSearchProviderIds.push(id)
    }
    return id
  },
  updateCustomSearchProvider: (id, name, templateUrl) => {
    const providers = settings$.customSearchProviders.get()
    const index = providers.findIndex((provider) => provider.id === id)
    const trimmedName = name.trim()
    const trimmedTemplateUrl = templateUrl.trim()
    if (index === -1 || !trimmedName || !isValidSearchTemplate(trimmedTemplateUrl)) {
      return
    }

    settings$.customSearchProviders[index].assign({
      name: trimmedName,
      templateUrl: trimmedTemplateUrl,
      iconUrl: getFaviconUrl(trimmedTemplateUrl),
    })
  },
  deleteCustomSearchProvider: (id) => {
    const providers = settings$.customSearchProviders.get()
    const index = providers.findIndex((provider) => provider.id === id)
    if (index === -1) {
      return
    }

    settings$.customSearchProviders.splice(index, 1)
    const enabledIds = settings$.enabledSearchProviderIds.get()
    const enabledIndex = enabledIds.indexOf(id)
    if (enabledIndex !== -1) {
      settings$.enabledSearchProviderIds.splice(enabledIndex, 1)
    }
    if (settings$.selectedSearchProviderId.get() === id) {
      settings$.selectedSearchProviderId.set('url')
    }
  },
  addProfile: (name, color) => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      return
    }
    settings$.profiles.push({ id: genId(), name: trimmedName, color })
  },
  updateProfile: (id, name, color) => {
    const profiles = settings$.profiles.get()
    const index = profiles.findIndex((p) => p?.id === id)
    const trimmedName = name.trim()
    if (!trimmedName) {
      return
    }
    if (index !== -1) {
      settings$.profiles[index].assign({ name: trimmedName, color })
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
