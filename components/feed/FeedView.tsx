import { ActivityIndicator, BackHandler, FlatList, Pressable, ScrollView, View, useColorScheme, type LayoutRectangle, type ScrollViewInstance } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { NouButton } from '../button/NouButton'
import { NouSwitch } from '../switch/NouSwitch'
import { ui$ } from '@/states/ui'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { getTimeline, unreadKeys, watch$, type WatchedProfile } from '@/states/watch'
import {
  WATCH_INTERVAL_OPTIONS,
  feedChipSources,
  formatPostAge,
  mediaKey,
  refreshesMedia,
  splitInterval,
  watchKey,
  watchProfileUrl,
  watchSiteLabels,
  watchSourceLabel,
  type WatchPost,
  type WatchSite,
} from '@/lib/watch'
import { NouMenu } from '../menu/NouMenu'
import { siteIcon } from '../service/Services'
import {
  WATCH_ERROR_NEEDS_LOGIN,
  WATCH_ERROR_RATE_LIMITED,
  enableWatchNotifications,
  refreshWatched,
} from '@/lib/watch-feed'
import { getFeedPosts, getNewestPostTimes, getProfilesWithPosts } from '@/lib/watch-db'
import { useWatchPosts } from '@/lib/use-watch-posts'
import { clsx } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { confirmDestructiveAction } from '@/lib/confirm'
import { useTwColor } from '@/lib/theme'
import { share } from '@/lib/share'
import { ensurePostMedia, keptMediaUri, saveWatchPostMedia, savesToDownloads, watchMedia$ } from '@/lib/watch-media'
import { feedTabActions, feedTabUrl } from '@/lib/feed-tab'
import { openFeedTab } from '@/lib/page'

// Enough chips to reach the sources most likely wanted; the rest are found in the list of them all.
const CHIP_LIMIT = 12
// Posts read at a time, and more each time the list is scrolled to its end.
const FEED_PAGE_SIZE = 100

const intervalKeys = { minutes: 'feed.intervalMinutes', hours: 'feed.intervalHours', days: 'feed.intervalDays' } as const

export const formatInterval = (minutes: number) => {
  const { unit, count } = splitInterval(minutes)
  return t(intervalKeys[unit], { count })
}

/** A row with a value and a menu to choose another. */
export const ChoicePicker: React.FC<{
  label: string
  value: string
  options: { label: string; minutes: number | undefined }[]
  onSelect: (minutes: number | undefined) => void
  iconColor: string
}> = ({ label, value, options, onSelect, iconColor }) => (
  <View className="flex-row items-center justify-between gap-3">
    <NouText className="font-medium">{label}</NouText>
    <NouMenu
      trigger={
        <View className="h-9 flex-row items-center gap-1 rounded-full border border-zinc-300 pl-3 pr-2 dark:border-zinc-700">
          <NouText className="text-sm">{value}</NouText>
          <MaterialIcons name="arrow-drop-down" size={18} color={iconColor} />
        </View>
      }
      items={options.map((option) => ({ label: option.label, handler: () => onSelect(option.minutes) }))}
    />
  </View>
)

/** What to tell about how a profile is being checked; null when all is well. */
export const profileStatus = (profile: WatchedProfile): { text: string; warn: boolean } | null => {
  const site = watchSiteLabels[profile.site]
  const useAccounts = watch$.useAccounts.peek()
  const chosen = watch$.accountProfiles[profile.site].peek()
  const profileName = (id?: string) => settings$.profiles.peek().find((p) => p?.id === id)?.name
  if (profile.error === WATCH_ERROR_NEEDS_LOGIN) {
    return { text: t(useAccounts ? 'feed.statusNeedsLogin' : 'feed.statusNeedsLoginAccountsOff', { site }), warn: true }
  }
  if (profile.error === WATCH_ERROR_RATE_LIMITED) return { text: t('feed.statusRateLimited', { site }), warn: true }
  if (profile.error) return { text: t('feed.statusFailed', { error: profile.error }), warn: true }
  if (profile.mode === 'loggedOut') {
    if (!useAccounts) return { text: t('feed.statusAccountsOff'), warn: false }
    const chosenName = profileName(chosen)
    if (chosenName) return { text: t('feed.statusLoggedOutInProfile', { site, profile: chosenName }), warn: false }
    return { text: t('feed.statusLoggedOut', { site }), warn: false }
  }
  if (profile.mode === 'loggedIn') {
    const name = profileName(profile.accountProfileId)
    if (name) return { text: t('feed.statusLoggedIn', { site, profile: name }), warn: false }
  }
  if (!profile.lastCheckedAt) return { text: t('feed.statusPending'), warn: false }
  return null
}

// The service icons are drawn at 24px.
const SERVICE_ICON_SIZE = 24

/** A profile's picture, with the icon of its site at its corner: the same handle can be on both. */
export const Avatar: React.FC<{ uri?: string; size: number; site: WatchSite }> = ({ uri, size, site }) => {
  const badge = Math.round(size * 0.4)
  return (
    <View style={{ width: size, height: size }}>
      {/* Pictures with a clear background, as many subreddit icons, still fill a circle. */}
      <View className="overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700" style={{ width: size, height: size }}>
        {uri ? <Image source={uri} contentFit="cover" style={{ width: size, height: size }} /> : null}
      </View>
      <View
        className="absolute items-center justify-center overflow-hidden rounded-full bg-white"
        style={{ width: badge + 3, height: badge + 3, right: -3, bottom: -3 }}
      >
        <View style={{ transform: [{ scale: badge / SERVICE_ICON_SIZE }] }}>{siteIcon(site)}</View>
      </View>
    </View>
  )
}

/** The first photo or video of a post, with how many more there are; opens the gallery. */
const PostMedia: React.FC<{ post: WatchPost; onOpen: () => void }> = ({ post, onOpen }) => {
  const first = post.media?.[0]
  const kept = useValue(watchMedia$.files[mediaKey(post.key, 0)])
  const keptUri = first?.type === 'image' ? keptMediaUri(kept) : undefined
  // The cover each check of the profile brings anew comes before the media's own addresses, which
  // are kept from when the post was read and can have expired since.
  const [coverFailed, setCoverFailed] = useState(false)
  const remote = coverFailed ? first?.thumb || first?.url : post.image || first?.thumb || first?.url
  const source = keptUri || remote
  const onError = () => {
    if (coverFailed) return
    setCoverFailed(true)
    // A cover that no longer loads either: the post is read again for new addresses, once.
    if (refreshesMedia(post.site)) ensurePostMedia(post, { force: true }).catch(() => {})
  }
  if (!source) return null
  const width = first?.width
  const height = first?.height
  // As the photo is, within what a feed shows well; a square when its size is not known.
  const aspectRatio = width && height ? Math.min(Math.max(width / height, 0.8), 1.91) : post.site === 'instagram' ? 1 : 16 / 9
  return (
    <Pressable onPress={onOpen} className="mt-2" accessibilityRole="imagebutton">
      <Image
        source={source}
        onError={onError}
        contentFit="cover"
        className="rounded-xl bg-zinc-200 dark:bg-zinc-800"
        style={{ width: '100%', aspectRatio, borderRadius: 12 }}
      />
      {first?.type === 'video' ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
            <MaterialIcons name="play-arrow" size={30} color="#fff" />
          </View>
        </View>
      ) : null}
      {(post.media?.length || 0) > 1 ? (
        <View className="absolute right-2 top-2 flex-row items-center gap-1 rounded-full bg-black/60 px-2 py-0.5" pointerEvents="none">
          <MaterialIcons name="collections" size={12} color="#fff" />
          <NouText className="text-xs text-white">{post.media?.length}</NouText>
        </View>
      ) : null}
    </Pressable>
  )
}

/** Whether a name says no more than the handle beside it, as a subreddit's does. */
const sameAsName = (name: string, handle: string) => name.replace(/^@/, '').toLowerCase() === handle.replace(/^@/, '').toLowerCase()

const PostRow: React.FC<{
  post: WatchPost
  profile?: WatchedProfile
  unread: boolean
  now: number
  iconColor: string
  onOpenOriginal: () => void
}> = ({ post, profile, unread, now, iconColor, onOpenOriginal }) => {
  const [expanded, setExpanded] = useState(false)
  const name = profile?.name || post.handle
  const source = watchSourceLabel(post)

  const save = async () => {
    try {
      const saved = await saveWatchPostMedia(post)
      // The share sheet tells for itself what became of the files.
      if (!saved) showToast(t('feed.mediaSaveFailed'))
      else if (savesToDownloads) showToast(t('feed.mediaSaved', { count: saved }))
    } catch {
      showToast(t('feed.mediaSaveFailed'))
    }
  }

  return (
    <View className="flex-row gap-3 py-3 pl-4 pr-1">
      <Avatar uri={profile?.avatar} size={36} site={post.site} />
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <NouText className="shrink font-semibold" numberOfLines={1}>
            {name}
          </NouText>
          <NouText className="shrink text-sm text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
            {sameAsName(name, source) ? '' : `${source} · `}
            {formatPostAge(post.createdAtMs, now)}
          </NouText>
          {unread ? <View className="h-2 w-2 rounded-full bg-indigo-500" /> : null}
          <View className="ml-auto">
            <NouMenu
              trigger={
                <View className="h-8 w-8 items-center justify-center">
                  <MaterialIcons name="more-vert" size={18} color={iconColor} />
                </View>
              }
              items={[
                ...(post.media?.length ? [{ label: t('feed.saveMedia'), handler: () => void save() }] : []),
                { label: t('menus.share'), handler: () => share(post.url) },
                { label: t('feed.openOn', { site: watchSiteLabels[post.site] }), handler: onOpenOriginal },
              ]}
            />
          </View>
        </View>
        {post.repostOf ? (
          <NouText className="text-xs text-zinc-600 dark:text-zinc-400">{t('feed.repostOf', { handle: post.repostOf })}</NouText>
        ) : null}
        {post.text ? (
          <Pressable onPress={() => setExpanded((value) => !value)} className="pr-3">
            <NouText className="mt-1 leading-5" numberOfLines={expanded ? undefined : 8}>
              {post.text}
            </NouText>
          </Pressable>
        ) : null}
        <View className="pr-3">
          <PostMedia
            post={post}
            // A cover alone, of a link or of what the feed does not have, as a Reddit video: the post opens.
            // Media still to be read, as of an Instagram post, is read by the gallery.
            onOpen={() =>
              post.media?.length || post.mediaComplete === false
                ? ui$.feedGallery.set({ postKey: post.key, profileKey: watchKey(post), index: 0 })
                : onOpenOriginal()
            }
          />
        </View>
      </View>
    </View>
  )
}

/** The posts of the watched profiles, or of a timeline of them, newest first, as a feed tab shows them. */
export const FeedView: React.FC<{
  tabId: string
  timelineId?: string
  // On screen, which side by side tabs can be without being the one in focus.
  active: boolean
  focused: boolean
}> = ({ tabId, timelineId, active, focused }) => {
  const tw = useTwColor()
  const isDark = useColorScheme() === 'dark'
  const allProfiles = useValue(watch$.profiles)
  const timelines = useValue(watch$.timelines)
  const timeline = useValue(() => getTimeline(timelineId))
  const defaultInterval = useValue(watch$.checkIntervalMinutes)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // What was unread when the tab was switched to stays marked while it is shown, as does what comes in since.
  const [unreadOnShow, setUnreadOnShow] = useState<{ keys: Set<string>; at: number }>(() => ({ keys: new Set(), at: 0 }))
  const [now, setNow] = useState(() => Date.now())
  const listRef = useRef<FlatList<WatchPost>>(null)
  // The profiles a refresh by hand asks for: the one shown, those of the timeline, or all.
  const shownKeysRef = useRef<string[] | undefined>(undefined)

  const refresh = useCallback(async (source: 'foreground' | 'manual') => {
    setRefreshing(true)
    try {
      await refreshWatched(source, source === 'manual' ? shownKeysRef.current : undefined)
    } finally {
      setRefreshing(false)
      setNow(Date.now())
    }
  }, [])

  const shownTimelineId = timeline?.id
  const picked = useValue(ui$.feedSelection)

  // A source picked from the list of them all, for this tab.
  useEffect(() => {
    if (picked?.tabId !== tabId) return
    setSelectedKey(picked.profileKey)
    ui$.feedSelection.set(null)
  }, [picked, tabId])

  const chipsRef = useRef<ScrollViewInstance>(null)
  const chipLayouts = useRef(new Map<string, LayoutRectangle>())
  const chipsView = useRef({ offset: 0, width: 0 })
  // The chip of a source just shown, to scroll to once it is laid out, if it is not in view.
  const chipToReveal = useRef<string | null>(null)
  const revealChip = (key: string) => {
    const layout = chipLayouts.current.get(key)
    if (!layout) return
    chipToReveal.current = null
    const { offset, width } = chipsView.current
    if (layout.x >= offset && layout.x + layout.width <= offset + width) return
    chipsRef.current?.scrollTo({ x: Math.max(0, layout.x - 16), animated: true })
  }

  useEffect(() => {
    setSelectedKey(null)
  }, [shownTimelineId])

  useEffect(() => {
    if (!active) return
    // The tab comes back to the whole timeline, which is what is marked read.
    setSelectedKey(null)
    setUnreadOnShow({ keys: unreadKeys(shownTimelineId), at: Date.now() })
    setNow(Date.now())
    watch$.markFeedSeen(shownTimelineId)
    void refresh('foreground')
  }, [active, shownTimelineId, refresh])

  useEffect(() => {
    feedTabActions.set(tabId, {
      refresh: () => void refresh('manual'),
      scrollToTop: () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
    })
    return () => {
      feedTabActions.delete(tabId)
    }
  }, [tabId, refresh])

  // Not memoized: the store changes its arrays in place, so they keep their identity across changes.
  const profiles = timeline ? allProfiles.filter((profile) => timeline.profileKeys.includes(profile.key)) : allProfiles
  const profileByKey = new Map(allProfiles.map((profile) => [profile.key, profile]))
  // A profile taken out of the timeline is no longer the one shown.
  const selected = selectedKey ? profiles.find((profile) => profile.key === selectedKey) : undefined
  const hasSelection = Boolean(selected)
  useEffect(() => {
    if (!selectedKey) return
    chipToReveal.current = selectedKey
    revealChip(selectedKey)
  }, [selectedKey])
  const shownProfileKey = selected?.key
  const shownKeys = selected ? [selected.key] : timeline ? profiles.map((profile) => profile.key) : undefined
  useEffect(() => {
    shownKeysRef.current = shownKeys
  })

  // What was shown is read once it gives way: to another profile, the whole timeline, or another tab.
  useEffect(() => {
    if (!active) return
    return () => watch$.markFeedSeen(shownTimelineId, shownProfileKey)
  }, [active, shownTimelineId, shownProfileKey])

  // Back leaves a profile for the whole feed before it leaves the tab.
  useEffect(() => {
    if (!focused || !hasSelection) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedKey(null)
      return true
    })
    return () => subscription.remove()
  }, [focused, hasSelection])

  const isUnread = (post: WatchPost) =>
    unreadOnShow.keys.has(post.key) || (unreadOnShow.at > 0 && post.firstSeenAt > unreadOnShow.at)

  // How many posts the view has scrolled through; a view shown again starts at the first page.
  const postProfileKeys = selected ? [selected.key] : profiles.map((profile) => profile.key)
  const view = postProfileKeys.join('\n')
  const [page, setPage] = useState({ view, limit: FEED_PAGE_SIZE })
  const limit = page.view === view ? page.limit : FEED_PAGE_SIZE
  const posts = useWatchPosts(() => getFeedPosts(postProfileKeys, limit), `${limit}\n${view}`)
  const showMore = () => {
    if (posts.length >= limit) setPage({ view, limit: limit + FEED_PAGE_SIZE })
  }

  // Sites that some profile is checked on without an account, and so less reliably; not told when
  // the user turned accounts off.
  const useAccounts = useValue(watch$.useAccounts)
  const loggedOutSites = useAccounts
    ? Array.from(
        new Set(profiles.filter((profile) => profile.mode === 'loggedOut' || profile.error === WATCH_ERROR_NEEDS_LOGIN).map((p) => p.site)),
      )
    : []

  const iconColor = isDark ? tw('#f8fafc') : tw('#334155')

  // Back in the opened tab comes back to the feed.
  const openUrl = (url: string) => tabs$.openTab(url, { source: 'child', parentTabId: tabId })

  const showTimeline = (id?: string) => {
    const index = tabs$.tabs.peek().findIndex((tab) => tab?.id === tabId)
    if (index !== -1) tabs$.tabs[index].url.set(feedTabUrl(id))
  }

  const unreadLabel = (id?: string) => {
    const count = unreadKeys(id).size
    return count ? String(count) : undefined
  }

  const timelineMenuItems = [
    {
      label: t('feed.label'),
      icon: <MaterialIcons name={timeline ? 'dynamic-feed' : 'check'} size={18} color={iconColor} />,
      systemImage: timeline ? undefined : 'checkmark',
      metaLabel: unreadLabel(),
      handler: () => showTimeline(),
    },
    ...timelines.map((current) => ({
      label: current.name,
      icon: <MaterialIcons name={current.id === timeline?.id ? 'check' : 'view-list'} size={18} color={iconColor} />,
      systemImage: current.id === timeline?.id ? 'checkmark' : undefined,
      metaLabel: unreadLabel(current.id),
      handler: () => showTimeline(current.id),
    })),
    { label: '', handler: () => {}, kind: 'separator' as const },
    {
      label: t('feed.newTimeline'),
      icon: <MaterialIcons name="playlist-add" size={18} color={iconColor} />,
      systemImage: 'plus',
      handler: () => ui$.timelineModal.set({ tabId }),
    },
    ...(timeline
      ? [
          {
            label: t('feed.editTimeline'),
            icon: <MaterialIcons name="edit" size={18} color={iconColor} />,
            systemImage: 'pencil',
            handler: () => ui$.timelineModal.set({ timelineId: timeline.id, tabId }),
          },
          {
            label: timeline.pinned ? t('feed.unpinFromNewTab') : t('feed.pinToNewTab'),
            icon: <MaterialIcons name="push-pin" size={18} color={iconColor} />,
            systemImage: timeline.pinned ? 'pin.slash' : 'pin',
            handler: () => watch$.updateTimeline(timeline.id, { pinned: !timeline.pinned }),
          },
        ]
      : []),
    {
      label: t('feed.manageSources'),
      icon: <MaterialIcons name="manage-accounts" size={18} color={iconColor} />,
      systemImage: 'person.2',
      handler: () => ui$.sourcesModal.set({ tabId }),
    },
    {
      label: t('feed.addSources'),
      icon: <MaterialIcons name="add-link" size={18} color={iconColor} />,
      systemImage: 'link.badge.plus',
      handler: () => ui$.addSourcesModal.set({ timelineId: timeline?.id }),
    },
    {
      label: t('feed.settings'),
      icon: <MaterialIcons name="tune" size={18} color={iconColor} />,
      systemImage: 'slider.horizontal.3',
      handler: () => ui$.feedSettingsModalOpen.set(true),
    },
    {
      label: t('feed.openInNewTab'),
      icon: <MaterialIcons name="open-in-new" size={18} color={iconColor} />,
      systemImage: 'plus.square.on.square',
      handler: () => openFeedTab(timeline?.id, true),
    },
  ]

  const toggleNotify = async (profile: WatchedProfile) => {
    if (profile.notify) {
      watch$.setNotify(profile.key, false)
      return
    }
    if (!(await enableWatchNotifications(profile.key))) {
      showToast(t('feed.notificationPermissionDenied'))
    }
  }

  const unwatch = (profile: WatchedProfile) => {
    confirmDestructiveAction(t('feed.unwatch'), t('feed.unwatchConfirm', { handle: profile.handle, source: watchSourceLabel(profile), interpolation: { escapeValue: false } }), t('feed.unwatch'), () => {
      setSelectedKey(null)
      watch$.unwatch(profile.key)
    })
  }

  const selectedStatus = selected ? profileStatus(selected) : null

  const newestPostAt = useWatchPosts(getNewestPostTimes)
  const unreadSourceKeys = useWatchPosts(() => getProfilesWithPosts(unreadOnShow.keys, unreadOnShow.at), unreadOnShow)
  const chips = feedChipSources(profiles, newestPostAt, unreadSourceKeys, CHIP_LIMIT, selected?.key)

  // Handles that are on more than one site, whose chips also tell the site.
  const handleCounts = new Map<string, number>()
  for (const profile of profiles) {
    const handle = profile.handle.toLowerCase()
    handleCounts.set(handle, (handleCounts.get(handle) || 0) + 1)
  }
  const sharedHandles = new Set([...handleCounts].filter(([, count]) => count > 1).map(([handle]) => handle))

  const header = (
    <View>
      {profiles.length ? (
        <ScrollView
          ref={chipsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 pb-3"
          onLayout={(e) => (chipsView.current.width = e.nativeEvent.layout.width)}
          onScroll={(e) => (chipsView.current.offset = e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={64}
        >
          {[undefined, ...chips.shown].map((profile) => {
            const active = (profile?.key ?? null) === (selected?.key ?? null)
            const status = profile ? profileStatus(profile) : null
            return (
              <Pressable
                key={profile?.key ?? 'all'}
                onPress={() => setSelectedKey(profile?.key ?? null)}
                onLayout={(e) => {
                  if (!profile) return
                  chipLayouts.current.set(profile.key, e.nativeEvent.layout)
                  if (chipToReveal.current === profile.key) revealChip(profile.key)
                }}
                className={clsx(
                  'h-9 flex-row items-center gap-1.5 rounded-full border px-3',
                  active
                    ? 'border-indigo-300 bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/20'
                    : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900',
                )}
              >
                {profile ? <Avatar uri={profile.avatar} size={22} site={profile.site} /> : null}
                <NouText className="text-sm">{profile ? watchSourceLabel(profile) : t('feed.all')}</NouText>
                {profile && sharedHandles.has(profile.handle.toLowerCase()) ? (
                  <NouText className="text-xs text-zinc-500 dark:text-zinc-400">{watchSiteLabels[profile.site]}</NouText>
                ) : null}
                {status?.warn ? <View className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
              </Pressable>
            )
          })}
          {chips.hidden ? (
            <Pressable
              onPress={() => ui$.sourcesModal.set({ tabId, timelineId: timeline?.id, pick: true })}
              accessibilityRole="button"
              accessibilityLabel={t('feed.chooseSource')}
              className="h-9 flex-row items-center gap-1 rounded-full border border-dashed border-zinc-300 pl-3 pr-2 dark:border-zinc-700"
            >
              <NouText className="text-sm">{t('feed.moreSources', { count: chips.hidden })}</NouText>
              <MaterialIcons name="chevron-right" size={18} color={iconColor} />
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      {selected ? (
        <View className="mx-4 mb-3 gap-3 rounded-2xl bg-white px-4 py-3 dark:bg-zinc-900">
          <Pressable onPress={() => openUrl(watchProfileUrl(selected))} className="flex-row items-center gap-3">
            <Avatar uri={selected.avatar} size={40} site={selected.site} />
            <View className="flex-1">
              <NouText className="font-semibold" numberOfLines={1}>
                {selected.name || selected.handle}
              </NouText>
              <NouText className="text-sm text-zinc-600 dark:text-zinc-400">
                {watchSourceLabel(selected)} · {watchSiteLabels[selected.site]}
              </NouText>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={iconColor} />
          </Pressable>
          {selectedStatus ? (
            <NouText className={clsx('text-sm', selectedStatus.warn ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400')}>
              {selectedStatus.text}
            </NouText>
          ) : null}
          <ChoicePicker
            label={t('feed.checkEvery')}
            value={selected.checkIntervalMinutes ? formatInterval(selected.checkIntervalMinutes) : t('feed.intervalDefault', { interval: formatInterval(defaultInterval) })}
            options={[
              { label: t('feed.intervalDefault', { interval: formatInterval(defaultInterval) }), minutes: undefined },
              ...WATCH_INTERVAL_OPTIONS.map((minutes) => ({ label: formatInterval(minutes), minutes })),
            ]}
            onSelect={(minutes) => watch$.setProfileCheckInterval(selected.key, minutes)}
            iconColor={iconColor}
          />
          <NouSwitch label={t('feed.notify')} value={selected.notify} onPress={() => void toggleNotify(selected)} />
          <View className="gap-2">
            <NouText className="font-medium">{t('feed.timelines')}</NouText>
            <View className="flex-row flex-wrap gap-2">
              {timelines.map((current) => {
                const included = current.profileKeys.includes(selected.key)
                return (
                  <Pressable
                    key={current.id}
                    onPress={() => watch$.setInTimeline(current.id, selected.key, !included)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: included }}
                    className={clsx(
                      'h-8 flex-row items-center gap-1 rounded-full border px-3',
                      included
                        ? 'border-indigo-300 bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/20'
                        : 'border-zinc-300 dark:border-zinc-700',
                    )}
                  >
                    {included ? <MaterialIcons name="check" size={14} color={iconColor} /> : null}
                    <NouText className="text-sm">{current.name}</NouText>
                  </Pressable>
                )
              })}
              <Pressable
                onPress={() => ui$.timelineModal.set({ profileKey: selected.key })}
                className="h-8 flex-row items-center gap-1 rounded-full border border-dashed border-zinc-300 px-3 dark:border-zinc-700"
              >
                <MaterialIcons name="add" size={14} color={iconColor} />
                <NouText className="text-sm">{t('feed.newTimeline')}</NouText>
              </Pressable>
            </View>
          </View>
          <NouButton variant="outline" size="1" className="self-start" textClassName="text-red-600 dark:text-red-400" onPress={() => unwatch(selected)}>
            {t('feed.unwatch')}
          </NouButton>
        </View>
      ) : !timeline && loggedOutSites.length ? (
        <View className="mx-4 mb-3 rounded-2xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
          <NouText className="text-sm text-amber-800 dark:text-amber-300">
            {t('feed.loginHint', { sites: loggedOutSites.map((site) => watchSiteLabels[site]).join(', ') })}
          </NouText>
        </View>
      ) : null}
    </View>
  )

  const empty = (
    <View className="items-center px-8 py-16">
      <MaterialIcons name="dynamic-feed" size={40} color={iconColor} />
      <NouText className="mt-4 text-center text-zinc-600 dark:text-zinc-400">
        {profiles.length ? t('feed.noPosts') : timeline && allProfiles.length ? t('feed.timelineEmpty') : t('feed.empty')}
      </NouText>
    </View>
  )

  return (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <View className="flex-row items-center gap-2 py-1 pl-4 pr-2">
        <View className="min-w-0 flex-1 flex-row">
          <NouMenu
            trigger={
              <View className="h-11 min-w-0 flex-row items-center gap-1">
                <NouText className="shrink text-lg font-semibold" numberOfLines={1}>
                  {timeline?.name || t('feed.label')}
                </NouText>
                <MaterialIcons name="arrow-drop-down" size={22} color={iconColor} />
              </View>
            }
            items={timelineMenuItems}
          />
        </View>
        {profiles.length ? (
          <Pressable
            onPress={() => ui$.feedSettingsModalOpen.set(true)}
            accessibilityRole="button"
            accessibilityLabel={t('feed.settings')}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <MaterialIcons name="tune" color={iconColor} size={22} />
          </Pressable>
        ) : null}
        {profiles.length ? (
          <Pressable
            onPress={() => void refresh('manual')}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel={t('feed.refresh')}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            {refreshing ? <ActivityIndicator color={iconColor} /> : <MaterialIcons name="refresh" color={iconColor} size={22} />}
          </Pressable>
        ) : null}
      </View>
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(post) => post.key}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View className="mx-4 h-px bg-zinc-200 dark:bg-zinc-800" />}
        renderItem={({ item }) => (
          <PostRow
            post={item}
            profile={profileByKey.get(watchKey(item))}
            unread={isUnread(item)}
            now={now}
            iconColor={iconColor}
            onOpenOriginal={() => openUrl(item.url)}
          />
        )}
        onEndReached={showMore}
        ListFooterComponent={<View className="h-16" />}
      />
    </View>
  )
}
