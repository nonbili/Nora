import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'

interface Bookmark {
  url: string
  title: string
  icon: string
}

interface Store {
  bookmarks: Bookmark[]

  addBookmark: (bookmark: Bookmark) => void
  deleteBookmark: (index: number) => void
}

export const bookmarks$ = observable<Store>({
  bookmarks: [],

  addBookmark: (bookmark) => {
    bookmarks$.bookmarks.push(bookmark)
  },

  deleteBookmark: (index) => {
    bookmarks$.bookmarks.splice(index, 1)
  },
})

syncObservable(bookmarks$, {
  persist: {
    name: 'bookmarks',
    plugin: ObservablePersistMMKV,
  },
})
