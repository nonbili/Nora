import { observable } from '@legendapp/state'
import { settings$ } from './settings'

interface Store {
  url: string
  title: string
  fullSyncedAt: Date | undefined

  // header
  headerHeight: number
  headerShown: boolean

  // modals
  bookmarkModalOpen: boolean
  cookieModalOpen: boolean
  downloadVideoModalUrl: string
  navModalOpen: boolean
  profileModalOpen: boolean
  editingProfileId: string | null
  lastSelectedProfileId: string
  settingsModalOpen: boolean
  tabModalOpen: boolean
  toolsModalOpen: boolean
  urlModalOpen: boolean

  // webview
  webview: any
}

export const ui$ = observable<Store>({
  url: '',
  title: '',
  fullSyncedAt: undefined,

  // header
  headerHeight: 0,
  headerShown: true,

  // modals
  bookmarkModalOpen: false,
  cookieModalOpen: false,
  downloadVideoModalUrl: '',
  navModalOpen: false,
  profileModalOpen: false,
  editingProfileId: null,
  settingsModalOpen: false,
  tabModalOpen: false,
  toolsModalOpen: false,
  urlModalOpen: false,
  lastSelectedProfileId: 'default',

  // webview
  webview: undefined,
})
