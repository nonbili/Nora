import { observable } from '@legendapp/state'
import { settings$ } from './settings'

interface Store {
  url: string
  title: string

  // header
  headerHeight: number
  headerShown: boolean

  // modals
  bookmarkModalOpen: boolean
  cookieModalOpen: boolean
  downloadVideoModalOpen: boolean
  navModalOpen: boolean
  settingsModalOpen: boolean
  tabModalOpen: boolean
  urlModalOpen: boolean

  // webview
  webview: any
}

export const ui$ = observable<Store>({
  url: '',
  title: '',

  // header
  headerHeight: 0,
  headerShown: true,

  // modals
  bookmarkModalOpen: false,
  cookieModalOpen: false,
  downloadVideoModalOpen: false,
  navModalOpen: false,
  settingsModalOpen: false,
  tabModalOpen: false,
  urlModalOpen: false,

  // webview
  webview: undefined,
})
