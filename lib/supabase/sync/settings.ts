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
    // siteZoom is device-local; never push it to the remote.
    const { siteZoom: _siteZoom, ...rest } = settings$.get()
    return rest as Settings
  }

  setValue(value: Settings) {
    // Preserve the device-local siteZoom when applying remote settings.
    const siteZoom = settings$.siteZoom.get()
    settings$.assign(normalizeSettings({ ...value, siteZoom }))
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
