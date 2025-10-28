import { observable } from '@legendapp/state'
import { settings$ } from './settings'

interface Store {
  url: string
  title: string

  // modals
  bookmarkModalOpen: boolean
  cookieModalOpen: boolean
  navModalOpen: boolean
  settingsModalOpen: boolean
  tabModalOpen: boolean

  // webview
  webview: any
}

export const ui$ = observable<Store>({
  url: '',
  title: '',

  // modals
  bookmarkModalOpen: false,
  cookieModalOpen: false,
  navModalOpen: false,
  settingsModalOpen: false,
  tabModalOpen: false,

  // webview
  webview: undefined,
})
