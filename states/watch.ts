import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { DEFAULT_WATCH_INTERVAL_MINUTES, watchKey, type WatchPost, type WatchSite, type WatchTarget } from '@/lib/watch'

export interface WatchedProfile {
  key: string
  site: WatchSite
  handle: string
  name?: string
  avatar?: string
  addedAt: number
  notify: boolean
  // Minutes between checks for this profile; the default for all when not set.
  checkIntervalMinutes?: number
  // How the last check got through: with the cookies of a profile signed in to the site, or without.
  mode?: 'loggedIn' | 'loggedOut'
  lastCheckedAt?: number
  lastSuccessAt?: number
  // Not checked again before this, after the site said to slow down or to log in.
  retryAfter?: number
  error?: string
}

interface Store {
  profiles: WatchedProfile[]
  posts: Record<string, WatchPost[]>
  // Posts first seen after this are shown as unread.
  feedSeenAt: number
  // Minutes between checks of a profile that has no choice of its own.
  checkIntervalMinutes: number
  // Media of new posts is kept on the phone ahead of time only on Wi-Fi.
  mediaWifiOnly: boolean
  // How much kept media may take, in MB; the media of the oldest posts goes first.
  mediaLimitMB: number

  isWatched: (target: WatchTarget) => boolean
  watch: (target: WatchTarget) => void
  unwatch: (key: string) => void
  setNotify: (key: string, notify: boolean) => void
  setProfileCheckInterval: (key: string, minutes: number | undefined) => void
  updateProfile: (key: string, patch: Partial<WatchedProfile>) => void
  unreadCount: () => number
  markFeedSeen: () => void
}

const findIndex = (key: string) => watch$.profiles.peek().findIndex((profile) => profile.key === key)

export const watch$: Observable<Store> = observable<Store>({
  profiles: [],
  posts: {},
  feedSeenAt: 0,
  checkIntervalMinutes: DEFAULT_WATCH_INTERVAL_MINUTES,
  mediaWifiOnly: true,
  mediaLimitMB: 1024,

  isWatched: (target) => watch$.profiles.get().some((profile) => profile.key === watchKey(target)),

  watch: (target) => {
    const key = watchKey(target)
    if (findIndex(key) !== -1) {
      return
    }
    watch$.profiles.push({ key, site: target.site, handle: target.handle, addedAt: Date.now(), notify: false })
  },

  unwatch: (key) => {
    const index = findIndex(key)
    if (index !== -1) {
      watch$.profiles.splice(index, 1)
    }
    watch$.posts[key].delete()
  },

  setNotify: (key, notify) => watch$.updateProfile(key, { notify }),

  setProfileCheckInterval: (key, minutes) => watch$.updateProfile(key, { checkIntervalMinutes: minutes }),

  updateProfile: (key, patch) => {
    const index = findIndex(key)
    if (index !== -1) {
      watch$.profiles[index].assign(patch)
    }
  },

  unreadCount: () => {
    const seenAt = watch$.feedSeenAt.get()
    // A post two watched profiles share is in both lists, and shown once.
    const unread = new Set<string>()
    for (const posts of Object.values(watch$.posts.get())) {
      for (const post of posts || []) {
        if (post.firstSeenAt > seenAt) unread.add(post.key)
      }
    }
    return unread.size
  },

  markFeedSeen: () => watch$.feedSeenAt.set(Date.now()),
})

syncObservable(watch$, {
  persist: {
    name: 'watch',
    plugin: ObservablePersistMMKV,
  },
})
