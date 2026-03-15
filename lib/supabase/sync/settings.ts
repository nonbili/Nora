import { syncState, when } from '@legendapp/state'
import { normalizeSettings, Settings, settings$ } from '@/states/settings'
import { ResourceSyncMeta, syncMeta$ } from '@/states/sync-meta'
import { BaseSyncer } from './base'

class SettingsSyncer extends BaseSyncer<Settings> {
  NAME = 'settings'
  TABLE_NAME = 'settings'
  pushWhenRemoteMissing = true

  isPersistLoaded = () => when(syncState(settings$).isPersistLoaded)

  getValue() {
    return settings$.get()
  }

  setValue(value: Settings) {
    settings$.assign(normalizeSettings(value))
  }

  hasMeaningfulLocalValue() {
    return true
  }

  getMeta() {
    return syncMeta$.settings.get()
  }

  setMeta(meta: Partial<ResourceSyncMeta<Settings>>) {
    syncMeta$.settings.assign(meta)
  }
}

export const settingsSyncer = new SettingsSyncer()
