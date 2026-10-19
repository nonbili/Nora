import { ActivityIndicator, BackHandler, FlatList, Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { NouMenu } from '../menu/NouMenu'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { watch$ } from '@/states/watch'
import { findWatchPost, mediaKey, type WatchMedia, type WatchPost } from '@/lib/watch'
import { ensurePostMedia, holdMedia, keepPostMediaItem, keptMediaUri, saveWatchPostMedia, savesToDownloads, touchMedia, watchMedia$ } from '@/lib/watch-media'
import { showToast } from '@/lib/toast'
import { share } from '@/lib/share'

const siteLabel = { x: 'X', instagram: 'Instagram' } as const

// The height of the seek bar and buttons the video player draws at its bottom.
const VIDEO_CONTROLS_HEIGHT = 112

const VideoItem: React.FC<{ uri: string; width: number; height: number; onError: () => void }> = ({
  uri,
  width,
  height,
  onError,
}) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.play()
  })
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError()
    })
    return () => subscription.remove()
  }, [player, onError])
  return <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls />
}

/** One photo or video. Only the one in sight plays; the others show their cover. */
const GalleryItem: React.FC<{
  post: WatchPost
  index: number
  item: WatchMedia
  active: boolean
  width: number
  height: number
}> = ({ post, index, item, active, width, height }) => {
  const key = mediaKey(post.key, index)
  const kept = useValue(watchMedia$.files[key])
  const [failed, setFailed] = useState(false)
  const keptUri = keptMediaUri(kept)

  // A photo in sight is kept as it is shown; a video plays from the site until it is kept, so
  // it is not loaded twice.
  useEffect(() => {
    if (!active) return
    // Not pruned away while it is on screen.
    const release = holdMedia(key)
    if (keptUri) {
      touchMedia(key)
    } else if (item.type === 'image') {
      keepPostMediaItem(post, index).catch(() => setFailed(true))
    }
    return release
  }, [active, keptUri, key, post, index, item])

  // A video that will not play from the site may have an address that expired: the post is read
  // again, which gives the item a new one and so a new player.
  // Only once: a video that fails with a fresh address has some other problem.
  const retried = useRef(false)
  const onVideoError = useCallback(() => {
    if (post.site === 'instagram' && !retried.current) {
      retried.current = true
      ensurePostMedia(post, { force: true }).catch(() => setFailed(true))
    } else {
      setFailed(true)
    }
  }, [post])

  if (item.type === 'video' && active && !failed) {
    return <VideoItem uri={keptUri || item.url} width={width} height={height} onError={onVideoError} />
  }
  const source = item.type === 'video' ? item.thumb || item.url : keptUri || item.url
  return (
    <View style={{ width, height }} className="items-center justify-center">
      <Image source={source} style={{ width, height }} contentFit="contain" onError={() => setFailed(true)} />
      {item.type === 'video' ? (
        <View className="absolute h-16 w-16 items-center justify-center rounded-full bg-black/50">
          <MaterialIcons name="play-arrow" size={40} color="#fff" />
        </View>
      ) : null}
      {failed && !keptUri ? (
        <NouText className="absolute bottom-6 text-sm text-zinc-300">{t('feed.mediaFailed')}</NouText>
      ) : null}
    </View>
  )
}

export const FeedGalleryModal = () => {
  const gallery = useValue(ui$.feedGallery)
  const postsByProfile = useValue(watch$.posts)
  const window = useWindowDimensions()
  // The room the gallery has, which the safe area can make smaller than the window: a video given
  // the window's height would have its controls cut off at the bottom.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const width = size?.width ?? window.width
  const height = size?.height ?? window.height
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)
  const listRef = useRef<FlatList<WatchMedia>>(null)

  const post = gallery ? findWatchPost(postsByProfile, gallery.profileKey, gallery.postKey) : undefined
  const media = post?.media || []

  const onClose = () => ui$.feedGallery.set(null)

  useEffect(() => {
    if (!gallery) return
    setIndex(gallery.index)
    setError(false)
    setCaptionOpen(false)
    const current = findWatchPost(watch$.posts.peek(), gallery.profileKey, gallery.postKey)
    if (current?.mediaComplete === false) {
      setLoading(true)
      ensurePostMedia(current)
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    }
  }, [gallery])

  useEffect(() => {
    if (!gallery) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      ui$.feedGallery.set(null)
      return true
    })
    return () => subscription.remove()
  }, [gallery])

  if (!gallery || !post) {
    return null
  }

  const save = async () => {
    try {
      const saved = await saveWatchPostMedia(post, index)
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

  return (
    <View
      className="absolute inset-0 z-20 bg-black"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout
        if (w && h && (w !== size?.width || h !== size?.height)) setSize({ width: w, height: h })
      }}
    >
      <FlatList
        ref={listRef}
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.min(gallery.index, Math.max(0, media.length - 1))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <GalleryItem post={post} index={i} item={item} active={i === index} width={width} height={height} />
        )}
      />
      {loading ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
      <SafeAreaView className="absolute left-0 right-0 top-0" edges={['top']} pointerEvents="box-none">
        <View className="flex-row items-center gap-2 px-3 py-2">
          <Pressable onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full bg-black/40">
            <MaterialIcons name="close" color="#fff" size={22} />
          </Pressable>
          <NouText className="flex-1 text-white">{media.length > 1 ? `${index + 1} / ${media.length}` : ''}</NouText>
          <Pressable
            onPress={() => void save()}
            accessibilityRole="button"
            accessibilityLabel={t('feed.saveMedia')}
            className="h-11 w-11 items-center justify-center rounded-full bg-black/40"
          >
            <MaterialIcons name="file-download" color="#fff" size={22} />
          </Pressable>
          <NouMenu
            trigger={
              <View className="h-11 w-11 items-center justify-center rounded-full bg-black/40">
                <MaterialIcons name="more-vert" color="#fff" size={22} />
              </View>
            }
            items={[
              { label: t('feed.openOn', { site: siteLabel[post.site] }), handler: openOriginal },
              { label: t('menus.share'), handler: () => share(post.url) },
            ]}
          />
        </View>
      </SafeAreaView>
      {error && !media.length ? (
        <View className="absolute inset-0 items-center justify-center px-8" pointerEvents="box-none">
          <NouText className="mb-4 text-center text-zinc-300">{t('feed.mediaFailed')}</NouText>
          <Pressable onPress={openOriginal} className="rounded-full bg-white/15 px-4 py-2">
            <NouText className="text-white">{t('feed.openOn', { site: siteLabel[post.site] })}</NouText>
          </Pressable>
        </View>
      ) : null}
      {post.text ? (
        <SafeAreaView className="absolute bottom-0 left-0 right-0" edges={['bottom']} pointerEvents="box-none">
          <Pressable
            onPress={() => setCaptionOpen((open) => !open)}
            className="bg-black/60 px-4 py-3"
            // Above the player's own controls, which take the bottom of a video.
            style={media[index]?.type === 'video' ? { marginBottom: VIDEO_CONTROLS_HEIGHT } : undefined}
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
    </View>
  )
}
