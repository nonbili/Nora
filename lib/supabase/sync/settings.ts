import { syncState, when } from '@legendapp/state'
import { normalizeSettings, Settings, settings$ } from '@/states/settings'
import { ResourceSyncMeta, syncMeta$ } from '@/states/sync-meta'
import { BaseSyncer } from './base'
import { mergeKeys } from './merge'
import { omitDeviceLocalSettings } from './settings-value'

class SettingsSyncer extends BaseSyncer<Settings> {
  NAME = 'settings'
  TABLE_NAME = 'settings'
  pushWhenRemoteMissing = true

  isPersistLoaded = () => when(syncState(settings$).isPersistLoaded)

  getValue() {
    return omitDeviceLocalSettings(settings$.get()) as unknown as Settings
  }

  async fetchRemote() {
    const remote = await super.fetchRemote()
    return remote && { ...remote, value: omitDeviceLocalSettings(remote.value) as Settings }
  }

  setValue(value: Settings) {
    // Remote documents must not replace device-local zoom or proxy credentials.
    const siteZoom = settings$.siteZoom.get()
    const proxyUsername = settings$.proxyUsername.get()
    const proxyPassword = settings$.proxyPassword.get()
    settings$.assign(normalizeSettings({ ...value, siteZoom, proxyUsername, proxyPassword }))
  }

  // Each setting on its own; one both devices changed is the other device's.
  merge(base: Settings | undefined, local: Settings, remote: Settings) {
    // Older or hand-edited remote documents may contain device-local fields.
    // Filter every merge input so those fields cannot be echoed in a push.
    return mergeKeys(
      base && omitDeviceLocalSettings(base),
      omitDeviceLocalSettings(local),
      omitDeviceLocalSettings(remote),
    ) as unknown as ReturnType<typeof mergeKeys<Settings>>
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
