import { settings$, type Profile } from '@/states/settings'

export const getProfileColor = (profileId?: string) => {
  const profiles = settings$.profiles.get() as Array<Profile | null | undefined> | undefined
  const sanitized = (profiles || []).filter((p): p is Profile => p != null)
  if (!sanitized.length) {
    return undefined
  }
  const defaultProfile = sanitized.find((p) => p.id === 'default') || sanitized[0]
  const activeProfile = sanitized.find((p) => p.id === (profileId || defaultProfile.id))
  return activeProfile?.color || defaultProfile.color
}
