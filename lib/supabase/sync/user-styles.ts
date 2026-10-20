import { syncState, when } from '@legendapp/state'
import { normalizeUserStyles, type UserStylesSnapshot } from '@/lib/user-styles'
import { getUserStylesSnapshot, userStyles$ } from '@/states/user-styles'
import { ResourceSyncMeta, syncMeta$ } from '@/states/sync-meta'
import { BaseSyncer } from './base'
import { mergeKeys, mergeList } from './merge'

class UserStylesSyncer extends BaseSyncer<UserStylesSnapshot> {
  NAME = 'user-styles'
  TABLE_NAME = 'user_styles'
  pushWhenRemoteMissing = true

  isPersistLoaded = () =>
    when(() => syncState(userStyles$).isPersistLoaded.get() && syncState(syncMeta$).isPersistLoaded.get())

  getValue() {
    return getUserStylesSnapshot()
  }

  setValue(value: UserStylesSnapshot) {
    userStyles$.assign(normalizeUserStyles(value))
  }

  // Built-in styles and scripts each on their own, custom ones by their id.
  merge(base: UserStylesSnapshot | undefined, local: UserStylesSnapshot, remote: UserStylesSnapshot) {
    return mergeKeys(base, local, remote, {
      builtins: (b, l, r) => mergeKeys(b, l, r),
      builtinScripts: (b, l, r) => mergeKeys(b, l, r),
      customStyles: mergeList((style) => style.id),
      customScripts: mergeList((script) => script.id),
    })
  }

  hasMeaningfulLocalValue() {
    return true
  }

  getMeta() {
    return syncMeta$.userStyles.get()
  }

  setMeta(meta: Partial<ResourceSyncMeta<UserStylesSnapshot>>) {
    syncMeta$.userStyles.assign(meta)
  }
}

export const userStylesSyncer = new UserStylesSyncer()
