import { observable } from '@legendapp/state'
import { settings$ } from './settings'

interface Store {
  url: string
  pageUrl: string
  title: string
}

export const ui$ = observable<Store>({
  url: '',
  pageUrl: '',
  title: '',
})
