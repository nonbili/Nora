import type { WatchFetchResult, WatchMedia } from '../types'
import { decodeEntities, htmlAttribute, htmlTags, htmlToText } from '../html'

const redditName = (handle: string) => encodeURIComponent(handle.slice(2))

/** The newest posts of a subreddit, r/name, or of a user, u/name, as Reddit's own pages load them: it needs no account. */
export const redditPostsUrl = (handle: string) =>
  handle.startsWith('u/')
    ? `https://www.reddit.com/svc/shreddit/profiles/profile_posts-more-posts/new/?name=${redditName(handle)}`
    : `https://www.reddit.com/svc/shreddit/community-more-posts/new/?name=${redditName(handle)}`

/** The same posts as data, which Reddit answers only with an account. */
export const redditListingUrl = (handle: string) =>
  handle.startsWith('u/')
    ? `https://www.reddit.com/user/${redditName(handle)}/submitted.json?sort=new&raw_json=1&sr_detail=1`
    : `https://www.reddit.com/r/${redditName(handle)}/new.json?raw_json=1&sr_detail=1`

/** The card a subreddit's name shows when pointed at, which has its picture. */
export const redditCommunityCardUrl = (handle: string) => `https://www.reddit.com/svc/shreddit/community-hover-card/${redditName(handle)}`

const REDDIT_IMAGE = /^https:\/\/(?:i\.redd\.it|i\.imgur\.com)\/[^?#]+\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i

// Links that are of the post itself, not one it shares.
const REDDIT_OWN_LINK = /^(?:\/|https:\/\/(?:(?:www\.)?reddit\.com|v\.redd\.it|i\.redd\.it|preview\.redd\.it)\/)/

// The subreddit a user's own posts are in.
const redditHome = (handle: string) => (handle.startsWith('u/') ? `u_${handle.slice(2)}` : handle.slice(2)).toLowerCase()

const redditPostText = (title: string, body: string, link: string | undefined) => {
  const shared = link && !REDDIT_OWN_LINK.test(link) ? link : undefined
  return [title, body, shared].filter(Boolean).join('\n\n')
}

// Marks where an item of a list starts, until the text is made: a line of the post may start with "- " itself.
const LIST_ITEM = '\u0001'

/**
 * The text of a post's body given as HTML, whose line breaks are only its layout: paragraphs,
 * headings and the items of lists are each a block of their own, and a block of code keeps its
 * lines and their indents.
 */
const redditBodyText = (html: string) => {
  const code: string[] = []
  const flowing = html
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, block: string) => {
      code.push(decodeEntities(block.replace(/<[^>]+>/g, '')).replace(/^\n+|\s+$/g, ''))
      return `<p>\u0000${code.length - 1}\u0000</p>`
    })
    .replace(/\s+/g, ' ')
    .replace(/<li\b[^>]*>/gi, `\n\n${LIST_ITEM}`)
    .replace(/<\/?(?:p|div|ul|ol|li|h[1-6]|blockquote|table|tr)\b[^>]*>|<hr\b[^>]*>/gi, '\n\n')
  return htmlToText(flowing, 'https://www.reddit.com')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    // The items of a list are a line each, the first right under what leads to it.
    .replace(new RegExp(`(?:^|\\n+)${LIST_ITEM}\\n*`, 'g'), '\n- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\u0000(\d+)\u0000/g, (_, index: string) => code[Number(index)])
}

/** A post's media as Reddit's data has it: all the photos of a gallery; a video only as its cover, which opens the post. */
const redditListingMedia = (post: any): { media: WatchMedia[]; cover?: string } => {
  const preview = post.preview?.images?.[0]
  const cover: string | undefined = preview?.resolutions?.findLast((size: any) => size.width <= 640)?.url || preview?.source?.url
  if (post.is_gallery) {
    const media: WatchMedia[] = []
    for (const item of post.gallery_data?.items || []) {
      const meta = post.media_metadata?.[item?.media_id]
      if (meta?.status !== 'valid') continue
      const thumb = meta.p?.findLast((size: any) => size.x <= 640)?.u
      const size = { width: meta.s?.x, height: meta.s?.y }
      if (meta.e === 'AnimatedImage' && meta.s?.mp4) media.push({ type: 'video', url: meta.s.mp4, thumb, ...size })
      else if (meta.s?.u || meta.s?.gif) media.push({ type: 'image', url: meta.s.u || meta.s.gif, thumb, ...size })
    }
    return { media, cover: media[0]?.thumb || media[0]?.url }
  }
  const size = { width: preview?.source?.width, height: preview?.source?.height }
  const gif = preview?.variants?.mp4?.source?.url
  if (gif && !post.is_video) return { media: [{ type: 'video', url: gif, thumb: cover, ...size }], cover }
  if (REDDIT_IMAGE.test(post.url || '')) return { media: [{ type: 'image', url: post.url, thumb: cover, ...size }], cover }
  return { media: [], cover }
}

/** Reads the posts of a subreddit or a user from Reddit's data, as asked for with an account. */
export function parseRedditListing(json: any, handle: string): WatchFetchResult {
  const children = json?.data?.children
  if (!Array.isArray(children)) {
    throw new Error(json?.message || 'no posts')
  }
  const posts: WatchFetchResult['posts'] = []
  let avatar: string | undefined
  for (const child of children) {
    const post = child?.data
    if (child?.kind !== 't3' || !post?.id || !post.permalink) continue
    const home = post.sr_detail
    if (!avatar && home && String(post.subreddit).toLowerCase() === redditHome(handle)) {
      avatar = home.community_icon || home.icon_img || undefined
    }
    // A crosspost shows the post it shares.
    const shown = post.crosspost_parent_list?.[0] || post
    const { media, cover } = redditListingMedia(shown)
    posts.push({
      id: post.id,
      site: 'reddit',
      handle,
      url: `https://www.reddit.com${post.permalink}`,
      text: redditPostText(post.title || '', shown.selftext_html ? redditBodyText(shown.selftext_html) : shown.selftext || '', shown.is_self || shown.is_gallery ? undefined : shown.url),
      image: cover || media[0]?.url,
      media,
      mediaComplete: true,
      createdAtMs: (post.created_utc || 0) * 1000,
    })
  }
  return { info: { avatar }, posts }
}

// Reddit's times have microseconds and an offset without a colon, which not every engine reads.
const redditTime = (value = '') => Date.parse(value.replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) || 0

/** A post's media as its card on Reddit's page shows it, as `redditListingMedia` does. */
const redditCardMedia = (card: string, link: string | undefined): { media: WatchMedia[]; cover?: string } => {
  const gallery = card.match(/<gallery-carousel[\s\S]*?<\/gallery-carousel>/)?.[0]
  if (gallery) {
    const media: WatchMedia[] = []
    for (const [page] of gallery.matchAll(/<li[\s\S]*?<\/li>/g)) {
      const images = htmlTags(page, 'img')
      const full = images.map((image) => htmlAttribute(image, 'src')).find((src) => src && REDDIT_IMAGE.test(src))
      const first = images[0] || ''
      const thumb = first && (htmlAttribute(first, 'src') || htmlAttribute(first, 'data-lazy-src'))
      const url = full || thumb
      if (!url) continue
      media.push({ type: 'image', url, thumb, width: Number(htmlAttribute(first, 'width')) || undefined, height: Number(htmlAttribute(first, 'height')) || undefined })
    }
    return { media, cover: media[0]?.thumb || media[0]?.url }
  }
  const player = htmlTags(card, 'shreddit-player')[0]
  if (player) {
    const cover = htmlAttribute(player, 'poster')
    const src = htmlAttribute(player, 'src')
    // A gif is played from a file; a video is streamed, so it is only shown by its cover.
    if (/\sgif[\s>]/.test(player) && src && /[?&]format=mp4\b/.test(src)) return { media: [{ type: 'video', url: src, thumb: cover }], cover }
    return { media: [], cover }
  }
  const images = htmlTags(card, 'img')
  // The pictures of the post are named after it, "r/name - title"; an author's picture is not.
  const shown = images.filter((image) => / - /.test(htmlAttribute(image, 'alt') || ''))
  const primary = images.find((image) => /\sdata-post-media-primary[\s>=]/.test(image)) || shown[0]
  const cover = primary && htmlAttribute(primary, 'src')
  const full = link && REDDIT_IMAGE.test(link) ? link : shown.map((image) => htmlAttribute(image, 'src')).find((src) => src && REDDIT_IMAGE.test(src))
  if (!full) return { media: [], cover }
  const sized = images.find((image) => htmlAttribute(image, 'width') && htmlAttribute(image, 'height'))
  const size = sized ? { width: Number(htmlAttribute(sized, 'width')) || undefined, height: Number(htmlAttribute(sized, 'height')) || undefined } : {}
  return { media: [{ type: 'image', url: full, thumb: cover, ...size }], cover }
}

/** Reads the posts of a subreddit or a user from the cards of Reddit's page, which leaves out its ads. */
export function parseRedditPosts(html: string, handle: string): WatchFetchResult {
  const posts: WatchFetchResult['posts'] = []
  let avatar: string | undefined
  for (const [card] of html.matchAll(/<shreddit-post\s[\s\S]*?<\/shreddit-post>/g)) {
    const tag = card.match(/^<shreddit-post\s[^>]*>/)?.[0] || ''
    const id = htmlAttribute(tag, 'id')?.replace(/^t3_/, '')
    const permalink = htmlAttribute(tag, 'permalink')
    if (!id || !permalink || /\s(?:post-)?promoted[\s>=]/.test(tag)) continue
    // A user's own picture is on each of their posts.
    if (!avatar && handle.startsWith('u/') && htmlAttribute(tag, 'author')?.toLowerCase() === handle.slice(2).toLowerCase()) {
      avatar = htmlAttribute(tag, 'icon')
    }
    const link = htmlAttribute(tag, 'content-href')
    const body = card.match(/-post-rtjson-content"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    const text = body ? redditBodyText(body) : ''
    const { media, cover } = redditCardMedia(card, link)
    posts.push({
      id,
      site: 'reddit',
      handle,
      url: `https://www.reddit.com${permalink}`,
      text: redditPostText(htmlAttribute(tag, 'post-title') || '', text, link),
      image: cover || media[0]?.url,
      media,
      mediaComplete: true,
      createdAtMs: redditTime(htmlAttribute(tag, 'created-timestamp')),
    })
  }
  // A page without posts is what Reddit answers with for a name it does not have.
  if (!posts.length) {
    throw new Error('no posts')
  }
  return { info: { avatar }, posts }
}

/** A subreddit's picture, from its card; none when it has the one Reddit gives all. */
export const parseRedditCommunityCard = (html: string) => {
  const src = html.match(/<img\s[^>]*src="(https:\/\/styles\.redditmedia\.com\/[^"]*communityIcon[^"]*)"/)?.[1]
  return src ? decodeEntities(src) : undefined
}
