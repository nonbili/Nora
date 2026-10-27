import { batch, observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { deleteProfilePosts, getUnreadPostKeys, importWatchPosts, trimWatchPosts, watchPostsVersion$ } from '@/lib/watch-db'
import {
  DEFAULT_POSTS_PER_SOURCE,
  DEFAULT_TIMELINE_EMOJI,
  DEFAULT_WATCH_INTERVAL_MINUTES,
  watchKey,
  type WatchPost,
  type WatchSite,
  type WatchSourceSort,
  type WatchTarget,
  type TimelineIntervals,
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
  // Whether its new posts notify; as its timeline, or else the whole feed, chooses when not set. Of this device.
  notify?: boolean
  // The one timeline it is in; only in the whole feed when not set, or when that timeline is gone.
  timelineId?: string
  // Minutes between checks for this profile; its timeline's, or the default for all, when not set.
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

export type ImginnMode = 'off' | 'fallback' | 'first'

interface Store {
  profiles: WatchedProfile[]
  // When a tab showed the whole feed, before each profile had a time of its own.
  feedSeenAt: number
  timelines: WatchTimeline[]
  // Whether the whole feed is shown on the new tab page, as a pinned timeline is.
  feedPinned: boolean
  // Its icon there; empty for the default.
  feedEmoji: string
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
  // Whether Instagram profiles are read from imginn, while Nora is open: when Instagram does not
  // show them, or first, and from Instagram when imginn does not.
  imginnMode: ImginnMode
  // Whether the whole feed shows only the posts with photos or videos, as a timeline can.
  feedMediaOnly: boolean
  // Whether the sources of each timeline notify of new posts, unless one chooses otherwise; as the whole
  // feed does for a timeline not here. Of this device, as a source's own choice is: not synced.
  timelineNotify: Record<string, boolean>
  // Whether the sources notify, unless their timeline or they choose otherwise; of this device too.
  feedNotify: boolean
  // The sites the hint about checking without logging in was closed for; it comes back for another site.
  loginHintDismissedSites: WatchSite[]

  isWatched: (target: WatchTarget) => boolean
  watch: (target: WatchTarget) => void
  unwatch: (key: string) => void
  // undefined for its timeline's choice, or the whole feed's.
  setNotify: (key: string, notify: boolean | undefined) => void
  setProfileCheckInterval: (key: string, minutes: number | undefined) => void
  updateProfile: (key: string, patch: Partial<WatchedProfile>) => void
  // Unread posts of the whole feed.
  unreadCount: () => number
  // Marks the profiles a tab shows as read: one when it shows only that one.
  markFeedSeen: (timelineId?: string, profileKey?: string) => void
  // Makes a timeline and moves the profiles into it, out of the one each was in.
  createTimeline: (name: string, profileKeys: string[]) => string
  updateTimeline: (id: string, patch: Partial<Pick<WatchTimeline, 'name' | 'pinned' | 'mediaOnly' | 'emoji' | 'checkIntervalMinutes'>>) => void
  deleteTimeline: (id: string) => void
  // Moves a profile into a timeline, or out of any for undefined.
  setProfileTimeline: (profileKey: string, timelineId: string | undefined) => void
  // The profiles of a timeline become these: each moved in from where it was, and the others moved out.
  setTimelineProfiles: (id: string, profileKeys: string[]) => void
  // undefined for the whole feed's choice.
  setTimelineNotify: (id: string, notify: boolean | undefined) => void
}

const findIndex = (key: string) => watch$.profiles.peek().findIndex((profile) => profile.key === key)

const findTimelineIndex = (id: string) => watch$.timelines.peek().findIndex((timeline) => timeline.id === id)

export const watch$: Observable<Store> = observable<Store>({
  profiles: [],
  feedSeenAt: 0,
  timelines: [],
  feedPinned: true,
  feedEmoji: '',
  checkIntervalMinutes: DEFAULT_WATCH_INTERVAL_MINUTES,
  mediaWifiOnly: true,
  mediaLimitMB: 1024,
  postsPerSource: DEFAULT_POSTS_PER_SOURCE,
  sourcesSort: 'name',
  sourcesSortReversed: false,
  useAccounts: true,
  accountProfiles: {},
  imginnMode: 'off',
  feedMediaOnly: false,
  timelineNotify: {},
  feedNotify: false,
  loginHintDismissedSites: [],

  isWatched: (target) => watch$.profiles.get().some((profile) => profile.key === watchKey(target)),

  watch: (target) => {
    const key = watchKey(target)
    if (findIndex(key) !== -1) {
      return
    }
    watch$.profiles.push({ key, site: target.site, handle: target.handle, addedAt: Date.now() })
  },

  unwatch: (key) => {
    const index = findIndex(key)
    if (index !== -1) {
      watch$.profiles.splice(index, 1)
    }
    deleteProfilePosts(key)
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
    batch(() => {
      watch$.timelines.push({ id, name: name.trim() })
      for (const key of profileKeys) watch$.setProfileTimeline(key, id)
    })
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
    batch(() => {
      if (index !== -1) {
        watch$.timelines.splice(index, 1)
      }
      // Its profiles stay watched, in the whole feed only.
      watch$.setTimelineProfiles(id, [])
    })
    watch$.setTimelineNotify(id, undefined)
  },

  setProfileTimeline: (profileKey, timelineId) => {
    const index = findIndex(profileKey)
    if (index !== -1 && watch$.profiles[index].timelineId.peek() !== timelineId) {
      watch$.profiles[index].timelineId.set(timelineId)
    }
  },

  setTimelineProfiles: (id, profileKeys) => {
    const keys = new Set(profileKeys)
    batch(() => {
      watch$.profiles.peek().forEach((profile) => {
        if (keys.has(profile.key)) watch$.setProfileTimeline(profile.key, id)
        else if (profile.timelineId === id) watch$.setProfileTimeline(profile.key, undefined)
      })
    })
  },

  setTimelineNotify: (id, notify) => {
    if (notify === undefined) watch$.timelineNotify[id].delete()
    else watch$.timelineNotify[id].set(notify)
  },
})

/** A timeline that is still there; undefined for the whole feed, or one that was deleted. */
export const getTimeline = (timelineId: string | undefined) =>
  timelineId ? watch$.timelines.get().find((timeline) => timeline.id === timelineId) : undefined

/** Whether a timeline notifies of new posts, and whether that is its own choice or the whole feed's. */
export const timelineNotifyChoice = (timelineId: string | undefined) => {
  const own = timelineId ? watch$.timelineNotify[timelineId].get() : undefined
  return own === undefined ? { notify: watch$.feedNotify.get(), own: false } : { notify: own, own: true }
}

/**
 * Whether new posts of a profile notify, and whose choice that is: its own, else its timeline's, else
 * the whole feed's. A timeline deleted on another device counts as none.
 */
export const notifyChoice = (profile: Pick<WatchedProfile, 'notify' | 'timelineId'>) => {
  const timeline = getTimeline(profile.timelineId)
  if (profile.notify !== undefined) return { notify: profile.notify, from: 'source' as const }
  const ofTimeline = timelineNotifyChoice(timeline?.id)
  return ofTimeline.own && timeline
    ? { notify: ofTimeline.notify, from: 'timeline' as const, timeline }
    : { notify: ofTimeline.notify, from: 'feed' as const }
}

/** Whether new posts of a profile notify. */
export const profileNotifies = (profile: Pick<WatchedProfile, 'notify' | 'timelineId'>) => notifyChoice(profile).notify

/** The interval each timeline chose, by its id, for watchIntervalMinutes. */
export const timelineIntervals = (): TimelineIntervals =>
  Object.fromEntries(watch$.timelines.peek().map((timeline) => [timeline.id, timeline.checkIntervalMinutes]))

/** The interval a profile that has no choice of its own takes, and the timeline it is from; none for the one for all. */
export const inheritedInterval = (profile: Pick<WatchedProfile, 'timelineId'>) => {
  const timeline = getTimeline(profile.timelineId)
  return timeline?.checkIntervalMinutes
    ? { minutes: timeline.checkIntervalMinutes, timeline }
    : { minutes: watch$.checkIntervalMinutes.get(), timeline: undefined }
}

/** The emoji of a timeline, or of the whole feed; the default one when none was chosen. */
export const timelineEmoji = (timelineId?: string) =>
  (timelineId ? getTimeline(timelineId)?.emoji : watch$.feedEmoji.get()) || DEFAULT_TIMELINE_EMOJI

/** Whether a timeline shows only the posts with photos or videos; the feed's own choice for the whole feed. */
export const isMediaOnly = (timelineId?: string) => {
  const timeline = getTimeline(timelineId)
  return timeline ? Boolean(timeline.mediaOnly) : watch$.feedMediaOnly.get()
}

/** The profiles a timeline shows, in the order they were watched; every profile for the whole feed. */
export const timelineProfileKeys = (timelineId?: string) => {
  const timeline = getTimeline(timelineId)
  const profiles = watch$.profiles.get()
  return (timeline ? profiles.filter((profile) => profile.timelineId === timeline.id) : profiles).map((profile) => profile.key)
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
