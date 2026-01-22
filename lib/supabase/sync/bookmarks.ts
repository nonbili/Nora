import { syncState, when } from '@legendapp/state'
import { Bookmarks, bookmarks$ } from '@/states/bookmarks'
import { BaseSyncer } from './base'

class BookmarksSyncer extends BaseSyncer<Bookmarks> {
  NAME = 'bookmarks'
  TABLE_NAME = 'bookmarks'
  COLUMNS = 'json,updated_at'
  SYNC_STATE_FIELD = 'bookmarks_updated_at'

  isPersistLoaded = () => when(syncState(bookmarks$).isPersistLoaded)

  getStore() {
    const { updatedAt, syncedAt, addBookmark, deleteBookmark, setSyncedTime, ...value } = bookmarks$.get()
    return { value, updatedAt, syncedAt }
  }

  setStore({ value, updatedAt }: { value: Bookmarks; updatedAt: number }) {
    bookmarks$.assign({ ...value, updatedAt })
  }

  setSyncedTime() {
    bookmarks$.setSyncedTime()
  }
}

export const bookmarksSyncer = new BookmarksSyncer()
