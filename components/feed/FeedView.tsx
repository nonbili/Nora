import { ActivityIndicator, Animated, BackHandler, FlatList, Pressable, ScrollView, View, useColorScheme, type LayoutRectangle, type ScrollViewInstance } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { TimelineZoom } from './TimelineZoom'
import { ui$ } from '@/states/ui'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { getTimeline, inheritedInterval, notifyChoice, timelineEmoji, unreadKeys, watch$, type WatchedProfile } from '@/states/watch'
import {
  DEFAULT_TIMELINE_EMOJI,
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
  type WatchQuote,
  type WatchSite,
} from '@/lib/watch'
import { NouMenu, type NouMenuHandle } from '../menu/NouMenu'
import { siteIcon } from '../service/Services'
import { WatchSites } from './WatchSites'
import {
  WATCH_ERROR_NEEDS_LOGIN,
  WATCH_ERROR_NEEDS_VERIFICATION,
  WATCH_ERROR_RATE_LIMITED,
  enableWatchNotifications,
  imginnBlocked$,
  refreshWatched,
  verifyImginn,
} from '@/lib/watch-feed'
import { getFeedPosts, getNewestPostTimes, getProfilesWithPosts } from '@/lib/watch-db'
import { useWatchPosts } from '@/lib/use-watch-posts'
import { androidHitSlop, clsx, iosTouchTarget, isIos, isWeb } from '@/lib/utils'
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
export const ChoicePicker = <T,>({
  label,
  value,
  options,
  onSelect,
  iconColor,
}: {
  label: string
  value: string
  options: { label: string; choice: T }[]
  onSelect: (choice: T) => void
  iconColor: string
}) => (
  <View className="flex-row items-center justify-between gap-3">
    <NouText className="font-medium">{label}</NouText>
    <NouMenu
      trigger={
        <View style={iosTouchTarget} className="h-9 flex-row items-center gap-1 rounded-full border border-zinc-300 pl-3 pr-2 dark:border-zinc-700">
          <NouText className="text-sm">{value}</NouText>
          <MaterialIcons name="arrow-drop-down" size={18} color={iconColor} />
        </View>
      }
      items={options.map((option) => ({ label: option.label, handler: () => onSelect(option.choice) }))}
    />
  </View>
)

/** A hint above the feed, tapped to act on it, or closed. */
const FeedHint: React.FC<{ text: string; onPress: () => void; onDismiss: () => void }> = ({ text, onPress, onDismiss }) => {
  const tw = useTwColor()
  return (
    <View className="mx-4 mb-3 flex-row items-start rounded-2xl bg-amber-50 py-1 pl-4 pr-1 dark:bg-amber-500/10">
      <Pressable onPress={onPress} accessibilityRole="button" className="flex-1 py-2">
        <NouText className="text-sm text-amber-800 dark:text-amber-300">{text}</NouText>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('menus.close')}
        hitSlop={androidHitSlop}
        style={iosTouchTarget}
        className="h-9 w-9 items-center justify-center"
      >
        <MaterialIcons name="close" size={18} color={tw('#b45309')} />
      </Pressable>
    </View>
  )
}

/** What to tell about how a profile is being checked; null when all is well. */
/** The sites some of these profiles are checked on without an account, and so less reliably; none when the user turned accounts off. */
export const getLoggedOutSites = (profiles: WatchedProfile[], useAccounts: boolean): WatchSite[] =>
  useAccounts
    ? Array.from(
        new Set(profiles.filter((profile) => profile.mode === 'loggedOut' || profile.error === WATCH_ERROR_NEEDS_LOGIN).map((p) => p.site)),
      )
    : []

type NotifyChoice = ReturnType<typeof notifyChoice>

/** Whose choice to notify is taken, when it is not the source's own: its timeline's, or the whole feed's. */
export const notifyFromName = (choice: NotifyChoice) => (choice.from === 'timeline' ? choice.timeline.name : t('feed.allSources'))

/** On or off, and for one that is not the source's own choice, whose it is. */
const notifyChoiceLabel = (choice: NotifyChoice) => {
  const state = t(choice.notify ? 'feed.notifyOn' : 'feed.notifyOff')
  return choice.from === 'source' ? state : t('feed.notifyFrom', { state, name: notifyFromName(choice) })
}

export const profileStatus = (profile: WatchedProfile): { text: string; warn: boolean } | null => {
  const site = watchSiteLabels[profile.site]
  const useAccounts = watch$.useAccounts.peek()
  const chosen = watch$.accountProfiles[profile.site].peek()
  const profileName = (id?: string) => settings$.profiles.peek().find((p) => p?.id === id)?.name
  if (profile.error === WATCH_ERROR_NEEDS_LOGIN) {
    return { text: t(useAccounts ? 'feed.statusNeedsLogin' : 'feed.statusNeedsLoginAccountsOff', { site }), warn: true }
  }
  if (profile.error === WATCH_ERROR_RATE_LIMITED) return { text: t('feed.statusRateLimited', { site }), warn: true }
  if (profile.error === WATCH_ERROR_NEEDS_VERIFICATION) return { text: t('feed.statusNeedsVerification'), warn: true }
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

/** How a profile was last checked, in short, for its details: with which account, if any. */
const profileAccount = (profile: WatchedProfile): string | null => {
  if (profile.mode === 'loggedIn') {
    const name = settings$.profiles.peek().find((p) => p?.id === profile.accountProfileId)?.name
    return name ? t('feed.accountLoggedInProfile', { profile: name }) : t('feed.accountLoggedIn')
  }
  if (profile.mode === 'loggedOut') return watch$.useAccounts.peek() ? t('feed.accountLoggedOut') : t('feed.accountsOff')
  return null
}

// The service icons are drawn at 24px.
const SERVICE_ICON_SIZE = 24
// Sites whose icon fills a square, to be cut round in an avatar's badge.
const SQUARE_ICON_SITES = new Set<WatchSite>(['x', 'threads', 'tiktok', 'instagram'])

/** A button of an empty state: the one to do first is filled. */
const EmptyAction: React.FC<{
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  label: string
  onPress: () => void
  primary?: boolean
  color?: string
}> = ({ icon, label, onPress, primary, color }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={iosTouchTarget}
    className={clsx(
      'h-11 flex-row items-center gap-2 rounded-full px-6',
      primary ? 'bg-indigo-600' : 'border border-zinc-300 dark:border-zinc-700',
    )}
  >
    <MaterialIcons name={icon} size={20} color={primary ? '#ffffff' : color} />
    <NouText className={clsx('font-medium', primary && 'text-white')}>{label}</NouText>
  </Pressable>
)

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
        {/* A square icon is cut to a circle the size of a round one, as Reddit's: not a square in the ring. */}
        <View
          className={clsx('items-center justify-center', SQUARE_ICON_SITES.has(site) && 'overflow-hidden rounded-full')}
          style={{ width: badge, height: badge }}
        >
          <View style={{ transform: [{ scale: badge / SERVICE_ICON_SIZE }] }}>{siteIcon(site)}</View>
        </View>
      </View>
    </View>
  )
}

/** What to show of a post's first photo or video: kept on the phone, or else from the site. */
const usePostCover = (post: WatchPost) => {
  const first = post.media?.[0]
  const kept = useValue(watchMedia$.files[mediaKey(post.key, 0)])
  const keptUri = first?.type === 'image' ? keptMediaUri(kept) : undefined
  // The cover each check of the profile brings anew comes before the media's own addresses, which
  // are kept from when the post was read and can have expired since. A post without media has only
  // its cover, which reading it again renews.
  const [coverFailed, setCoverFailed] = useState(false)
  const remote = coverFailed ? (first ? first.thumb || first.url : post.image) : post.image || first?.thumb || first?.url
  const source = keptUri || remote
  const onError = () => {
    if (coverFailed) return
    setCoverFailed(true)
    // A cover that no longer loads either: the post is read again for new addresses, once.
    if (refreshesMedia(post.site)) ensurePostMedia(post, { force: true }).catch(() => {})
  }
  return { first, source, onError }
}

/** The first photo or video of a post, with how many more there are; opens the gallery. */
const PostMedia: React.FC<{ post: WatchPost; onOpen: () => void }> = ({ post, onOpen }) => {
  const { first, source, onError } = usePostCover(post)
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

/** The post a post quotes, as a card below it with its first photo or video; opens it on its site. */
const QuoteCard: React.FC<{ quote: WatchQuote; now: number; onOpen: () => void }> = ({ quote, now, onOpen }) => {
  const first = quote.media?.[0]
  const cover = first?.thumb || first?.url
  const name = quote.name || quote.handle
  const aspectRatio = first?.width && first?.height ? Math.min(Math.max(first.width / first.height, 0.8), 1.91) : 16 / 9
  const text = usePostText()
  return (
    <Pressable onPress={onOpen} accessibilityRole="link" className="mt-2 overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-600">
      <View className="px-3 pt-2.5">
        <View className="flex-row items-center gap-1.5">
          <View className="h-5 w-5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            {quote.avatar ? <Image source={quote.avatar} contentFit="cover" style={{ width: 20, height: 20 }} /> : null}
          </View>
          <NouText className="shrink font-semibold" style={text('sm')} numberOfLines={1}>
            {name}
          </NouText>
          {quote.handle && !sameAsName(name, quote.handle) ? (
            <NouText className="shrink text-zinc-600 dark:text-zinc-400" style={text('sm')} numberOfLines={1}>
              @{quote.handle}
            </NouText>
          ) : null}
          {quote.createdAtMs ? (
            <NouText className="shrink-0 text-zinc-600 dark:text-zinc-400" style={text('sm')} numberOfLines={1}>
              · {formatPostAge(quote.createdAtMs, now)}
            </NouText>
          ) : null}
        </View>
        {quote.text ? (
          <NouText className="mt-1" style={text('base')} numberOfLines={6}>
            {quote.text}
          </NouText>
        ) : null}
      </View>
      {cover ? (
        <View className="mt-2">
          <Image source={cover} contentFit="cover" className="bg-zinc-300 dark:bg-zinc-700" style={{ width: '100%', aspectRatio }} />
          {first?.type === 'video' ? (
            <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-black/50">
                <MaterialIcons name="play-arrow" size={26} color="#fff" />
              </View>
            </View>
          ) : null}
          {(quote.media?.length || 0) > 1 ? (
            <View className="absolute right-2 top-2 flex-row items-center gap-1 rounded-full bg-black/60 px-2 py-0.5" pointerEvents="none">
              <MaterialIcons name="collections" size={12} color="#fff" />
              <NouText className="text-xs text-white">{quote.media?.length}</NouText>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="h-2.5" />
      )}
    </Pressable>
  )
}

/** A post of a timeline of photos and videos, as a square of its cover; opens the gallery. */
const PostTile: React.FC<{ post: WatchPost; unread: boolean; columns: number; onOpen: () => void }> = ({
  post,
  unread,
  columns,
  onOpen,
}) => {
  const { first, source, onError } = usePostCover(post)
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="imagebutton"
      accessibilityLabel={watchSourceLabel(post)}
      style={{ width: `${100 / columns}%`, padding: 1 }}
    >
      <View className="bg-zinc-200 dark:bg-zinc-800" style={{ aspectRatio: 1 }}>
        {source ? <Image source={source} onError={onError} contentFit="cover" style={{ width: '100%', height: '100%' }} /> : null}
        {first?.type === 'video' || (post.media?.length || 0) > 1 ? (
          <View className="absolute right-1.5 top-1.5" pointerEvents="none">
            <MaterialIcons name={first?.type === 'video' ? 'play-circle' : 'collections'} size={18} color="#fff" />
          </View>
        ) : null}
        {unread ? <View className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-white bg-indigo-500" /> : null}
      </View>
    </Pressable>
  )
}

// The sizes of the text of posts at 100%, as NativeWind's rem of 14 makes them: plain, text-sm, text-xs.
const POST_TEXT = { base: [14, 22], name: [14, 0], sm: [12.25, 17.5], xs: [10.5, 14] } as const

/** The text of posts at the default zoom of web pages: one text size for both. */
const usePostText = () => {
  const zoom = useValue(settings$.defaultZoom) / 100
  return (size: keyof typeof POST_TEXT) => {
    const [fontSize, lineHeight] = POST_TEXT[size]
    return { fontSize: fontSize * zoom, ...(lineHeight ? { lineHeight: lineHeight * zoom } : {}) }
  }
}

/** Whether a name is the very handle beside it, as a subreddit's is. */
const sameAsName = (name: string, handle: string) => name.replace(/^@/, '') === handle.replace(/^@/, '')

const PostRow: React.FC<{
  post: WatchPost
  profile?: WatchedProfile
  unread: boolean
  now: number
  iconColor: string
  onOpenOriginal: () => void
  onOpenLink: (url: string) => void
  // Shows only this post's source, from its avatar or name; not there while it is the one shown.
  onOpenSource?: () => void
}> = ({ post, profile, unread, now, iconColor, onOpenOriginal, onOpenLink, onOpenSource }) => {
  const [expanded, setExpanded] = useState(false)
  const name = profile?.name || post.handle
  const source = watchSourceLabel(post)
  const text = usePostText()

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
    <View className="flex-row items-start gap-3 bg-zinc-50 py-3 pl-4 pr-1 dark:bg-zinc-900">
      <Pressable
        onPress={onOpenSource}
        disabled={!onOpenSource}
        accessibilityRole="button"
        accessibilityLabel={t('feed.showSource', { name })}
        style={iosTouchTarget}
      >
        <Avatar uri={profile?.avatar} size={36} site={post.site} />
      </Pressable>
      <View className="flex-1">
        <View className="min-h-6 flex-row items-center gap-1.5 pr-10">
          <Pressable onPress={onOpenSource} disabled={!onOpenSource} className="shrink" accessible={false}>
            <NouText className="font-semibold" style={text('name')} numberOfLines={1}>
              {name}
            </NouText>
          </Pressable>
          {sameAsName(name, source) ? null : (
            <NouText className="shrink text-zinc-600 dark:text-zinc-400" style={text('sm')} numberOfLines={1}>
              {source}
            </NouText>
          )}
          {/* The age is never cut off; a long name or handle is instead. */}
          <NouText className="shrink-0 text-zinc-600 dark:text-zinc-400" style={text('sm')} numberOfLines={1}>
            {sameAsName(name, source) ? '' : '· '}
            {formatPostAge(post.createdAtMs, now)}
          </NouText>
          {unread ? <View className="h-2 w-2 rounded-full bg-indigo-500" /> : null}
        </View>
        {post.repostOf ? (
          <NouText className="text-zinc-600 dark:text-zinc-400" style={text('xs')}>{t('feed.repostOf', { handle: post.repostOf })}</NouText>
        ) : null}
        {post.text ? (
          <Pressable onPress={() => setExpanded((value) => !value)} style={iosTouchTarget} className="pr-3">
            <NouText className="mt-1" style={text('base')} numberOfLines={expanded ? undefined : 8}>
              {post.text}
            </NouText>
          </Pressable>
        ) : null}
        <View className="pr-3">
          <PostMedia
            post={post}
            // A cover alone: the page of a link card opens, and of what the feed does not have, as a
            // Reddit video, the post. Media still to be read, as of an Instagram post, is read by the gallery.
            onOpen={() =>
              post.media?.length || post.mediaComplete === false
                ? ui$.feedGallery.set({ postKey: post.key, profileKey: watchKey(post), index: 0 })
                : post.link
                  ? onOpenLink(post.link)
                  : onOpenOriginal()
            }
          />
          {post.quote ? <QuoteCard quote={post.quote} now={now} onOpen={() => onOpenLink(post.quote!.url)} /> : null}
        </View>
      </View>
      <View className="absolute right-0 top-0">
        <NouMenu
          triggerLabel={t('menus.more')}
          trigger={(
            <View className="h-12 w-12 items-center justify-center" style={iosTouchTarget}>
              <MaterialIcons name="more-vert" size={18} color={iconColor} />
            </View>
          )}
          items={[
            ...(post.media?.length ? [{ label: t('feed.saveMedia'), handler: () => void save() }] : []),
            { label: t('menus.share'), handler: () => share(post.url) },
            { label: t('feed.openOn', { site: watchSiteLabels[post.site] }), handler: onOpenOriginal },
          ]}
        />
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // When the selected source's header was opened to show how it is being checked; null while it is closed.
  const [detailsAt, setDetailsAt] = useState<number | null>(null)
  const detailsOpen = detailsAt !== null
  const [refreshing, setRefreshing] = useState(false)
  // The title row slides away as the list is scrolled down and comes back on the way up; a phone's screen is short.
  const headProgress = useRef(new Animated.Value(1)).current
  const headHeight = useRef(0)
  const headHidden = useRef(false)
  const lastScrollY = useRef(0)
  const scrollRun = useRef(0)
  const [headMeasured, setHeadMeasured] = useState(false)
  const setHeadHidden = useCallback(
    (hidden: boolean) => {
      if (headHidden.current === hidden) return
      headHidden.current = hidden
      Animated.timing(headProgress, { toValue: hidden ? 0 : 1, duration: 180, useNativeDriver: false }).start()
    },
    [headProgress],
  )
  const onListScroll = useCallback(
    (y: number) => {
      const delta = y - lastScrollY.current
      lastScrollY.current = y
      // The way scrolled in one direction adds up, so that a slow scroll counts as much as a fast one.
      scrollRun.current = Math.sign(delta) === Math.sign(scrollRun.current) ? scrollRun.current + delta : delta
      if (y <= 0) setHeadHidden(false)
      else if (scrollRun.current > 24 && y > 80) setHeadHidden(true)
      else if (scrollRun.current < -16) setHeadHidden(false)
    },
    [setHeadHidden],
  )
  // What was unread when the tab was switched to stays marked while it is shown, as does what comes in since.
  const [unreadOnShow, setUnreadOnShow] = useState<{ keys: Set<string>; at: number }>(() => ({ keys: new Set(), at: 0 }))
  const [now, setNow] = useState(() => Date.now())
  const listRef = useRef<FlatList<WatchPost>>(null)
  const listScrollY = useRef(0)
  const onTimelineScaleChange = (oldScale: number, newScale: number, focalY: number) => {
    const offset = Math.max(0, listScrollY.current + focalY * (1 / oldScale - 1 / newScale))
    listScrollY.current = offset
    // Scaling is not a user scroll that should hide or reveal the toolbar.
    lastScrollY.current = offset
    listRef.current?.scrollToOffset({ offset, animated: false })
  }
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
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
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
  const profiles = timeline ? allProfiles.filter((profile) => profile.timelineId === timeline.id) : allProfiles
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
    if (isWeb || !focused || !hasSelection) return
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
  const feedMediaOnly = useValue(watch$.feedMediaOnly)
  const mediaOnly = timeline ? Boolean(timeline.mediaOnly) : feedMediaOnly
  const view = `${mediaOnly}\n${postProfileKeys.join('\n')}`
  const [page, setPage] = useState({ view, limit: FEED_PAGE_SIZE })
  const limit = page.view === view ? page.limit : FEED_PAGE_SIZE
  const posts = useWatchPosts(() => getFeedPosts(postProfileKeys, limit, mediaOnly), `${limit}\n${view}`)
  // As many squares across as fit at about the size of a phone's three.
  const [listWidth, setListWidth] = useState(0)
  const columns = Math.max(3, Math.round(listWidth / 180))
  const listKey = mediaOnly ? `grid-${columns}` : 'list'
  useEffect(() => {
    // A different list mounts at zero without necessarily emitting onScroll.
    listScrollY.current = 0
    lastScrollY.current = 0
    scrollRun.current = 0
  }, [listKey])

  // The gallery goes on through the posts shown, from the one opened.
  const openGallery = (post: WatchPost) =>
    ui$.feedGallery.set({
      postKey: post.key,
      profileKey: watchKey(post),
      index: 0,
      posts: posts.map((current) => ({ postKey: current.key, profileKey: watchKey(current) })),
    })
  const showMore = () => {
    if (posts.length >= limit) setPage({ view, limit: limit + FEED_PAGE_SIZE })
  }

  // Sites that some profile is checked on without an account, and so less reliably; not told when
  // the user turned accounts off.
  const useAccounts = useValue(watch$.useAccounts)
  const loggedOutSites = getLoggedOutSites(profiles, useAccounts)
  // Closed for the sites it told of, it is told again only of another one.
  const loginHintDismissedSites = useValue(watch$.loginHintDismissedSites)
  const showLoginHint = loggedOutSites.some((site) => !loginHintDismissedSites.includes(site))
  const dismissLoginHint = () =>
    watch$.loginHintDismissedSites.set(Array.from(new Set([...loginHintDismissedSites, ...loggedOutSites])))
  // Imginn's check stopped it, or a source it left unread, as before Nora was last closed: told
  // even with a source chosen, whose status points here, and instead of the login hint.
  const imginnBlocked = useValue(imginnBlocked$)
  const imginnMode = useValue(watch$.imginnMode)
  const verifyHintDismissed = useValue(ui$.verifyHintDismissed)
  const showVerifyHint =
    imginnMode !== 'off' &&
    !verifyHintDismissed &&
    (Boolean(imginnBlocked) || allProfiles.some((profile) => profile.error === WATCH_ERROR_NEEDS_VERIFICATION))

  const iconColor = isDark ? tw('#f8fafc') : tw('#334155')

  // Back in the opened tab comes back to the feed.
  const openUrl = (url: string) => tabs$.openTab(url, { source: 'child', parentTabId: tabId })

  // From a post: the list starts again at the top, where the source's own header is.
  const showSource = (key: string) => {
    setSelectedKey(key)
    setHeadHidden(false)
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }

  const showTimeline = (id?: string) => {
    const index = tabs$.tabs.peek().findIndex((tab) => tab?.id === tabId)
    if (index !== -1) tabs$.tabs[index].url.set(feedTabUrl(id))
  }

  const unreadLabel = (id?: string) => {
    const count = unreadKeys(id).size
    return count ? String(count) : undefined
  }

  const feedEmoji = useValue(watch$.feedEmoji) || DEFAULT_TIMELINE_EMOJI

  // The emoji of a timeline in front of its name; iOS menus take no view for an icon, so it goes in the label.
  const emojiIcon = (emoji: string) => <NouText style={{ fontSize: 15, lineHeight: 20 }}>{emoji}</NouText>
  // What the menu shows to the right: the unread count, and a check mark on the one shown, where the icon is the emoji.
  const metaOf = (selected: boolean, unread?: string) =>
    isIos ? unread : [unread, selected ? '✓' : undefined].filter(Boolean).join(' ') || undefined

  const timelineMenuRef = useRef<NouMenuHandle>(null)
  const managingSources = useValue(() => ui$.sourcesScreen.get()?.tabId === tabId)
  const returnFromSources = useRef(false)

  useEffect(() => {
    if (managingSources) {
      returnFromSources.current = true
    } else if (returnFromSources.current) {
      returnFromSources.current = false
      // Passive cleanups have removed the workspace's inert state before this runs.
      timelineMenuRef.current?.focusTrigger?.()
    }
  }, [managingSources])

  const timelineMenuItems = [
    {
      label: isIos ? `${feedEmoji} ${t('feed.allSources')}` : t('feed.allSources'),
      icon: emojiIcon(feedEmoji),
      systemImage: timeline ? undefined : 'checkmark',
      metaLabel: metaOf(!timeline, unreadLabel()),
      handler: () => showTimeline(),
    },
    ...timelines.map((current) => {
      const emoji = current.emoji || DEFAULT_TIMELINE_EMOJI
      return {
        label: isIos ? `${emoji} ${current.name}` : current.name,
        icon: emojiIcon(emoji),
        systemImage: current.id === timeline?.id ? 'checkmark' : undefined,
        metaLabel: metaOf(current.id === timeline?.id, unreadLabel(current.id)),
        handler: () => showTimeline(current.id),
      }
    }),
    { label: '', handler: () => {}, kind: 'separator' as const },
    {
      label: t('feed.addSources'),
      icon: <MaterialIcons name="add-link" size={18} color={iconColor} />,
      systemImage: 'link.badge.plus',
      handler: () => ui$.addSourcesModal.set({ timelineId: timeline?.id }),
    },
    ...(timeline
      ? [
          {
            label: t('feed.editTimeline'),
            icon: <MaterialIcons name="tune" size={18} color={iconColor} />,
            systemImage: 'slider.horizontal.3',
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
      label: t('feed.openInNewTab'),
      icon: <MaterialIcons name="open-in-new" size={18} color={iconColor} />,
      systemImage: 'plus.square.on.square',
      handler: () => openFeedTab(timeline?.id, true),
    },
    { label: '', handler: () => {}, kind: 'separator' as const },
    {
      label: t('feed.newTimeline'),
      icon: <MaterialIcons name="playlist-add" size={18} color={iconColor} />,
      systemImage: 'plus',
      handler: () => ui$.timelineModal.set({ tabId }),
    },
    {
      label: t('feed.manageSources'),
      icon: <MaterialIcons name="manage-accounts" size={18} color={iconColor} />,
      systemImage: 'person.2',
      handler: () => ui$.sourcesScreen.set({ tabId }),
    },
    {
      label: t('feed.settings'),
      icon: <MaterialIcons name="settings" size={18} color={iconColor} />,
      systemImage: 'gearshape',
      handler: () => ui$.feedSettingsModalOpen.set(true),
    },
  ]

  // Turns the source's notifications the other way, with a choice of its own only when that is not already its timeline's or the feed's.
  const toggleNotify = async (profile: WatchedProfile) => {
    const notifies = notifyChoice(profile).notify
    const inherited = notifyChoice({ timelineId: profile.timelineId }).notify
    if (notifies) {
      watch$.setNotify(profile.key, inherited ? false : undefined)
      if (inherited) showToast(t('feed.notifyMuted'))
      return
    }
    if (inherited) {
      watch$.setNotify(profile.key, undefined)
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
  const selectedNotify = useValue(() => (selected ? notifyChoice(selected) : notifyChoice({})))
  const selectedNotifies = selectedNotify.notify
  const selectedInheritedNotify = useValue(() => notifyChoice({ timelineId: selected?.timelineId }).notify)
  // Off by its own choice, though its timeline or the feed would notify.
  const selectedMuted = selectedNotify.from === 'source' && !selectedNotify.notify && selectedInheritedNotify
  const selectedAccount = selected ? profileAccount(selected) : null
  const selectedInherited = useValue(() => (selected ? inheritedInterval(selected) : inheritedInterval({})))

  const newestPostAt = useWatchPosts(getNewestPostTimes)
  const unreadSourceKeys = useWatchPosts(() => getProfilesWithPosts(unreadOnShow.keys, unreadOnShow.at), unreadOnShow)
  const ago = (at?: number) => (at ? t('feed.ago', { age: formatPostAge(at, detailsAt ?? now) }) : t('feed.never'))
  // The last successful check is told apart only when the last check failed.
  const detailRows: string[][] = selected
    ? [
        [t('feed.detailLastChecked'), ago(selected.lastCheckedAt)],
        ...(selected.lastSuccessAt !== selected.lastCheckedAt ? [[t('feed.detailLastSuccess'), ago(selected.lastSuccessAt)]] : []),
        [t('feed.detailNewestPost'), ago(newestPostAt[selected.key])],
        [
          t('feed.checkEvery'),
          selected.checkIntervalMinutes
            ? formatInterval(selected.checkIntervalMinutes)
            : selectedInherited.timeline
              ? t('feed.intervalDefaultFrom', { interval: formatInterval(selectedInherited.minutes), name: selectedInherited.timeline.name })
              : t('feed.intervalDefault', { interval: formatInterval(selectedInherited.minutes) }),
        ],
        ...(selectedAccount ? [[t('feed.detailAccount'), selectedAccount]] : []),
        [t('feed.detailNotify'), notifyChoiceLabel(selectedNotify)],
      ]
    : []
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
                hitSlop={androidHitSlop}
                style={iosTouchTarget}
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
                    : 'border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900',
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
              onPress={() => ui$.sourcesModal.set({ tabId, timelineId: timeline?.id })}
              accessibilityRole="button"
              accessibilityLabel={t('feed.chooseSource')}
              hitSlop={androidHitSlop}
              style={iosTouchTarget}
              className="h-9 flex-row items-center gap-1 rounded-full border border-dashed border-zinc-300 pl-3 pr-2 dark:border-zinc-700"
            >
              <NouText className="text-sm">{t('feed.moreSources', { count: chips.hidden })}</NouText>
              <MaterialIcons name="chevron-right" size={18} color={iconColor} />
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      {showVerifyHint ? (
        <FeedHint
          text={t('feed.verifyHint')}
          onPress={() => void verifyImginn()}
          onDismiss={() => ui$.verifyHintDismissed.set(true)}
        />
      ) : null}
      {selected ? (
        <View className="mx-4 mb-3 gap-2 rounded-2xl bg-zinc-50 py-2 pl-4 pr-1 dark:bg-zinc-900">
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => setDetailsAt(detailsOpen ? null : Date.now())}
              accessibilityRole="button"
              accessibilityLabel={t('feed.showDetails')}
              accessibilityState={{ expanded: detailsOpen }}
              className="min-w-0 flex-1 flex-row items-center gap-3"
            >
              <Avatar uri={selected.avatar} size={40} site={selected.site} />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-1">
                  <NouText className="shrink font-semibold" numberOfLines={1}>
                    {selected.name || selected.handle}
                  </NouText>
                  {selectedStatus?.warn && !detailsOpen ? <MaterialIcons name="error-outline" size={16} color={tw('#b45309')} /> : null}
                </View>
                <View className="flex-row items-center gap-0.5">
                  <NouText className="shrink text-sm text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
                    {sameAsName(selected.name || selected.handle, watchSourceLabel(selected))
                      ? watchSiteLabels[selected.site]
                      : `${watchSourceLabel(selected)} · ${watchSiteLabels[selected.site]}`}
                  </NouText>
                  <MaterialIcons name={detailsOpen ? 'expand-less' : 'expand-more'} size={18} color={iconColor} />
                </View>
              </View>
            </Pressable>
            <Pressable
              onPress={() => void toggleNotify(selected)}
              accessibilityRole="switch"
              accessibilityLabel={t('feed.notify')}
              accessibilityState={{ checked: selectedNotifies }}
              hitSlop={androidHitSlop}
              style={iosTouchTarget}
              className="h-11 w-11 items-center justify-center"
            >
              {/* Fainter when it is a timeline's choice and not the source's own. */}
              <MaterialIcons
                name={selectedNotifies ? 'notifications-active' : selectedMuted ? 'notifications-off' : 'notifications-none'}
                size={22}
                color={selectedNotifies ? tw('#6366f1') : iconColor}
                style={selectedNotifies && selectedNotify.from !== 'source' ? { opacity: 0.5 } : undefined}
              />
            </Pressable>
            <NouMenu
              triggerLabel={t('menus.more')}
              trigger={(
                <View className="h-11 w-11 items-center justify-center" style={iosTouchTarget}>
                  <MaterialIcons name="more-vert" size={22} color={iconColor} />
                </View>
              )}
              items={[
                {
                  label: t('feed.checkEveryMenu'),
                  icon: <MaterialIcons name="schedule" size={18} color={iconColor} />,
                  systemImage: 'clock',
                  handler: () => ui$.sourcePicker.set({ profileKey: selected.key, kind: 'interval' }),
                },
                {
                  label: t('feed.notifyMenu'),
                  icon: <MaterialIcons name="notifications-none" size={18} color={iconColor} />,
                  systemImage: 'bell',
                  handler: () => ui$.sourcePicker.set({ profileKey: selected.key, kind: 'notify' }),
                },
                {
                  label: t('feed.timelineMenu'),
                  icon: <MaterialIcons name="drive-file-move" size={18} color={iconColor} />,
                  systemImage: 'folder',
                  handler: () => ui$.sourcePicker.set({ profileKey: selected.key, kind: 'timeline' }),
                },
                {
                  label: t('feed.openOn', { site: watchSiteLabels[selected.site] }),
                  icon: <MaterialIcons name="open-in-new" size={18} color={iconColor} />,
                  systemImage: 'arrow.up.right.square',
                  handler: () => openUrl(watchProfileUrl(selected)),
                },
                { label: '', handler: () => {}, kind: 'separator' as const },
                {
                  label: t('feed.unwatch'),
                  icon: <MaterialIcons name="remove-circle-outline" size={18} color={tw('#dc2626')} />,
                  systemImage: 'minus.circle',
                  handler: () => unwatch(selected),
                },
              ]}
            />
          </View>
          {detailsOpen ? (
            <View className="gap-1 pb-1 pr-3">
              {selectedStatus?.warn && selected.error === WATCH_ERROR_NEEDS_VERIFICATION ? (
                // Passed from here too, as the hint above the feed can be closed.
                <Pressable onPress={() => void verifyImginn()} accessibilityRole="button" className="mb-1">
                  <NouText className="text-sm text-amber-700 dark:text-amber-400">{selectedStatus.text}</NouText>
                </Pressable>
              ) : selectedStatus?.warn ? (
                <NouText className="mb-1 text-sm text-amber-700 dark:text-amber-400">{selectedStatus.text}</NouText>
              ) : null}
              <View className="flex-row gap-3">
                <View className="gap-1">
                  {detailRows.map(([label]) => (
                    <NouText key={label} className="text-sm text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
                      {label}
                    </NouText>
                  ))}
                </View>
                <View className="flex-1 gap-1">
                  {detailRows.map(([label, value]) => (
                    <NouText key={label} className="text-sm" numberOfLines={1}>
                      {value}
                    </NouText>
                  ))}
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : !timeline && showLoginHint && !showVerifyHint ? (
        // What it asks for is chosen in Feed settings, where it is told again.
        <FeedHint
          text={t('feed.loginHint', { sites: loggedOutSites.map((site) => watchSiteLabels[site]).join(', ') })}
          onPress={() => ui$.feedSettingsModalOpen.set(true)}
          onDismiss={dismissLoginHint}
        />
      ) : null}
    </View>
  )

  const noSources = !profiles.length && !(timeline && allProfiles.length)
  const empty = noSources ? (
    <View className="items-center px-8 py-12">
      <MaterialIcons name="rss-feed" size={40} color={iconColor} />
      <NouText className="mt-4 text-center text-lg font-semibold">{t('feed.emptyTitle')}</NouText>
      <NouText className="mt-1 text-center text-zinc-600 dark:text-zinc-400">{t('feed.emptyDescription')}</NouText>
      <WatchSites className="mt-6" />
      <Pressable
        onPress={() => ui$.addSourcesModal.set({ timelineId: timeline?.id })}
        accessibilityRole="button"
        style={iosTouchTarget}
        className="mt-8 h-11 flex-row items-center gap-2 rounded-full bg-indigo-600 px-6"
      >
        <MaterialIcons name="add" size={20} color="#ffffff" />
        <NouText className="font-medium text-white">{t('feed.addSources')}</NouText>
      </Pressable>
      <NouText className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">{t('feed.emptyWatchHint')}</NouText>
    </View>
  ) : (
    <View className="items-center px-8 py-16">
      <NouText style={{ fontSize: 40, lineHeight: 48 }}>{timelineEmoji(timeline?.id)}</NouText>
      <NouText className="mt-4 text-center text-zinc-600 dark:text-zinc-400">
        {profiles.length ? (mediaOnly ? t('feed.noMedia') : t('feed.noPosts')) : t('feed.timelineEmpty')}
      </NouText>
      {/* What to do next, here and not in the menu. */}
      <View className="mt-6 items-center gap-3">
        {!profiles.length && timeline ? (
          <>
            <EmptyAction
              primary
              icon="checklist"
              label={t('feed.chooseSources')}
              onPress={() => ui$.timelineModal.set({ timelineId: timeline.id, tabId, sourcesOnly: true })}
            />
            <EmptyAction
              icon="add-link"
              label={t('feed.addSources')}
              onPress={() => ui$.addSourcesModal.set({ timelineId: timeline.id })}
              color={iconColor}
            />
          </>
        ) : (
          <>
            <EmptyAction primary icon="refresh" label={t('feed.refresh')} onPress={() => void refresh('manual')} />
            {mediaOnly ? (
              <EmptyAction
                icon="photo-library"
                label={t('feed.showAllPosts')}
                onPress={() =>
                  timeline ? watch$.updateTimeline(timeline.id, { mediaOnly: false }) : watch$.feedMediaOnly.set(false)
                }
                color={iconColor}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  )

  // Nothing to scroll: the title row is there.
  useEffect(() => {
    if (!posts.length) setHeadHidden(false)
  }, [posts.length, setHeadHidden])

  return (
    <GestureHandlerRootView className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <TimelineZoom onScaleChange={onTimelineScaleChange}>
        <Animated.View
          className="w-full max-w-[640px] self-center"
          style={
            isWeb || !headMeasured
              ? undefined
              : { height: Animated.multiply(headProgress, headHeight.current), opacity: headProgress, overflow: 'hidden' }
          }
        >
          <View
            className="flex-row items-center gap-2 py-1 pl-4 pr-2"
            onLayout={(e) => {
              if (isWeb || headMeasured) return
              headHeight.current = e.nativeEvent.layout.height
              setHeadMeasured(true)
            }}
          >
            <View className="min-w-0 flex-1 flex-row">
              <NouMenu
                trigger={
                  <View style={iosTouchTarget} className="h-11 min-w-0 flex-row items-center gap-1">
                    <NouText className="shrink text-lg font-semibold" numberOfLines={1}>
                      {timeline?.name || t('feed.label')}
                    </NouText>
                    <MaterialIcons name="arrow-drop-down" size={22} color={iconColor} />
                  </View>
                }
                ref={timelineMenuRef}
                items={timelineMenuItems}
              />
            </View>
            {profiles.length ? (
              <Pressable
                onPress={() =>
                  timeline ? watch$.updateTimeline(timeline.id, { mediaOnly: !mediaOnly }) : watch$.feedMediaOnly.set(!mediaOnly)
                }
                accessibilityRole="button"
                accessibilityLabel={mediaOnly ? t('feed.showAllPosts') : t('feed.showMediaOnly')}
                style={iosTouchTarget}
                className="h-11 w-11 items-center justify-center rounded-full"
              >
                <MaterialIcons name={mediaOnly ? 'view-agenda' : 'grid-view'} color={iconColor} size={22} />
              </Pressable>
            ) : null}
            {profiles.length ? (
              <Pressable
                onPress={() => {
                  if (timeline) ui$.timelineModal.set({ timelineId: timeline.id, tabId })
                  else ui$.feedSettingsModalOpen.set(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t(timeline ? 'feed.editTimeline' : 'feed.settings')}
                style={iosTouchTarget}
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
                style={iosTouchTarget}
                className="h-11 w-11 items-center justify-center rounded-full"
              >
                {refreshing ? <ActivityIndicator color={iconColor} /> : <MaterialIcons name="refresh" color={iconColor} size={22} />}
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
        <FlatList
          className="w-full max-w-[640px] self-center"
          ref={listRef}
          onScroll={(event) => {
            listScrollY.current = event.nativeEvent.contentOffset.y
            if (!isWeb) onListScroll(listScrollY.current)
          }}
          scrollEventThrottle={16}
          // The columns of a list can only be set as it is made.
          key={listKey}
          numColumns={mediaOnly ? columns : 1}
          onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
          data={posts}
          keyExtractor={(post) => post.key}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ItemSeparatorComponent={mediaOnly ? undefined : () => <View className="h-px bg-zinc-200 dark:bg-zinc-800" />}
          renderItem={({ item }) =>
            mediaOnly ? (
              <PostTile post={item} unread={isUnread(item)} columns={columns} onOpen={() => openGallery(item)} />
            ) : (
              <PostRow
                post={item}
                profile={profileByKey.get(watchKey(item))}
                unread={isUnread(item)}
                now={now}
                iconColor={iconColor}
                onOpenOriginal={() => openUrl(item.url)}
                onOpenLink={openUrl}
                onOpenSource={selected ? undefined : () => showSource(watchKey(item))}
              />
            )
          }
          onEndReached={showMore}
          ListFooterComponent={<View className="h-16" />}
        />
      </TimelineZoom>
    </GestureHandlerRootView>
  )
}
