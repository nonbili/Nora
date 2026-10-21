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
  timelineModal: { timelineId?: string; profileKey?: string; tabId?: string } | null
  // The list of all watched sources, opened from the feed tab whose links it opens beside; or, to pick
  // one, the sources of the timeline that tab shows.
  sourcesModal: { tabId?: string; timelineId?: string; pick?: boolean } | null
  // A watched source's timelines or check interval, chosen from its menu in the feed.
  sourcePicker: { profileKey: string; kind: 'timelines' | 'interval' } | null
  // A source picked from that list, for its feed tab to show.
  feedSelection: { tabId: string; profileKey: string } | null
  // Adding sources by their links or from a file: into the timeline it was opened from, if any.
  addSourcesModal: { timelineId?: string } | null
  feedSettingsModalOpen: boolean
  navModalOpen: boolean
  profileLinkUrl: string
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
  feedSelection: null,
  addSourcesModal: null,
  feedSettingsModalOpen: false,
  navModalOpen: false,
  profileLinkUrl: '',
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
  translation: null,
})
