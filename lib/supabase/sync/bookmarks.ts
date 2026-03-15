import { syncState, when } from '@legendapp/state'
import { Bookmarks, bookmarks$ } from '@/states/bookmarks'
import { ResourceSyncMeta, syncMeta$ } from '@/states/sync-meta'
import { BaseSyncer } from './base'

class BookmarksSyncer extends BaseSyncer<Bookmarks> {
  NAME = 'bookmarks'
  TABLE_NAME = 'bookmarks'
  pushWhenRemoteMissing = false

  isPersistLoaded = () => when(syncState(bookmarks$).isPersistLoaded)

  getValue() {
    return bookmarks$.get()
  }

  setValue(value: Bookmarks) {
    bookmarks$.assign(value)
  }

  hasMeaningfulLocalValue(value: Bookmarks) {
    return value.bookmarks.length > 0
  }

  getMeta() {
    return syncMeta$.bookmarks.get()
  }

  setMeta(meta: Partial<ResourceSyncMeta<Bookmarks>>) {
    syncMeta$.bookmarks.assign(meta)
  }
}

export const bookmarksSyncer = new BookmarksSyncer()
