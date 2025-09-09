import { observable } from '@legendapp/state'
import { settings$ } from './settings'

interface Store {
  url: string
  pageUrl: string
  title: string

  // modals
  cookieModalOpen: boolean
  navModalOpen: boolean
  settingsModalOpen: boolean

  // webview
  webview: any
}

export const ui$ = observable<Store>({
  url: '',
  pageUrl: '',
  title: '',

  // modals
  cookieModalOpen: false,
  navModalOpen: false,
  settingsModalOpen: false,

  // webview
  webview: undefined,
})
