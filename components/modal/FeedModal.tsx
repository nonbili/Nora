import { ActivityIndicator, BackHandler, FlatList, Pressable, ScrollView, View, useColorScheme, useWindowDimensions } from 'react-native'
import { useCallback, useEffect, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { NouButton } from '../button/NouButton'
import { NouSwitch } from '../switch/NouSwitch'
import { BaseModal } from './BaseModal'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { watch$, type WatchedProfile } from '@/states/watch'
import {
  WATCH_INTERVAL_OPTIONS,
  formatPostAge,
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

const siteLabel = { x: 'X', instagram: 'Instagram' } as const

const intervalKeys = { minutes: 'feed.intervalMinutes', hours: 'feed.intervalHours', days: 'feed.intervalDays' } as const

const formatInterval = (minutes: number) => {
  const { unit, count } = splitInterval(minutes)
  return t(intervalKeys[unit], { count })
}

/** A row that tells how often, with a menu to choose another interval. */
const IntervalPicker: React.FC<{
  value: string
  options: { label: string; minutes: number | undefined }[]
  onSelect: (minutes: number | undefined) => void
  iconColor: string
}> = ({ value, options, onSelect, iconColor }) => (
  <View className="flex-row items-center justify-between gap-3">
    <NouText className="font-medium">{t('feed.checkEvery')}</NouText>
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

const PostRow: React.FC<{
  post: WatchPost
  profile?: WatchedProfile
  unread: boolean
  now: number
  onPress: () => void
}> = ({ post, profile, unread, now, onPress }) => (
  <Pressable onPress={onPress} className="flex-row gap-3 px-4 py-3 active:bg-zinc-200 dark:active:bg-zinc-900">
    <Avatar uri={profile?.avatar} size={36} site={post.site} />
    <View className="flex-1">
      <View className="flex-row items-center gap-1.5">
        <NouText className="shrink font-semibold" numberOfLines={1}>
          {profile?.name || post.handle}
        </NouText>
        <NouText className="shrink text-sm text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
          @{post.handle} · {formatPostAge(post.createdAtMs, now)}
        </NouText>
        {unread ? <View className="ml-auto h-2 w-2 rounded-full bg-indigo-500" /> : null}
      </View>
      {post.repostOf ? (
        <NouText className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{t('feed.repostOf', { handle: post.repostOf })}</NouText>
      ) : null}
      {post.text ? (
        <NouText className="mt-1 leading-5" numberOfLines={8}>
          {post.text}
        </NouText>
      ) : null}
      {post.image ? (
        <Image
          source={post.image}
          contentFit="cover"
          className="mt-2 rounded-xl bg-zinc-200 dark:bg-zinc-800"
          style={{ width: '100%', aspectRatio: post.site === 'instagram' ? 1 : 16 / 9, borderRadius: 12 }}
        />
      ) : null}
    </View>
  </Pressable>
)

export const FeedModal = () => {
  const tw = useTwColor()
  const isDark = useColorScheme() === 'dark'
  const { width } = useWindowDimensions()
  const open = useValue(ui$.feedModalOpen)
  const profiles = useValue(watch$.profiles)
  const defaultInterval = useValue(watch$.checkIntervalMinutes)
  const postsByProfile = useValue(watch$.posts)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // What was unread when the feed was opened stays marked while it is open.
  const [unreadSince, setUnreadSince] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const onClose = useCallback(() => ui$.feedModalOpen.set(false), [])

  const refresh = useCallback(async (source: 'foreground' | 'manual') => {
    setRefreshing(true)
    try {
      await refreshWatched(source)
    } finally {
      setRefreshing(false)
      setNow(Date.now())
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setSelectedKey(null)
      return
    }
    setUnreadSince(watch$.feedSeenAt.peek())
    setNow(Date.now())
    watch$.markFeedSeen()
    void refresh('foreground')
    return () => watch$.markFeedSeen()
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => subscription.remove()
  }, [open, onClose])

  if (!open) {
    return null
  }

  // Not memoized: the store changes its arrays in place, so they keep their identity across changes.
  const profileByKey = new Map(profiles.map((profile) => [profile.key, profile]))
  const selected = selectedKey ? profileByKey.get(selectedKey) : undefined
  const posts = (selected ? [selected.key] : profiles.map((profile) => profile.key))
    .flatMap((key) => postsByProfile[key] || [])
    .sort((a, b) => b.createdAtMs - a.createdAtMs)

  // Sites that some profile is checked on without an account, and so less reliably.
  const loggedOutSites = Array.from(
    new Set(profiles.filter((profile) => profile.mode === 'loggedOut' || profile.error === WATCH_ERROR_NEEDS_LOGIN).map((p) => p.site)),
  )

  const iconColor = isDark ? tw('#f8fafc') : tw('#334155')

  const openUrl = (url: string) => {
    tabs$.openTab(url)
    onClose()
  }

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
            const active = (profile?.key ?? null) === selectedKey
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
          <IntervalPicker
            value={selected.checkIntervalMinutes ? formatInterval(selected.checkIntervalMinutes) : t('feed.intervalDefault', { interval: formatInterval(defaultInterval) })}
            options={[
              { label: t('feed.intervalDefault', { interval: formatInterval(defaultInterval) }), minutes: undefined },
              ...WATCH_INTERVAL_OPTIONS.map((minutes) => ({ label: formatInterval(minutes), minutes })),
            ]}
            onSelect={(minutes) => watch$.setProfileCheckInterval(selected.key, minutes)}
            iconColor={iconColor}
          />
          <NouSwitch label={t('feed.notify')} value={selected.notify} onPress={() => void toggleNotify(selected)} />
          <NouButton variant="outline" size="1" className="self-start" textClassName="text-red-600 dark:text-red-400" onPress={() => unwatch(selected)}>
            {t('feed.unwatch')}
          </NouButton>
        </View>
      ) : profiles.length ? (
        <>
          <View className="mx-4 mb-3 gap-1 rounded-2xl bg-white px-4 py-3 dark:bg-zinc-900">
            <IntervalPicker
              value={formatInterval(defaultInterval)}
              options={WATCH_INTERVAL_OPTIONS.map((minutes) => ({ label: formatInterval(minutes), minutes }))}
              onSelect={(minutes) => minutes && watch$.checkIntervalMinutes.set(minutes)}
              iconColor={iconColor}
            />
            <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('feed.intervalHint')}</NouText>
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
        {profiles.length ? t('feed.noPosts') : t('feed.empty')}
      </NouText>
    </View>
  )

  const content = (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <View className="flex-row items-center gap-2 px-3 py-3">
        <Pressable onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-900">
          <MaterialIcons name="close" color={iconColor} size={22} />
        </Pressable>
        <NouText className="flex-1 text-lg font-semibold">{t('feed.label')}</NouText>
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
        data={posts}
        keyExtractor={(post) => post.key}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View className="mx-4 h-px bg-zinc-200 dark:bg-zinc-800" />}
        renderItem={({ item }) => (
          <PostRow
            post={item}
            profile={profileByKey.get(watchKey(item))}
            unread={item.firstSeenAt > unreadSince}
            now={now}
            onPress={() => openUrl(item.url)}
          />
        )}
        ListFooterComponent={<View className="h-16" />}
      />
    </View>
  )

  return width < 768 ? (
    <View className="absolute inset-0 z-10 bg-zinc-100 dark:bg-zinc-950">
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        {content}
      </SafeAreaView>
    </View>
  ) : (
    <BaseModal onClose={onClose} className="bg-transparent" useNativeModal={false} safeAreaEdges={['left', 'right']}>
      {content}
    </BaseModal>
  )
}
