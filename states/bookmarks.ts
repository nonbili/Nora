import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'

export interface Bookmark {
  url: string
  title?: string
  icon?: string
}

export interface Bookmarks {
  bookmarks: Bookmark[]
}

interface Store extends Bookmarks {
  updatedAt: number
  syncedAt: number

  addBookmark: (bookmark: Bookmark) => void
  deleteBookmark: (index: number) => void
  setSyncedTime: () => void
}

export const bookmarks$ = observable<Store>({
  bookmarks: [],
  updatedAt: 1,
  syncedAt: 0,
  addBookmark: (bookmark) => {
    bookmarks$.bookmarks.push(bookmark)
  },

  deleteBookmark: (index) => {
    bookmarks$.bookmarks.splice(index, 1)
  },
  setSyncedTime: () => {
    bookmarks$.syncedAt.set(Date.now())
  },
})

syncObservable(bookmarks$, {
  persist: {
    name: 'bookmarks',
    plugin: ObservablePersistMMKV,
  },
})
