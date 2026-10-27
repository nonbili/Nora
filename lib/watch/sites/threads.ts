import type { WatchFetchResult, WatchMedia, WatchPost } from '../types'
import { findWithKey, metaContent } from '../html'

const THREADS_MEDIA_KEY = 'mediaData'

const threadsItem = (item: any): WatchMedia | null => {
  const image: string | undefined = item?.image_versions2?.candidates?.[0]?.url
  const size = { width: item?.original_width || undefined, height: item?.original_height || undefined }
  const video: string | undefined = item?.video_versions?.[0]?.url
  if (video) return { type: 'video', url: video, thumb: image, ...size }
  return image ? { type: 'image', url: image, ...size } : null
}

const threadsMedia = (post: any): WatchMedia[] => {
  const items = Array.isArray(post?.carousel_media) && post.carousel_media.length ? post.carousel_media : [post]
  return items.map(threadsItem).filter((item: WatchMedia | null): item is WatchMedia => Boolean(item))
}

/**
 * Reads the posts a Threads profile page comes with, the same with or without an account. Each is
 * the first of its thread: the others are the author's replies to it.
 */
export function parseThreadsProfilePage(html: string, handle: string): WatchFetchResult {
  let mediaData: any
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes(`"${THREADS_MEDIA_KEY}"`)) continue
    try {
      mediaData = findWithKey(JSON.parse(match[1]), THREADS_MEDIA_KEY)?.[THREADS_MEDIA_KEY]
    } catch {}
    if (Array.isArray(mediaData?.edges)) break
  }
  if (!Array.isArray(mediaData?.edges)) {
    throw new Error('no posts in the page')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const edge of mediaData.edges) {
    const post = edge?.node?.thread_items?.[0]?.post
    if (!post?.code) continue
    const reposted = post.text_post_app_info?.share_info?.reposted_post
    const shown = reposted?.code ? reposted : post
    const media = threadsMedia(shown)
    const quoted = shown.text_post_app_info?.share_info?.quoted_post
    posts.push({
      id: shown.code,
      site: 'threads',
      handle,
      url: `https://www.threads.com/@${shown.user?.username || handle}/post/${shown.code}`,
      text: shown.caption?.text || '',
      quote: quoted?.code
        ? {
            handle: quoted.user?.username || '',
            avatar: quoted.user?.profile_pic_url || undefined,
            url: `https://www.threads.com/@${quoted.user?.username || handle}/post/${quoted.code}`,
            text: quoted.caption?.text || '',
            media: threadsMedia(quoted),
            createdAtMs: quoted.taken_at ? quoted.taken_at * 1000 : undefined,
          }
        : undefined,
      image: media[0]?.thumb || media[0]?.url,
      media,
      mediaComplete: true,
      // A repost shows up when it was reposted.
      createdAtMs: (post.taken_at || shown.taken_at || 0) * 1000,
      repostOf: shown !== post ? shown.user?.username : undefined,
    })
  }
  const title = metaContent(html, 'og:title')
  const name = title?.match(/^(.*?) \(@[^)]+\)/)?.[1]
  return { info: { name: name || undefined, avatar: metaContent(html, 'og:image') }, posts }
}

/** The page of one post, which has all its photos and videos, as a profile page does for its newest; on Facebook too. */
export const threadsPostUrl = (post: Pick<WatchPost, 'url'>) => post.url

const findPostWithCode = (value: any, code: string): any => {
  if (!value || typeof value !== 'object') return undefined
  if (!Array.isArray(value) && value.code === code && (value.image_versions2 || value.carousel_media || value.video_versions)) {
    return value
  }
  for (const child of Object.values(value)) {
    const found = findPostWithCode(child, code)
    if (found) return found
  }
  return undefined
}

/** Reads the photos and videos of a post from its own page, which needs no account. */
export function parseThreadsPostPage(html: string, code: string): WatchMedia[] {
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes(`"code":"${code}"`)) continue
    let post: any
    try {
      post = findPostWithCode(JSON.parse(match[1]), code)
    } catch {}
    const media = post ? threadsMedia(post) : []
    if (media.length) return media
  }
  throw new Error('no media in the post page')
}
