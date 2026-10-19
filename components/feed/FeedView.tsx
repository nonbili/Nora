import { ActivityIndicator, BackHandler, FlatList, Pressable, ScrollView, View, useColorScheme } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { NouButton } from '../button/NouButton'
import { NouSwitch } from '../switch/NouSwitch'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { getTimeline, unreadKeys, watch$, type WatchedProfile } from '@/states/watch'
import {
  WATCH_INTERVAL_OPTIONS,
  formatPostAge,
  mediaKey,
  uniquePostsNewestFirst,
  splitInterval,
  watchKey,
  watchProfileUrl,
  type WatchPost,
  type WatchSite,
} from '@/lib/watch'
import { NouMenu } from '../menu/NouMenu'
import { services } from '../service/Services'
import {
  WATCH_ERROR_NEEDS_LOGIN,
  WATCH_ERROR_RATE_LIMITED,
  enableWatchNotifications,
  refreshWatched,
} from '@/lib/watch-feed'
import { clsx } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { confirmDestructiveAction } from '@/lib/confirm'
import { useTwColor } from '@/lib/theme'
import { share } from '@/lib/share'
import { clearWatchMedia, ensurePostMedia, keptMediaUri, saveWatchPostMedia, savesToDownloads, watchMedia$ } from '@/lib/watch-media'
import { feedTabActions, feedTabUrl } from '@/lib/feed-tab'
import { openFeedTab } from '@/lib/page'

const siteLabel = { x: 'X', instagram: 'Instagram' } as const

const intervalKeys = { minutes: 'feed.intervalMinutes', hours: 'feed.intervalHours', days: 'feed.intervalDays' } as const

const formatInterval = (minutes: number) => {
  const { unit, count } = splitInterval(minutes)
  return t(intervalKeys[unit], { count })
}

const MEDIA_LIMIT_OPTIONS_MB = [250, 500, 1024, 2048, 5120]

const formatMegabytes = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)

/** A row with a value and a menu to choose another. */
const ChoicePicker: React.FC<{
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
const profileStatus = (profile: WatchedProfile): { text: string; warn: boolean } | null => {
  const site = siteLabel[profile.site]
  if (profile.error === WATCH_ERROR_NEEDS_LOGIN) return { text: t('feed.statusNeedsLogin', { site }), warn: true }
  if (profile.error === WATCH_ERROR_RATE_LIMITED) return { text: t('feed.statusRateLimited', { site }), warn: true }
  if (profile.error) return { text: t('feed.statusFailed', { error: profile.error }), warn: true }
  if (profile.mode === 'loggedOut') return { text: t('feed.statusLoggedOut', { site }), warn: false }
  if (!profile.lastCheckedAt) return { text: t('feed.statusPending'), warn: false }
  return null
}

// The service icons are drawn at 24px.
const SERVICE_ICON_SIZE = 24

/** A profile's picture, with the icon of its site at its corner: the same handle can be on both. */
const Avatar: React.FC<{ uri?: string; size: number; site: WatchSite }> = ({ uri, size, site }) => {
  const badge = Math.round(size * 0.45)
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={uri} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View className="rounded-full bg-zinc-300 dark:bg-zinc-700" style={{ width: size, height: size }} />
      )}
      <View
        className="absolute items-center justify-center overflow-hidden rounded-full bg-white"
        style={{ width: badge + 2, height: badge + 2, right: -2, bottom: -2 }}
      >
        <View style={{ transform: [{ scale: badge / SERVICE_ICON_SIZE }] }}>{services[site]?.[1]()}</View>
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
    if (post.site === 'instagram') ensurePostMedia(post, { force: true }).catch(() => {})
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

const PostRow: React.FC<{
  post: WatchPost
  profile?: WatchedProfile
  unread: boolean
  now: number
  iconColor: string
  onOpenOriginal: () => void
}> = ({ post, profile, unread, now, iconColor, onOpenOriginal }) => {
  const [expanded, setExpanded] = useState(false)

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
            {profile?.name || post.handle}
          </NouText>
          <NouText className="shrink text-sm text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
            @{post.handle} · {formatPostAge(post.createdAtMs, now)}
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
                { label: t('feed.openOn', { site: siteLabel[post.site] }), handler: onOpenOriginal },
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
            onOpen={() => ui$.feedGallery.set({ postKey: post.key, profileKey: watchKey(post), index: 0 })}
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
  const mediaWifiOnly = useValue(watch$.mediaWifiOnly)
  const mediaLimitMB = useValue(watch$.mediaLimitMB)
  const mediaUsedBytes = useValue(() =>
    Object.values(watchMedia$.files.get()).reduce((sum, kept) => sum + (kept?.bytes || 0), 0),
  )
  const postsByProfile = useValue(watch$.posts)
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

  const posts = uniquePostsNewestFirst(
    (selected ? [selected.key] : profiles.map((profile) => profile.key)).map((key) => postsByProfile[key]),
  )

  // Sites that some profile is checked on without an account, and so less reliably.
  const loggedOutSites = Array.from(
    new Set(profiles.filter((profile) => profile.mode === 'loggedOut' || profile.error === WATCH_ERROR_NEEDS_LOGIN).map((p) => p.site)),
  )

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
        ]
      : []),
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

  const clearMedia = () => {
    confirmDestructiveAction(t('feed.mediaClear'), t('feed.mediaClearConfirm'), t('feed.mediaClear'), clearWatchMedia)
  }

  const unwatch = (profile: WatchedProfile) => {
    confirmDestructiveAction(t('feed.unwatch'), t('feed.unwatchConfirm', { handle: profile.handle }), t('feed.unwatch'), () => {
      setSelectedKey(null)
      watch$.unwatch(profile.key)
    })
  }

  const selectedStatus = selected ? profileStatus(selected) : null

  const header = (
    <View>
      {profiles.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-3">
          {[undefined, ...profiles].map((profile) => {
            const active = (profile?.key ?? null) === (selected?.key ?? null)
            const status = profile ? profileStatus(profile) : null
            return (
              <Pressable
                key={profile?.key ?? 'all'}
                onPress={() => setSelectedKey(profile?.key ?? null)}
                className={clsx(
                  'h-9 flex-row items-center gap-1.5 rounded-full border px-3',
                  active
                    ? 'border-indigo-300 bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/20'
                    : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900',
                )}
              >
                {profile ? <Avatar uri={profile.avatar} size={20} site={profile.site} /> : null}
                <NouText className="text-sm">{profile ? `@${profile.handle}` : t('feed.all')}</NouText>
                {status?.warn ? <View className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
              </Pressable>
            )
          })}
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
                @{selected.handle} · {siteLabel[selected.site]}
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
      ) : profiles.length && !timeline ? (
        <>
          <View className="mx-4 mb-3 gap-1 rounded-2xl bg-white px-4 py-3 dark:bg-zinc-900">
            <ChoicePicker
              label={t('feed.checkEvery')}
              value={formatInterval(defaultInterval)}
              options={WATCH_INTERVAL_OPTIONS.map((minutes) => ({ label: formatInterval(minutes), minutes }))}
              onSelect={(minutes) => minutes && watch$.checkIntervalMinutes.set(minutes)}
              iconColor={iconColor}
            />
            <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('feed.intervalHint')}</NouText>
            <View className="my-2 h-px bg-zinc-200 dark:bg-zinc-800" />
            <NouSwitch label={t('feed.mediaWifiOnly')} value={mediaWifiOnly} onPress={() => watch$.mediaWifiOnly.set(!mediaWifiOnly)} />
            <View className="mt-2">
              <ChoicePicker
                label={t('feed.mediaLimit')}
                value={formatMegabytes(mediaLimitMB)}
                options={MEDIA_LIMIT_OPTIONS_MB.map((mb) => ({ label: formatMegabytes(mb), minutes: mb }))}
                onSelect={(mb) => mb && watch$.mediaLimitMB.set(mb)}
                iconColor={iconColor}
              />
            </View>
            <View className="mt-1 flex-row items-center justify-between gap-3">
              <NouText className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t('feed.mediaUsage', { used: formatMegabytes(mediaUsedBytes / 1024 / 1024), limit: formatMegabytes(mediaLimitMB) })}
              </NouText>
              <NouButton variant="outline" size="1" disabled={!mediaUsedBytes} onPress={clearMedia}>
                {t('feed.mediaClear')}
              </NouButton>
            </View>
          </View>
          {loggedOutSites.length ? (
            <View className="mx-4 mb-3 rounded-2xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
              <NouText className="text-sm text-amber-800 dark:text-amber-300">
                {t('feed.loginHint', { sites: loggedOutSites.map((site) => siteLabel[site]).join(', ') })}
              </NouText>
            </View>
          ) : null}
        </>
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
            unread={unreadOnShow.keys.has(item.key) || (unreadOnShow.at > 0 && item.firstSeenAt > unreadOnShow.at)}
            now={now}
            iconColor={iconColor}
            onOpenOriginal={() => openUrl(item.url)}
          />
        )}
        ListFooterComponent={<View className="h-16" />}
      />
    </View>
  )
}
