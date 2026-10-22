import { ActivityIndicator, BackHandler, FlatList, Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { FeedVideo } from '../feed/FeedVideo'
import { ZoomableMedia } from '../feed/ZoomableMedia'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { NouMenu } from '../menu/NouMenu'
import { Avatar } from '../feed/FeedView'
import { ui$ } from '@/states/ui'
import { watch$ } from '@/states/watch'
import { tabs$ } from '@/states/tabs'
import { mediaKey, refreshesMedia, watchKey, watchSiteLabels, watchSourceLabel, type WatchMedia, type WatchPost } from '@/lib/watch'
import { findWatchPosts } from '@/lib/watch-db'
import { useWatchPosts } from '@/lib/use-watch-posts'
import { ensurePostMedia, holdMedia, keepPostMediaItem, keptMediaUri, saveWatchPostMedia, savesToDownloads, touchMedia, watchMedia$ } from '@/lib/watch-media'
import { showToast } from '@/lib/toast'
import { share } from '@/lib/share'
import { isWeb } from '@/lib/utils'

// The height of the seek bar and buttons the video player draws at its bottom.
const VIDEO_CONTROLS_HEIGHT = 112

/** One photo or video. Only the one in sight plays; the others show their cover. */
const GalleryItem: React.FC<{
  post: WatchPost
  index: number
  item: WatchMedia
  active: boolean
  width: number
  height: number
  onZoomChange: (zoomed: boolean) => void
}> = ({ post, index, item, active, width, height, onZoomChange }) => {
  const key = mediaKey(post.key, index)
  const kept = useValue(watchMedia$.files[key])
  const [failed, setFailed] = useState(false)
  const keptUri = keptMediaUri(kept)
  // On desktop the window can't send the headers a video is asked for with, as TikTok's need: it
  // is kept before it plays, as a photo is.
  const keptFirst = item.type === 'image' || (isWeb && Boolean(item.headers))
  const waiting = item.type === 'video' && keptFirst && !keptUri && !failed

  // A photo in sight is kept as it is shown; a video plays from the site until it is kept, so
  // it is not loaded twice.
  useEffect(() => {
    if (!active) return
    // Not pruned away while it is on screen.
    const release = holdMedia(key)
    if (keptUri) {
      touchMedia(key)
    } else if (keptFirst) {
      keepPostMediaItem(post, index).catch(() => setFailed(true))
    }
    return release
  }, [active, keptUri, keptFirst, key, post, index, item])

  // A video that will not play from the site may have an address that expired: the post is read
  // again, which gives the item a new one and so a new player.
  // Only once: a video that fails with a fresh address has some other problem.
  const retried = useRef(false)
  const onVideoError = useCallback(() => {
    if (refreshesMedia(post.site) && !retried.current) {
      retried.current = true
      ensurePostMedia(post, { force: true }).catch(() => setFailed(true))
    } else {
      setFailed(true)
    }
  }, [post])

  if (item.type === 'video' && active && !failed && !waiting) {
    return (
      <FeedVideo
        uri={keptUri || item.url}
        headers={keptUri ? undefined : item.headers}
        width={width}
        height={height}
        onError={onVideoError}
        onZoomChange={onZoomChange}
      />
    )
  }
  const source = item.type === 'video' ? item.thumb || item.url : keptUri || item.url
  return (
    <ZoomableMedia enabled={active} onZoomChange={active ? onZoomChange : undefined} style={{ width, height }}>
      <View style={{ width, height }} className="items-center justify-center">
        <Image source={source} style={{ width, height }} contentFit="contain" onError={() => setFailed(true)} />
        {item.type === 'video' ? (
          <View className="absolute h-16 w-16 items-center justify-center rounded-full bg-black/50">
            {waiting && active ? <ActivityIndicator color="#fff" /> : <MaterialIcons name="play-arrow" size={40} color="#fff" />}
          </View>
        ) : null}
        {failed && !keptUri ? (
          <NouText className="absolute bottom-6 text-sm text-zinc-300">{t('feed.mediaFailed')}</NouText>
        ) : null}
      </View>
    </ZoomableMedia>
  )
}

/** A page of the gallery: an item of a post's media, or the cover of a post whose media is still to be read. */
interface GalleryPage {
  post: WatchPost
  // The item's place in the post's media.
  index: number
  item?: WatchMedia
}

const galleryPages = (posts: WatchPost[]): GalleryPage[] =>
  posts.flatMap((post): GalleryPage[] =>
    post.media?.length
      ? post.media.map((item, index) => ({ post, index, item }))
      : post.mediaComplete === false
        ? [{ post, index: 0 }]
        : [],
  )

export const FeedGalleryModal = () => {
  const gallery = useValue(ui$.feedGallery)
  const window = useWindowDimensions()
  // The room the gallery has, which the safe area can make smaller than the window: a video given
  // the window's height would have its controls cut off at the bottom.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const width = size?.width ?? window.width
  const height = size?.height ?? window.height
  // The item shown, by its post, as the pages before it can change while it is.
  const [position, setPosition] = useState<{ gallery: typeof gallery; postKey: string; index: number } | null>(null)
  // The posts whose media was asked for, and those for which the asking is over.
  const requested = useRef(new Set<string>())
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set())
  const [captionOpen, setCaptionOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const listRef = useRef<FlatList<GalleryPage>>(null)
  // The page the list is scrolled to, once it is shown.
  const shownPage = useRef<number | null>(null)

  const posts = useWatchPosts(
    () =>
      gallery
        ? findWatchPosts(
            (gallery.posts || [{ postKey: gallery.postKey, profileKey: gallery.profileKey }]).map((ref) => ({
              profileKey: ref.profileKey,
              key: ref.postKey,
            })),
          )
        : [],
    gallery,
  )
  const pages = useMemo(() => galleryPages(posts), [posts])
  const at = position && position.gallery === gallery ? position : gallery
  const found = at ? pages.findIndex((page) => page.post.key === at.postKey && page.index === at.index) : -1
  // An item gone, as when the post was read again with fewer: the post's first instead.
  const pageIndex = found !== -1 ? found : Math.max(0, at ? pages.findIndex((page) => page.post.key === at.postKey) : 0)
  const page = pages[pageIndex] as GalleryPage | undefined
  const post = page?.post
  const incompletePost = post?.mediaComplete === false ? post : undefined
  const profileKey = post ? watchKey(post) : undefined
  const profile = useValue(() => (profileKey ? watch$.profiles.get().find((current) => current.key === profileKey) : undefined))

  const onClose = () => ui$.feedGallery.set(null)

  useEffect(() => {
    if (!gallery) return
    requested.current = new Set()
    setSettled(new Set())
    setCaptionOpen(false)
    setZoomed(false)
  }, [gallery])

  // The media of a post the feed has only some of, or only the cover of, is read once it is in sight.
  useEffect(() => {
    if (!incompletePost || requested.current.has(incompletePost.key)) return
    const key = incompletePost.key
    requested.current.add(key)
    ensurePostMedia(incompletePost)
      .catch(() => {})
      .finally(() => setSettled((keys) => new Set(keys).add(key)))
  }, [incompletePost])

  // The list stays on the item shown when the pages before it change.
  useEffect(() => {
    if (!gallery || !pages.length) {
      shownPage.current = null
    } else if (shownPage.current === null) {
      shownPage.current = pageIndex
    } else if (shownPage.current !== pageIndex) {
      shownPage.current = pageIndex
      listRef.current?.scrollToOffset({ offset: width * pageIndex, animated: false })
    }
  })

  // On desktop, Escape closes it, and the arrow keys go through it as a swipe does.
  useEffect(() => {
    if (!gallery || !isWeb) return
    const onKeyDown = (e: KeyboardEvent) => {
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      if (e.key === 'Escape') {
        ui$.feedGallery.set(null)
      } else if (step && pages[pageIndex + step]) {
        const next = pages[pageIndex + step]
        setPosition({ gallery, postKey: next.post.key, index: next.index })
      } else {
        return
      }
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [gallery, pages, pageIndex])

  // Android's back button; the desktop has none.
  useEffect(() => {
    if (!gallery || isWeb) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      ui$.feedGallery.set(null)
      return true
    })
    return () => subscription.remove()
  }, [gallery])

  if (!gallery || !post || !page) {
    return null
  }

  const media = post.media || []

  const save = async () => {
    try {
      const saved = await saveWatchPostMedia(post, page.index)
      // The share sheet tells for itself what became of the files.
      if (!saved) showToast(t('feed.mediaSaveFailed'))
      else if (savesToDownloads) showToast(t('feed.mediaSaved', { count: saved }))
    } catch {
      showToast(t('feed.mediaSaveFailed'))
    }
  }

  const openOriginal = () => {
    // The gallery is opened from the feed tab, and back in the opened tab comes back to it.
    tabs$.openTab(post.url, { source: 'child', parentTabId: tabs$.currentTab()?.id })
    ui$.feedGallery.set(null)
  }

  const onScrollEnd = (offset: number) => {
    const index = Math.round(offset / width)
    const next = pages[index]
    if (!next) return
    shownPage.current = index
    setPosition({ gallery, postKey: next.post.key, index: next.index })
  }

  return (
    <GestureHandlerRootView
      className="absolute inset-0 z-20 bg-black"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout
        if (w && h && (w !== size?.width || h !== size?.height)) setSize({ width: w, height: h })
      }}
    >
      <FlatList
        ref={listRef}
        data={pages}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={pageIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(current) => `${current.post.key}\n${current.item ? current.index : 'cover'}`}
        onMomentumScrollEnd={(e) => onScrollEnd(e.nativeEvent.contentOffset.x)}
        renderItem={({ item: current, index: i }) =>
          current.item ? (
            <GalleryItem
              key={`${current.post.key}:${current.index}:${i === pageIndex}`}
              onZoomChange={setZoomed}
              post={current.post}
              index={current.index}
              item={current.item}
              active={i === pageIndex}
              width={width}
              height={height}
            />
          ) : (
            <View style={{ width, height }} className="items-center justify-center px-8">
              {current.post.image ? (
                <Image source={current.post.image} style={{ position: 'absolute', width, height, opacity: 0.4 }} contentFit="contain" />
              ) : null}
              {settled.has(current.post.key) ? (
                <>
                  <NouText className="mb-4 text-center text-zinc-300">{t('feed.mediaFailed')}</NouText>
                  <Pressable onPress={openOriginal} className="rounded-full bg-white/15 px-4 py-2">
                    <NouText className="text-white">{t('feed.openOn', { site: watchSiteLabels[current.post.site] })}</NouText>
                  </Pressable>
                </>
              ) : (
                <ActivityIndicator color="#fff" size="large" />
              )}
            </View>
          )
        }
      />
      <SafeAreaView className="absolute left-0 right-0 top-0" edges={['top']} pointerEvents="box-none">
        <View className="flex-row items-center gap-2 px-3 py-2">
          <Pressable onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full bg-black/40">
            <MaterialIcons name="close" color="#fff" size={22} />
          </Pressable>
          {/* Whose post it is, as the gallery goes on through the posts of many. */}
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            {gallery.posts ? <Avatar uri={profile?.avatar} size={32} site={post.site} /> : null}
            <View className="min-w-0 flex-1">
              {gallery.posts ? (
                <NouText className="font-medium text-white" numberOfLines={1}>
                  {profile?.name || watchSourceLabel(post)}
                </NouText>
              ) : null}
              {(gallery.posts && profile?.name) || media.length > 1 ? (
                <NouText className="text-sm text-white" numberOfLines={1}>
                  {[gallery.posts && profile?.name ? watchSourceLabel(post) : '', media.length > 1 ? `${page.index + 1} / ${media.length}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </NouText>
              ) : null}
            </View>
          </View>
          {page.item ? (
            <Pressable
              onPress={() => void save()}
              accessibilityRole="button"
              accessibilityLabel={t('feed.saveMedia')}
              className="h-11 w-11 items-center justify-center rounded-full bg-black/40"
            >
              <MaterialIcons name="file-download" color="#fff" size={22} />
            </Pressable>
          ) : null}
          <NouMenu
            trigger={
              <View className="h-11 w-11 items-center justify-center rounded-full bg-black/40">
                <MaterialIcons name="more-vert" color="#fff" size={22} />
              </View>
            }
            items={[
              { label: t('feed.openOn', { site: watchSiteLabels[post.site] }), handler: openOriginal },
              { label: t('menus.share'), handler: () => share(post.url) },
            ]}
          />
        </View>
      </SafeAreaView>
      {post.text ? (
        <SafeAreaView className="absolute bottom-0 left-0 right-0" edges={['bottom']} pointerEvents="box-none">
          <Pressable
            onPress={() => setCaptionOpen((open) => !open)}
            className="bg-black/60 px-4 py-3"
            // Above the player's own controls, which take the bottom of a video.
            style={page.item?.type === 'video' ? { marginBottom: VIDEO_CONTROLS_HEIGHT } : undefined}
          >
            {captionOpen ? (
              <ScrollView style={{ maxHeight: height * 0.4 }}>
                <NouText className="leading-5 text-white">{post.text}</NouText>
              </ScrollView>
            ) : (
              <NouText className="leading-5 text-white" numberOfLines={2}>
                {post.text}
              </NouText>
            )}
          </Pressable>
        </SafeAreaView>
      ) : null}
    </GestureHandlerRootView>
  )
}
