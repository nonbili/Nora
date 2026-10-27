import type { WatchFetchResult, WatchMedia, WatchPost, WatchProfileInfo } from '../types'

// What TikTok's video files are asked for with: the cookie of the page they were read from, as the
// address is made for it, and its site as the referer.
export const TIKTOK_REFERER = 'https://www.tiktok.com/'

export const tiktokVideoHeaders = (chainToken: string | undefined): Record<string, string> | undefined =>
  chainToken ? { cookie: `tt_chain_token=${chainToken}`, referer: TIKTOK_REFERER } : undefined

/** The cookie TikTok makes its video addresses for, from a cookie header or the set-cookie of an answer. */
export const parseTikTokChainToken = (cookies: string | null | undefined) =>
  cookies?.match(/(?:^|[;,]\s*)tt_chain_token=([^;,\s]+)/)?.[1]

/** The page of one post, which has all its photos or its video: /video/ for both, as a photo's own page comes without them. */
export const tiktokPostPageUrl = (post: Pick<WatchPost, 'handle' | 'id'>) =>
  `https://www.tiktok.com/@${post.handle}/video/${post.id}`

const tiktokImageUrl = (image: any): string | undefined => {
  const list = image?.imageURL?.urlList
  return Array.isArray(list) && typeof list[0] === 'string' ? list[0] : undefined
}

/** The photos of a photo post, or its video, with its cover. */
const tiktokMedia = (item: any, headers?: Record<string, string>): WatchMedia[] => {
  const images = item?.imagePost?.images
  if (Array.isArray(images) && images.length) {
    return images.flatMap((image: any): WatchMedia[] => {
      const url = tiktokImageUrl(image)
      return url ? [{ type: 'image', url, width: image.imageWidth || undefined, height: image.imageHeight || undefined }] : []
    })
  }
  const video = item?.video
  if (!video?.playAddr) return []
  return [
    {
      type: 'video',
      url: video.playAddr,
      thumb: video.cover || video.originCover || undefined,
      width: video.width || undefined,
      height: video.height || undefined,
      ...(headers ? { headers } : {}),
    },
  ]
}

const tiktokPost = (item: any, handle: string, headers?: Record<string, string>): WatchFetchResult['posts'][number] | null => {
  if (!item?.id || item.isAd) return null
  const media = tiktokMedia(item, headers)
  const photo = Boolean(item.imagePost)
  const author = item.author?.uniqueId || handle
  return {
    id: String(item.id),
    site: 'tiktok',
    handle,
    url: `https://www.tiktok.com/@${author}/${photo ? 'photo' : 'video'}/${item.id}`,
    // Its lines are apart by line separators, which are not drawn as such.
    text: (item.desc || '').replace(/[\u2028\u2029]/g, '\n'),
    image: item.imagePost?.cover ? tiktokImageUrl(item.imagePost.cover) : media[0]?.thumb || media[0]?.url,
    media,
    mediaComplete: true,
    createdAtMs: (Number(item.createTime) || 0) * 1000,
  }
}

/**
 * Reads the posts of a TikTok profile from the answers its page asked for them with, as the hidden
 * webview keeps them: newest first, but those pinned to the top. `chainToken` is the cookie
 * the webview had, which its video addresses only work with.
 */
export function parseTikTokItemLists(html: string, handle: string, chainToken?: string): WatchFetchResult {
  const headers = tiktokVideoHeaders(chainToken)
  const posts: WatchFetchResult['posts'] = []
  const pinnedIds: string[] = []
  const seen = new Set<string>()
  let info: WatchProfileInfo = {}
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let json: any
    try {
      json = JSON.parse(match[1])
    } catch {
      continue
    }
    if (!Array.isArray(json?.itemList)) continue
    for (const item of json.itemList) {
      const post = tiktokPost(item, handle, headers)
      if (!post || seen.has(post.id)) continue
      seen.add(post.id)
      posts.push(post)
      if (item.isPinnedItem) pinnedIds.push(post.id)
      if (!info.name && item.author?.uniqueId?.toLowerCase() === handle.toLowerCase()) {
        info = { name: item.author.nickname || undefined, avatar: item.author.avatarLarger || item.author.avatarMedium || undefined }
      }
    }
  }
  if (!posts.length) {
    throw new Error('no posts in the page')
  }
  return { info, posts, pinnedIds }
}

/** The media of one post, and its cover, from its own page, read without the webview; `chainToken` is the cookie that page set. */
export function parseTikTokPostPage(html: string, chainToken?: string): { media: WatchMedia[]; cover?: string } {
  const data = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  let item: any
  try {
    item = data ? JSON.parse(data)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct : undefined
  } catch {}
  const post = item ? tiktokPost(item, item.author?.uniqueId || '', tiktokVideoHeaders(chainToken)) : null
  if (!post?.media?.length) {
    throw new Error('no media in the post page')
  }
  return { media: post.media, cover: post.image }
}
