import { batch, observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { deleteProfilePosts, getUnreadPostKeys, importWatchPosts, trimWatchPosts, watchPostsVersion$ } from '@/lib/watch-db'
import {
  DEFAULT_POSTS_PER_SOURCE,
  DEFAULT_WATCH_INTERVAL_MINUTES,
  watchKey,
  type WatchPost,
  type WatchSite,
  type WatchSourceSort,
  type WatchTarget,
  type WatchTimeline,
} from '@/lib/watch'

export interface WatchedProfile {
  key: string
  site: WatchSite
  handle: string
  name?: string
  avatar?: string
  // The profile's page, when the site told it.
  url?: string
  addedAt: number
  notify: boolean
  // Minutes between checks for this profile; the default for all when not set.
  checkIntervalMinutes?: number
  // How the last check got through: with the cookies of a profile signed in to the site, or without.
  mode?: 'loggedIn' | 'loggedOut'
  // The Nora profile whose account the last check used.
  accountProfileId?: string
  // When a tab last showed its posts; the feed's own time for a profile not shown since there was one.
  seenAt?: number
  lastCheckedAt?: number
  lastSuccessAt?: number
  // Not checked again before this, after the site said to slow down or to log in.
  retryAfter?: number
  // The time of the newest post kept before a check that could not read back that far, as one
  // that cannot scroll: later checks read back to it, to find the posts made in between.
  reachBackTo?: number
  error?: string
}

interface Store {
  profiles: WatchedProfile[]
  // When a tab showed the whole feed, before each profile had a time of its own.
  feedSeenAt: number
  timelines: WatchTimeline[]
  // Minutes between checks of a profile that has no choice of its own.
  checkIntervalMinutes: number
  // Media of new posts is kept on the phone ahead of time only on Wi-Fi.
  mediaWifiOnly: boolean
  // How much kept media may take, in MB; the media of the oldest posts goes first.
  mediaLimitMB: number
  // How many of each source's latest posts are kept; older ones go.
  postsPerSource: number
  // How the list of sources to manage is ordered.
  sourcesSort: WatchSourceSort
  sourcesSortReversed: boolean
  // Whether sources are checked with the account of a Nora profile logged in to their site.
  useAccounts: boolean
  // The Nora profile to take each site's account from; any profile logged in to it when not set.
  accountProfiles: Partial<Record<WatchSite, string>>
  // Whether the whole feed shows only the posts with photos or videos, as a timeline can.
  feedMediaOnly: boolean

  isWatched: (target: WatchTarget) => boolean
  watch: (target: WatchTarget) => void
  unwatch: (key: string) => void
  setNotify: (key: string, notify: boolean) => void
  setProfileCheckInterval: (key: string, minutes: number | undefined) => void
  updateProfile: (key: string, patch: Partial<WatchedProfile>) => void
  // Unread posts of the whole feed.
  unreadCount: () => number
  // Marks the profiles a tab shows as read: one when it shows only that one.
  markFeedSeen: (timelineId?: string, profileKey?: string) => void
  createTimeline: (name: string, profileKeys: string[]) => string
  updateTimeline: (id: string, patch: Partial<Pick<WatchTimeline, 'name' | 'profileKeys' | 'pinned' | 'mediaOnly'>>) => void
  deleteTimeline: (id: string) => void
  setInTimeline: (id: string, profileKey: string, included: boolean) => void
}

const findIndex = (key: string) => watch$.profiles.peek().findIndex((profile) => profile.key === key)

const findTimelineIndex = (id: string) => watch$.timelines.peek().findIndex((timeline) => timeline.id === id)

export const watch$: Observable<Store> = observable<Store>({
  profiles: [],
  feedSeenAt: 0,
  timelines: [],
  checkIntervalMinutes: DEFAULT_WATCH_INTERVAL_MINUTES,
  mediaWifiOnly: true,
  mediaLimitMB: 1024,
  postsPerSource: DEFAULT_POSTS_PER_SOURCE,
  sourcesSort: 'name',
  sourcesSortReversed: false,
  useAccounts: true,
  accountProfiles: {},
  feedMediaOnly: false,

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
    deleteProfilePosts(key)
    watch$.timelines.peek().forEach((timeline, index) => {
      if (timeline.profileKeys.includes(key)) {
        watch$.timelines[index].profileKeys.set(timeline.profileKeys.filter((profileKey) => profileKey !== key))
      }
    })
  },

  setNotify: (key, notify) => watch$.updateProfile(key, { notify }),

  setProfileCheckInterval: (key, minutes) => watch$.updateProfile(key, { checkIntervalMinutes: minutes }),

  updateProfile: (key, patch) => {
    const index = findIndex(key)
    if (index !== -1) {
      watch$.profiles[index].assign(patch)
    }
  },

  unreadCount: () => unreadKeys().size,

  markFeedSeen: (timelineId, profileKey) => {
    const now = Date.now()
    const keys = new Set(profileKey ? [profileKey] : timelineProfileKeys(timelineId))
    batch(() => {
      watch$.profiles.peek().forEach((profile, index) => {
        if (keys.has(profile.key)) watch$.profiles[index].seenAt.set(now)
      })
    })
  },

  createTimeline: (name, profileKeys) => {
    const id = genId()
    watch$.timelines.push({ id, name: name.trim(), profileKeys })
    return id
  },

  updateTimeline: (id, patch) => {
    const index = findTimelineIndex(id)
    if (index !== -1) {
      watch$.timelines[index].assign(patch.name === undefined ? patch : { ...patch, name: patch.name.trim() })
    }
  },

  deleteTimeline: (id) => {
    const index = findTimelineIndex(id)
    if (index !== -1) {
      watch$.timelines.splice(index, 1)
    }
  },

  setInTimeline: (id, profileKey, included) => {
    const index = findTimelineIndex(id)
    if (index === -1) return
    const keys = watch$.timelines[index].profileKeys.peek().filter((key) => key !== profileKey)
    watch$.timelines[index].profileKeys.set(included ? [...keys, profileKey] : keys)
  },
})

/** A timeline that is still there; undefined for the whole feed, or one that was deleted. */
export const getTimeline = (timelineId: string | undefined) =>
  timelineId ? watch$.timelines.get().find((timeline) => timeline.id === timelineId) : undefined

/** Whether a timeline shows only the posts with photos or videos; the feed's own choice for the whole feed. */
export const isMediaOnly = (timelineId?: string) => {
  const timeline = getTimeline(timelineId)
  return timeline ? Boolean(timeline.mediaOnly) : watch$.feedMediaOnly.get()
}

/** The profiles a timeline shows, in the order they were watched; every profile for the whole feed. */
export const timelineProfileKeys = (timelineId?: string) => {
  const keys = watch$.profiles.get().map((profile) => profile.key)
  const timeline = getTimeline(timelineId)
  return timeline ? keys.filter((key) => timeline.profileKeys.includes(key)) : keys
}

export const unreadKeys = (timelineId?: string) => {
  // Counted again when the posts change, not only the profiles.
  watchPostsVersion$.get()
  const feedSeenAt = watch$.feedSeenAt.get()
  const seenAt = Object.fromEntries(watch$.profiles.get().map((profile) => [profile.key, profile.seenAt ?? feedSeenAt]))
  // A timeline of photos and videos counts only the posts it shows.
  return getUnreadPostKeys(timelineProfileKeys(timelineId), seenAt, feedSeenAt, isMediaOnly(timelineId))
}

syncObservable(watch$, {
  persist: {
    name: 'watch',
    plugin: ObservablePersistMMKV,
  },
})

// The posts were kept here, with the profiles, before they had a database of their own.
const legacyPosts = (watch$ as unknown as Observable<{ posts?: Record<string, WatchPost[] | undefined> }>).posts
if (legacyPosts.peek()) {
  importWatchPosts(legacyPosts.peek()!)
  legacyPosts.delete()
}

// Fewer kept takes the oldest away now, not only when each source is checked again.
watch$.postsPerSource.onChange(({ value }) => trimWatchPosts(value))
