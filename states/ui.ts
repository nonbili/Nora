import { observable } from '@legendapp/state'

interface Store {
  urlModalMode: 'open' | 'editTab'
  urlModalTargetTabId: string | null
  url: string
  title: string

  // header
  headerHeight: number
  headerShown: boolean

  // modals
  bookmarkModalOpen: boolean
  cookieModalOpen: boolean
  downloadVideoModalUrl: string
  navModalOpen: boolean
  profileLinkUrl: string
  autoProfilesModalOpen: boolean
  profileModalOpen: boolean
  editingProfileId: string | null
  lastSelectedProfileId: string
  renameViewModalTargetViewId: string | null
  settingsModalOpen: boolean
  tabModalOpen: boolean
  toolsModalOpen: boolean
  urlModalOpen: boolean
  userStyleModalOpen: boolean
  editingUserStyleId: string | null
  previewBuiltinId: string | null

  // webview
  activeCanGoBack: boolean
  activeGoBack: (() => void) | undefined
  activeGoForward: (() => void) | undefined
  webview: any
  hoverLinkUrl: string
}

export const ui$ = observable<Store>({
  urlModalMode: 'open',
  urlModalTargetTabId: null,
  url: '',
  title: '',

  // header
  headerHeight: 0,
  headerShown: true,

  // modals
  bookmarkModalOpen: false,
  cookieModalOpen: false,
  downloadVideoModalUrl: '',
  navModalOpen: false,
  profileLinkUrl: '',
  autoProfilesModalOpen: false,
  profileModalOpen: false,
  editingProfileId: null,
  renameViewModalTargetViewId: null,
  settingsModalOpen: false,
  tabModalOpen: false,
  toolsModalOpen: false,
  urlModalOpen: false,
  userStyleModalOpen: false,
  editingUserStyleId: null,
  previewBuiltinId: null,
  lastSelectedProfileId: 'default',

  // webview
  activeCanGoBack: false,
  activeGoBack: undefined,
  activeGoForward: undefined,
  webview: undefined,
  hoverLinkUrl: '',
})
