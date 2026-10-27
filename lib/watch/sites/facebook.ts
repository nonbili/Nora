import type { WatchFetchResult, WatchMedia, WatchPost, WatchProfileInfo } from '../types'
import { FACEBOOK_NAME_PATH, isFacebookHost, isFacebookName } from '../target'
import { metaContent } from '../html'

// Parts of a post that are not of it: its likes and comments, and the pictures of who made it.
const FACEBOOK_SKIPPED_KEYS = new Set(['feedback', 'comet_feed_ufi_container', 'actors', 'profile_picture', 'owner'])

/**
 * The data documents of a page that have any of `markers` in them, by default those with posts or
 * the page's header: its own, and the answers kept as it was scrolled.
 */
const facebookDocuments = (html: string, markers = ['"post_id"', '"profile_header_renderer"']): any[] => {
  const documents: any[] = []
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!markers.some((marker) => match[1].includes(marker))) continue
    try {
      documents.push(JSON.parse(match[1]))
    } catch {}
  }
  return documents
}

// Where a page has the posts pinned to its top, and a group those it features, whatever their age.
const FACEBOOK_PINNED_KEYS = new Set(['profile_pinned_post', 'highlight_units'])

/**
 * The posts in some data, each once, in the order they come: what is inside a post, as what it
 * shares, is part of it. Those pinned to the top of the page are told in `pinned`.
 */
const facebookStories = (value: any, found: Map<string, any>, pinned = new Set<string>(), inPinned = false) => {
  if (!value || typeof value !== 'object') return
  if (!Array.isArray(value) && value.__typename === 'Story' && value.post_id) {
    const id = String(value.post_id)
    if (!found.has(id)) found.set(id, value)
    if (inPinned) pinned.add(id)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) facebookStories(item, found, pinned, inPinned)
    return
  }
  for (const [key, item] of Object.entries(value)) facebookStories(item, found, pinned, inPinned || FACEBOOK_PINNED_KEYS.has(key))
}

/** The first value under `key` in some data that `accept` takes, not looking into the keys of `skip`. */
const facebookFind = (value: any, key: string, accept: (found: any) => boolean, skip: Set<string>): any => {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = facebookFind(item, key, accept, skip)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (key in value && accept(value[key])) return value[key]
  for (const [name, item] of Object.entries(value)) {
    if (skip.has(name)) continue
    const found = facebookFind(item, key, accept, skip)
    if (found !== undefined) return found
  }
  return undefined
}

const OWN_PART = new Set([...FACEBOOK_SKIPPED_KEYS, 'attached_story'])

const isText = (value: any) => typeof value?.text === 'string' && Boolean(value.text)

/** The text of a post, or of a post it shares. */
const facebookText = (story: any, shared: boolean) =>
  facebookFind(shared ? story : story.comet_sections?.content?.story || story, 'message', isText, shared ? FACEBOOK_SKIPPED_KEYS : OWN_PART)?.text || ''

const facebookPhoto = (media: any): WatchMedia | null => {
  // The largest of the sizes given with an address: the one for the photo viewer can come without.
  const sizes = [media.viewer_image, media.photo_image, media.image].filter((size) => size?.uri)
  const full = sizes.sort((a, b) => (b.width || 0) - (a.width || 0))[0]
  if (!full) return null
  const thumb = media.image?.uri || media.photo_image?.uri || full.uri
  return { type: 'image', url: full.uri, thumb, width: full.width, height: full.height }
}

/** A video as a file to play; a video Facebook only streams is shown by its cover. */
const facebookVideo = (media: any): { item: WatchMedia | null; cover?: string } => {
  const delivery = media.videoDeliveryLegacyFields || media
  const url = delivery.browser_native_hd_url || delivery.browser_native_sd_url || media.playable_url_quality_hd || media.playable_url
  const cover = media.preferred_thumbnail?.image?.uri || media.thumbnailImage?.uri || media.image?.uri
  if (!url) return { item: null, cover }
  const size = { width: media.original_width || media.width, height: media.original_height || media.height }
  return { item: { type: 'video', url, thumb: cover, ...size }, cover }
}

/** The photos and videos of a post, and of a post it shares, each once and in order. */
const facebookMedia = (story: any): { media: WatchMedia[]; cover?: string } => {
  const media: WatchMedia[] = []
  const seen = new Set<string>()
  let cover: string | undefined
  const walk = (value: any) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    const type = value.__typename
    if (type === 'Photo' || type === 'Video') {
      // The same photo is there more than once, at times only by its id.
      const { item, cover: videoCover } = type === 'Photo' ? { item: facebookPhoto(value), cover: undefined } : facebookVideo(value)
      cover = cover || videoCover
      const key = value.id || item?.url
      if (item && !seen.has(key)) {
        seen.add(key)
        media.push(item)
      }
    }
    for (const [name, item] of Object.entries(value)) {
      if (!FACEBOOK_SKIPPED_KEYS.has(name)) walk(item)
    }
  }
  walk(story)
  return { media, cover: media[0]?.thumb || media[0]?.url || cover }
}

/** The name in the address of a page or profile, when it has one. */
const facebookName = (url: unknown) => {
  if (typeof url !== 'string') return undefined
  try {
    const { hostname, pathname } = new URL(url)
    const name = isFacebookHost(hostname) ? pathname.match(FACEBOOK_NAME_PATH)?.[1] : undefined
    return name && isFacebookName(name) ? name : undefined
  } catch {
    return undefined
  }
}

const hasActors = (value: any) => Array.isArray(value) && Boolean(value[0]?.id)

/**
 * The name and picture of a page, profile or group, from the header of its page: with an account
 * the page has no preview tags. A group has no picture of its own, and is shown by its cover.
 */
const facebookInfo = (documents: any[], html: string): WatchProfileInfo => {
  const header = facebookFind(documents, 'profile_header_renderer', (value) => Boolean(value?.user || value?.group), new Set())
  const profile = header?.user || header?.group
  const avatar =
    profile?.profilePicLarge?.uri ||
    profile?.profile_picture_for_sticky_bar?.uri ||
    profile?.cover_renderer?.cover_photo_content?.photo?.image?.uri
  return { name: profile?.name || metaContent(html, 'og:title'), avatar: avatar || metaContent(html, 'og:image') }
}

/**
 * Reads the posts of a page, profile or group on Facebook from the data its page comes with, and
 * that it brings as it is scrolled. Ads are left out.
 */
export function parseFacebookPage(html: string, handle: string): WatchFetchResult {
  const documents = facebookDocuments(html)
  const stories = new Map<string, any>()
  const pinned = new Set<string>()
  for (const document of documents) facebookStories(document, stories, pinned)
  const posts: WatchFetchResult['posts'] = []
  for (const [id, story] of stories) {
    if (story.sponsored_data) continue
    const createdAt = facebookFind(story, 'creation_time', (value) => typeof value === 'number', OWN_PART)
    const url = facebookFind(story, 'permalink_url', (value) => typeof value === 'string', OWN_PART)
    if (!createdAt || !url) continue
    const shared = story.attached_story || story.comet_sections?.content?.story?.attached_story
    const author = facebookFind(story, 'actors', hasActors, FACEBOOK_SKIPPED_KEYS)?.[0]
    const sharedAuthor = shared ? facebookFind(shared, 'actors', hasActors, new Set())?.[0] : undefined
    const { media, cover } = facebookMedia(story)
    posts.push({
      id,
      site: 'facebook',
      handle,
      url,
      // A post that shares another without a word of its own shows the other's.
      text: facebookText(story, false) || (shared ? facebookText(shared, true) : ''),
      image: cover,
      media,
      mediaComplete: true,
      createdAtMs: createdAt * 1000,
      repostOf: sharedAuthor && sharedAuthor.id !== author?.id ? facebookName(sharedAuthor.url) : undefined,
    })
  }
  if (!posts.length) {
    throw new Error('no posts')
  }
  return { info: facebookInfo(documents, html), posts, pinnedIds: posts.filter((post) => pinned.has(post.id)).map((post) => post.id) }
}

// A video's address, as a reel or on a page: /reel/id/ or /name/videos/title/id/; or /watch/?v=id.
const FACEBOOK_VIDEO_PATH = /\/(?:reel|videos)\/(?:[^/?#]+\/)?(\d+)\/?(?:[?#]|$)|\/watch\/?\?(?:[^#]*&)?v=(\d+)/

/** The video with this id in some data, with the addresses it is played from, or its cover at least. */
const facebookVideoById = (value: any, id: string): any => {
  if (!value || typeof value !== 'object') return undefined
  if (!Array.isArray(value) && value.__typename === 'Video' && value.id === id) {
    const { item, cover } = facebookVideo(value)
    if (item || cover) return value
  }
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const found = facebookVideoById(item, id)
    if (found) return found
  }
  return undefined
}

/**
 * The photos and videos of one post at addresses that work now, from the post's own page, with
 * its cover, which is all there is of a video Facebook only streams. A video or reel is sent on
 * to the video's page, which has the video, not the post.
 */
export function parseFacebookPostPage(html: string, post: Pick<WatchPost, 'id' | 'url'>): { media: WatchMedia[]; cover?: string } {
  const stories = new Map<string, any>()
  for (const document of facebookDocuments(html)) facebookStories(document, stories)
  const story = stories.get(post.id)
  if (story) return facebookMedia(story)
  const match = post.url.match(FACEBOOK_VIDEO_PATH)
  const videoId = match?.[1] || match?.[2]
  if (videoId) {
    for (const document of facebookDocuments(html, [`"${videoId}"`])) {
      const video = facebookVideoById(document, videoId)
      if (video) {
        const { item, cover } = facebookVideo(video)
        return { media: item ? [item] : [], cover }
      }
    }
  }
  throw new Error('no post in the page')
}

/**
 * Whether the posts read from a page reach back to a time: the last of them, the furthest down
 * the page, is no newer. A pinned post comes first whatever its age, and does not tell.
 */
export const reachesBackTo = (posts: Pick<WatchPost, 'id' | 'createdAtMs'>[], time: number | undefined, pinnedIds: string[] = []) => {
  const listed = posts.filter((post) => !pinnedIds.includes(post.id))
  return time !== undefined && listed.length > 0 && listed[listed.length - 1].createdAtMs <= time
}

/** Whether Facebook answered with a page that is not the one asked for: what it shows without an account, for most. */
export const isFacebookErrorPage = (html: string) => html.includes('"comet.fbweb.CometErrorRoute"')
