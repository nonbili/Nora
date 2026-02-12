import { syncState, when } from '@legendapp/state'
import { Settings, settings$ } from '@/states/settings'
import { BaseSyncer } from './base'

class SettingsSyncer extends BaseSyncer<Settings> {
  NAME = 'settings'
  TABLE_NAME = 'settings'
  COLUMNS = 'json,updated_at'
  SYNC_STATE_FIELD = 'settings_updated_at'

  isPersistLoaded = () => when(syncState(settings$).isPersistLoaded)

  getStore() {
    const { updatedAt, syncedAt, toggleService, setSyncedTime, ...value } = settings$.get()
    return { value, updatedAt, syncedAt }
  }

  setStore({ value, updatedAt }: { value: Settings; updatedAt: number }) {
    if (value?.profiles) {
      value.profiles = value.profiles.filter((p) => p != null)
    }
    settings$.assign({ ...value, updatedAt })
  }

  setSyncedTime() {
    settings$.setSyncedTime()
  }
}

export const settingsSyncer = new SettingsSyncer()
