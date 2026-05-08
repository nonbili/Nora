import NoraViewModule from '@/modules/nora-view'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'

const DEFAULT_PROFILE_ID = 'default'

export const clearProfileData = (profileId: string) => {
  if (!profileId) {
    return
  }

  tabs$.deleteProfileData(profileId)

  void Promise.resolve(NoraViewModule.clearProfileData(profileId)).catch((error) => {
    console.warn('Failed to clear profile data', error)
  })
}

export const deleteProfileData = (profileId: string) => {
  if (!profileId || profileId === DEFAULT_PROFILE_ID) {
    return
  }

  if (ui$.lastSelectedProfileId.get() === profileId) {
    ui$.lastSelectedProfileId.set(DEFAULT_PROFILE_ID)
  }
  if (ui$.editingProfileId.get() === profileId) {
    ui$.editingProfileId.set(null)
  }

  clearProfileData(profileId)
}
