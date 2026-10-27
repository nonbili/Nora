import type { WatchFetchResult, WatchMedia } from '../types'
import { decodeEntities, findWithKey, htmlAttribute, metaContent } from '../html'

export const INSTAGRAM_APP_ID = '936619743392459'

export const instagramProfileInfoUrl = (handle: string) =>
  `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`

const graphItem = (node: any): WatchMedia | null => {
  if (!node?.display_url) return null
  const size = { width: node.dimensions?.width, height: node.dimensions?.height }
  if (node.is_video) {
    return node.video_url ? { type: 'video', url: node.video_url, thumb: node.display_url, ...size } : null
  }
  return { type: 'image', url: node.display_url, ...size }
}

/** The media of a post in the shape of Instagram's older API: on its embed page, and in a profile's data with an account. */
const instagramGraphMedia = (node: any): { media: WatchMedia[]; mediaComplete: boolean } => {
  const children = node?.edge_sidecar_to_children?.edges
  const nodes = Array.isArray(children) && children.length ? children.map((edge: any) => edge?.node) : [node]
  const media = nodes.map(graphItem)
  // A video without its file, or a carousel without its photos, still has to be read from the embed page.
  const complete = media.every(Boolean) && !(node?.__typename === 'GraphSidecar' && !children?.length)
  return { media: media.filter((item: WatchMedia | null): item is WatchMedia => Boolean(item)), mediaComplete: complete }
}

/** The page Instagram embeds a post with: needs no account, and has the post's photos and video. */
export const instagramEmbedUrl = (code: string) => `https://www.instagram.com/p/${encodeURIComponent(code)}/embed/captioned/`

/**
 * Reads the media of a post from its embed page. A video or a carousel comes as data for the
 * page's player; a single photo only as the page's picture, the largest of its sizes.
 */
export function parseInstagramEmbed(html: string): WatchMedia[] {
  const context = html.match(/"contextJSON":"((?:[^"\\]|\\.)*)"/)
  if (context) {
    let shortcodeMedia: any
    try {
      shortcodeMedia = JSON.parse(JSON.parse(`"${context[1]}"`))?.gql_data?.shortcode_media
    } catch {}
    if (shortcodeMedia) {
      const { media } = instagramGraphMedia(shortcodeMedia)
      if (media.length) return media
    }
  }
  const image = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*>/)?.[0]
  if (image) {
    const srcset = image.match(/srcset="([^"]*)"/)?.[1]
    const candidates = (srcset ? decodeEntities(srcset).split(',') : [])
      .map((entry) => entry.trim().split(/\s+/))
      .map(([url, size]) => ({ url, width: parseInt(size, 10) || 0 }))
      .filter((candidate) => candidate.url)
      .sort((a, b) => b.width - a.width)
    const src = image.match(/src="([^"]*)"/)?.[1]
    const url = candidates[0]?.url || (src ? decodeEntities(src) : undefined)
    if (url) return [{ type: 'image', url }]
  }
  throw new Error('no media in the embed page')
}

export function parseInstagramProfileInfo(json: any, handle: string): WatchFetchResult {
  const user = json?.data?.user
  if (!user) {
    throw new Error(json?.message || 'no profile data')
  }
  const edges = user.edge_owner_to_timeline_media?.edges
  const posts: WatchFetchResult['posts'] = []
  for (const edge of Array.isArray(edges) ? edges : []) {
    const node = edge?.node
    if (!node?.shortcode) {
      continue
    }
    posts.push({
      id: node.shortcode,
      site: 'instagram',
      handle,
      url: `https://www.instagram.com/${node.product_type === 'clips' ? 'reel' : 'p'}/${node.shortcode}/`,
      text: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
      image: node.thumbnail_src || node.display_url,
      ...instagramGraphMedia(node),
      createdAtMs: (node.taken_at_timestamp || 0) * 1000,
    })
  }
  return { info: { name: user.full_name || undefined, avatar: user.profile_pic_url || undefined }, posts }
}

/**
 * What a browser sends for a page it navigates to. Instagram leaves the posts out of a
 * profile page it is asked for without these.
 */
export const INSTAGRAM_PAGE_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
}

// The ids of posts are made from the time they were made: milliseconds since Instagram's own epoch, in the bits above the lowest 23.
const INSTAGRAM_EPOCH_MS = 1314220021721

export const instagramPostTime = (pk: string) => {
  try {
    return Number(BigInt(pk) >> BigInt(23)) + INSTAGRAM_EPOCH_MS
  } catch {
    return 0
  }
}

const TIMELINE_KEY = 'polaris_ordered_timeline_connection'

/**
 * Reads the posts a profile page comes with, in the data it carries for its grid; the page
 * is the same with or without an account. The name and picture are read from its preview tags.
 */
export function parseInstagramProfilePage(html: string, handle: string): WatchFetchResult {
  let connection: any
  for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes(TIMELINE_KEY)) continue
    try {
      connection = findWithKey(JSON.parse(match[1]), TIMELINE_KEY)?.[TIMELINE_KEY]
    } catch {}
    if (connection) break
  }
  if (!Array.isArray(connection?.edges)) {
    throw new Error('no posts in the page')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const edge of connection.edges) {
    const node = edge?.node
    if (!node?.code) continue
    posts.push({
      id: node.code,
      site: 'instagram',
      handle,
      url: `https://www.instagram.com/${node.product_type === 'clips' ? 'reel' : 'p'}/${node.code}/`,
      text: node.caption?.text || '',
      image: node.display_uri || undefined,
      // Only the cover: the photos of a carousel and a video's file are on the post's embed page.
      media: node.display_uri
        ? [{ type: node.product_type === 'clips' || node.media_type === 2 ? 'video' : 'image', url: node.display_uri, thumb: node.display_uri }]
        : [],
      mediaComplete: false,
      createdAtMs: node.pk ? instagramPostTime(String(node.pk)) : 0,
    })
  }
  const title = metaContent(html, 'og:title')
  const name = title?.match(/^(.*?) \(@[^)]+\)/)?.[1]
  return { info: { name: name || undefined, avatar: metaContent(html, 'og:image') }, posts }
}

/** A profile on imginn, a site that shows Instagram profiles to anyone, behind Cloudflare's check for a browser. */
export const imginnProfileUrl = (handle: string) => `https://imginn.com/${encodeURIComponent(handle)}/`

const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** The id of a post from the code in its address, which is that id written in 64 letters. */
export const instagramShortcodePk = (code: string) => {
  let pk = BigInt(0)
  for (const char of code) {
    const digit = SHORTCODE_ALPHABET.indexOf(char)
    if (digit === -1) return ''
    pk = pk * BigInt(64) + BigInt(digit)
  }
  return pk.toString()
}

/**
 * Imginn's own address for a picture is behind its check too, but carries Instagram's: the path
 * and query of the picture on the server the query names, which needs no browser.
 */
export const imginnImageUrl = (src: string) => {
  const [, path, query] = src.split('?')
  const host = query && new URLSearchParams(query).get('_nc_ht')
  if (!path || !host || !/^[a-z0-9.-]+\.(?:cdninstagram\.com|fbcdn\.net)$/.test(host)) return undefined
  return `https://${host}/v/${path}?${query.replace(/&cache=1$/, '')}`
}

/**
 * Reads the posts of a profile's page on imginn: the first of its grid, the profile's pinned
 * posts among them. It tells neither when a post was made, which is read from its code, nor
 * whether it is a video, which the post's embed page tells with the rest of its media.
 */
export function parseImginnProfilePage(html: string, handle: string): WatchFetchResult {
  const userinfo = html.match(/<div class="userinfo"[\s\S]*?<\/h1>/)?.[0]
  if (!userinfo) {
    throw new Error('no posts in the page')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const [, code, img] of html.matchAll(/<div class="item"><div class="img"><a href="\/p\/([A-Za-z0-9_-]+)\/"[^>]*>(<img[^>]*>)/g)) {
    const src = htmlAttribute(img, 'src')
    const image = src ? imginnImageUrl(src) : undefined
    const pk = instagramShortcodePk(code)
    posts.push({
      id: code,
      site: 'instagram',
      handle,
      url: `https://www.instagram.com/p/${code}/`,
      text: htmlAttribute(img, 'alt') || '',
      image,
      media: image ? [{ type: 'image', url: image, thumb: image }] : [],
      mediaComplete: false,
      createdAtMs: pk ? instagramPostTime(pk) : 0,
    })
  }
  const avatar = htmlAttribute(userinfo.match(/<img[^>]*>/)?.[0] || '', 'src')
  const name = userinfo.match(/<h1>([^<]*)<\/h1>/)?.[1]
  return {
    info: { name: name ? decodeEntities(name).trim() || undefined : undefined, avatar: avatar ? imginnImageUrl(avatar) : undefined },
    posts,
  }
}
