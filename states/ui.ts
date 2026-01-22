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
  settingsModalOpen: false,
  tabModalOpen: false,
  toolsModalOpen: false,
  urlModalOpen: false,

  // webview
  webview: undefined,
})
