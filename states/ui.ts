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
  // The post whose media the feed's gallery shows, and the photo or video it opened at.
  // With posts, the gallery goes on from one post's media to the next one's, in their order.
  feedGallery: { postKey: string; profileKey: string; index: number; posts?: { postKey: string; profileKey: string }[] } | null
  // The timeline to change, or none to make one: with the profile to start it with, and the feed tab to show it in.
  // sourcesOnly: just which sources a timeline shows, without its name and other choices.
  timelineModal: { timelineId?: string; profileKey?: string; tabId?: string; sourcesOnly?: boolean } | null
  // Quick selection of a source from the timeline the feed tab shows.
  sourcesModal: { tabId?: string; timelineId?: string } | null
  // Source management, with the feed tab to open links beside.
  sourcesScreen: { tabId?: string } | null
  // A watched source's timeline, check interval or notifications, chosen from its menu in the feed.
  sourcePicker: { profileKey: string; kind: 'timeline' | 'interval' | 'notify' } | null
  // A source picked from that list, for its feed tab to show.
  feedSelection: { tabId: string; profileKey: string } | null
  // Adding sources by their links or from a file: into the timeline it was opened from, if any.
  addSourcesModal: { timelineId?: string } | null
  feedSettingsModalOpen: boolean
  navModalOpen: boolean
  profileLinkUrl: string
  // A tab to reopen in another profile, picked in the same modal as a link.
  profileTabId: string | null
  autoProfilesModalOpen: boolean
  profileModalOpen: boolean
  editingProfileId: string | null
  createdProfileId: string | null
  lastSelectedProfileId: string
  renameGroupModalTargetGroupId: string | null
  renameViewModalTargetViewId: string | null
  settingsModalOpen: boolean
  tabModalOpen: boolean
  toolsModalOpen: boolean
  zoomModalOpen: boolean
  urlModalOpen: boolean
  userStyleModalOpen: boolean
  editingUserStyleId: string | null
  userScriptModalOpen: boolean
  editingUserScriptId: string | null
  previewBuiltinId: string | null

  // webview
  activeCanGoBack: boolean
  webview: any
  hoverLinkUrl: string
  // The tab whose find bar is open, when it was last asked for, its text, and its matches: the one shown (from 1) and how many.
  findInPage: { tabId: string; openedAt: number; text: string; active: number; total: number } | null
  translation: {
    id: string
    text: string
    targetLanguage: string
    x: number
    y: number
  } | null
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
  feedGallery: null,
  timelineModal: null,
  sourcePicker: null,
  sourcesModal: null,
  sourcesScreen: null,
  feedSelection: null,
  addSourcesModal: null,
  feedSettingsModalOpen: false,
  navModalOpen: false,
  profileLinkUrl: '',
  profileTabId: null,
  autoProfilesModalOpen: false,
  profileModalOpen: false,
  editingProfileId: null,
  createdProfileId: null,
  renameGroupModalTargetGroupId: null,
  renameViewModalTargetViewId: null,
  settingsModalOpen: false,
  tabModalOpen: false,
  toolsModalOpen: false,
  zoomModalOpen: false,
  urlModalOpen: false,
  userStyleModalOpen: false,
  editingUserStyleId: null,
  userScriptModalOpen: false,
  editingUserScriptId: null,
  previewBuiltinId: null,
  lastSelectedProfileId: 'default',

  // webview
  activeCanGoBack: false,
  webview: undefined,
  hoverLinkUrl: '',
  findInPage: null,
  translation: null,
})
