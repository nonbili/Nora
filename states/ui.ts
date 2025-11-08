import { observable } from '@legendapp/state'
import { settings$ } from './settings'

interface Store {
  url: string
  title: string

  // header
  headerHeight: number
  headerMarginTop: number
  headerShown: boolean

  // modals
  bookmarkModalOpen: boolean
  cookieModalOpen: boolean
  navModalOpen: boolean
  settingsModalOpen: boolean
  tabModalOpen: boolean

  // webview
  webview: any

  // computed
  isModalOpen: () => boolean
}

export const ui$ = observable<Store>({
  url: '',
  title: '',

  // header
  headerHeight: 0,
  headerMarginTop: 0,
  headerShown: true,

  // modals
  bookmarkModalOpen: false,
  cookieModalOpen: false,
  navModalOpen: false,
  settingsModalOpen: false,
  tabModalOpen: false,

  // webview
  webview: undefined,

  // computed
  isModalOpen: (): boolean => {
    const { bookmarkModalOpen, cookieModalOpen, navModalOpen, settingsModalOpen, tabModalOpen } = ui$.get()
    return [bookmarkModalOpen, cookieModalOpen, navModalOpen, settingsModalOpen, tabModalOpen].some((x) => x)
  },
})
