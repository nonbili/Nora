import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

export interface AutoProfile {
  id: string
  site: string
  createdAt: number
  lastUsedAt: number
}

interface Store {
  profiles: AutoProfile[]
  recordProfile: (id: string, site: string) => void
  removeProfile: (id: string) => void
}

const normalizeAutoProfiles = (profiles?: (AutoProfile | null | undefined)[]) => {
  const seen = new Set<string>()
  return (profiles || [])
    .filter((profile): profile is AutoProfile => Boolean(profile?.id && profile?.site))
    .filter((profile) => {
      if (seen.has(profile.id)) {
        return false
      }
      seen.add(profile.id)
      return true
    })
    .map((profile) => ({
      id: profile.id,
      site: profile.site,
      createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : Date.now(),
      lastUsedAt: typeof profile.lastUsedAt === 'number' ? profile.lastUsedAt : Date.now(),
    }))
}

export const autoProfiles$: Observable<Store> = observable<Store>({
  profiles: [],
  recordProfile: (id, site) => {
    if (!id || !site) {
      return
    }

    const now = Date.now()
    const profiles = autoProfiles$.profiles.get()
    const index = profiles.findIndex((profile) => profile.id === id)
    if (index === -1) {
      autoProfiles$.profiles.push({ id, site, createdAt: now, lastUsedAt: now })
      return
    }
    autoProfiles$.profiles[index].lastUsedAt.set(now)
  },
  removeProfile: (id) => {
    const index = autoProfiles$.profiles.get().findIndex((profile) => profile.id === id)
    if (index !== -1) {
      autoProfiles$.profiles.splice(index, 1)
    }
  },
})

syncObservable(autoProfiles$, {
  persist: {
    name: 'auto-profiles',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => {
        if (data?.profiles) {
          data.profiles = normalizeAutoProfiles(data.profiles)
        }
        return data
      },
    },
  },
})
