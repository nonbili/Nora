import { autoProfiles$ } from '@/states/auto-profiles'
import { deleteProfileData } from './profile-data'

export const deleteAutoProfileData = (profileId: string) => {
  autoProfiles$.removeProfile(profileId)
  deleteProfileData(profileId)
}

export const deleteAutoProfilesData = (profileIds: string[]) => {
  profileIds.forEach((profileId) => {
    deleteAutoProfileData(profileId)
  })
}
