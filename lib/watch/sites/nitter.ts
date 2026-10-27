import type { WatchFetchResult, WatchMedia, WatchQuote } from '../types'
import { decodeEntities, htmlAttribute, htmlTags } from '../html'
import { xPostTime } from './x'

/**
 * An instance's address as the user wrote it, made whole: with https when no scheme is given, and
 * without a path or a slash at the end. Empty for what is not one.
 */
export const normalizeNitterInstance = (input: string) => {
  const value = input.trim()
  if (!value) return ''
  const match = (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`).match(/^(https?):\/\/([^/?#\s]+)/i)
  if (!match || !/^[a-z0-9.-]+\.[a-z0-9-]+(?::\d+)?$|^localhost(?::\d+)?$|^[\d.]+(?::\d+)?$/i.test(match[2])) return ''
  return `${match[1].toLowerCase()}://${match[2].toLowerCase()}`
}

/** A profile's posts on a Nitter instance, as RSS: what most instances serve without a check for a browser. */
export const nitterRssUrl = (instance: string, handle: string) => `${instance}/${encodeURIComponent(handle)}/rss`

/** And its page, for an instance that serves no RSS. */
export const nitterProfileUrl = (instance: string, handle: string) => `${instance}/${encodeURIComponent(handle)}`

/**
 * Nitter serves X's pictures and videos from itself, under /pic/ or /video/, with X's own address
 * in its own, escaped or in base64: X's address, which needs no instance, is read from it. A path
 * without a host is on X's server of pictures.
 */
export const nitterImageUrl = (src: string) => {
  const path = src.match(/\/pic\/(?:orig\/)?(.+)$/)?.[1] || src.match(/\/video\/[^/]+\/(.+)$/)?.[1]
  if (!path) return src
  let decoded: string
  try {
    decoded = path.startsWith('enc/')
      ? atob(decodeURIComponent(path.slice(4)).replace(/-/g, '+').replace(/_/g, '/'))
      : decodeURIComponent(path)
  } catch {
    return src
  }
  decoded = decoded.replace(/^https?:\/\//, '')
  return `https://${/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i.test(decoded) ? decoded : `pbs.twimg.com/${decoded}`}`
}

// What the instance links to of itself, as on X; what it serves is linked with http too, whatever it is reached with.
const toX = (href: string, instance: string) => {
  if (href.startsWith('/')) return `https://x.com${href}`
  const host = instance.replace(/^https?:\/\//, '')
  return href.replace(new RegExp(`^https?://${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`, 'i'), 'https://x.com')
}

/** A picture by its address on the instance: a photo at up to 2048px, as X's own timeline is read. */
const nitterPicture = (src: string): WatchMedia => {
  const url = nitterImageUrl(src)
  // The size asked for of a link's card is part of its address.
  if (url.includes('/card_img/')) return { type: 'image', url, thumb: url }
  const thumb = url.replace(/\?.*$/, '')
  return { type: 'image', url: /\/media\//.test(thumb) ? `${thumb}?name=large` : thumb, thumb }
}

const nitterImage = (img: string): WatchMedia | undefined => {
  const src = htmlAttribute(img, 'src')
  return src ? nitterPicture(src) : undefined
}

// A link as its address, on X rather than the instance; a mention or a hashtag as it is shown. In
// RSS, a line break is a tag, which the source's own follow; in a page, the source's are the text's.
const nitterText = (html: string, instance: string, sourceBreaks = false) =>
  decodeEntities(
    (sourceBreaks ? html : html.replace(/\n/g, ''))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi, (_, attributes: string, inner: string) => {
        const href = htmlAttribute(` ${attributes}`, 'href')
        const shown = decodeEntities(inner.replace(/<[^>]+>/g, ''))
        if (!href || /^[@#$]/.test(shown)) return shown
        return toX(href, instance)
      })
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .trim()

/** The post a post quotes, as RSS tells it: who wrote it, its text and media, and a link to it. */
const nitterRssQuote = (html: string, instance: string): WatchQuote | undefined => {
  const quote = html.match(/<blockquote>([\s\S]*?)<\/blockquote>/)?.[1]
  const status = toX(htmlAttribute(quote?.match(/<cite>\s*<a\s[^>]*>/)?.[0] || '', 'href') || '', instance).match(
    /^https:\/\/x\.com\/([^/]+)\/status\/(\d+)/,
  )
  if (!quote || !status) return undefined
  const body = quote.replace(/<footer>[\s\S]*$/, '')
  const byline = body.match(/<b>([\s\S]*?)<\/b>/)?.[1]
  const text = body.match(/<p>\s*<p>([\s\S]*?)<\/p>/)?.[1] || ''
  return {
    handle: status[1],
    name: byline ? decodeEntities(byline).replace(/\s*\(@[^)]*\)\s*$/, '').trim() || undefined : undefined,
    url: `https://x.com/${status[1]}/status/${status[2]}`,
    text: nitterText(text, instance),
    media: htmlTags(body.replace(/<p>\s*<p>[\s\S]*?<\/p>/, ''), 'img').flatMap((img) => nitterImage(img) || []),
    createdAtMs: xPostTime(status[2]) || undefined,
  }
}

/**
 * A post as the feed's item tells it: its text in a paragraph, its photos or a video's cover after
 * it, and after a rule, the card of a link it shares or the post it quotes.
 */
const nitterDescription = (description: string, instance: string) => {
  const [body, ...rest] = description.split(/<hr\s*\/?>/i)
  const quote = nitterRssQuote(rest.join(''), instance)
  const paragraph = body.match(/<p>([\s\S]*)<\/p>/)?.[1] ?? body.replace(/<a\s[^>]*>(?:(?!<\/a>)[\s\S])*<img[\s\S]*?<\/a>/gi, '')
  const media = htmlTags(body.replace(/<p>[\s\S]*<\/p>/, ''), 'img').flatMap((img) => nitterImage(img) || [])
  const card = rest.join('').match(/<b>Link<\/b>[\s\S]*?<a\s([^>]*)>[\s\S]*?(<img[^>]*>)/)
  const cardImage = card ? nitterImage(card[2]) : undefined
  const cardHref = card ? htmlAttribute(` ${card[1]}`, 'href') : undefined
  return {
    text: nitterText(paragraph, instance),
    media,
    // A video or a GIF is only its cover here: one read before with its file keeps it.
    mediaComplete: !media.some((item) => /_video_thumb\//.test(item.url)),
    image: media[0]?.thumb || cardImage?.url,
    link: !media.length && cardImage && cardHref ? toX(cardHref, instance) : undefined,
    quote,
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** RSS's dates, as "Fri, 16 Oct 2026 19:42:20 GMT": not a format every engine's Date.parse reads. */
export function parseRssDate(value: string | undefined): number {
  const match = value?.match(/^(?:\w{3}, )?(\d{1,2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) (?:GMT|UTC|Z|([+-])(\d{2})(\d{2}))$/)
  if (!match) return 0
  const [, day, month, year, hours, minutes, seconds, sign, offsetHours, offsetMinutes] = match
  const monthIndex = MONTHS.indexOf(month)
  if (monthIndex === -1) return 0
  const offsetMs = sign ? (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60000 * (sign === '-' ? -1 : 1) : 0
  return Date.UTC(Number(year), monthIndex, Number(day), Number(hours), Number(minutes), Number(seconds)) - offsetMs
}

const xmlField = (xml: string, tag: string) => {
  const value = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]
  if (value === undefined) return undefined
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return cdata ? cdata[1] : decodeEntities(value)
}

/**
 * Reads the posts of a profile's RSS feed on a Nitter instance, newest first, its reposts among
 * them, without its replies or its pinned post.
 */
export function parseNitterRss(xml: string, handle: string, instance: string): WatchFetchResult {
  const channel = xml.match(/<channel>([\s\S]*?)(?:<item>|<\/channel>)/)?.[1]
  if (!channel) {
    throw new Error('not RSS')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const itemLink = xmlField(item, 'link') || xmlField(item, 'guid') || ''
    const id = itemLink.match(/\/status\/(\d+)/)?.[1]
    if (!id) continue
    const author = (xmlField(item, 'dc:creator') || '').replace(/^@/, '') || handle
    // Told by its title, as one of the profile's own posts it reposts has its own author.
    const reposted = /^RT by @/.test(xmlField(item, 'title') || '') || author.toLowerCase() !== handle.toLowerCase()
    const { text, media, mediaComplete, image, link, quote } = nitterDescription(xmlField(item, 'description') || '', instance)
    posts.push({
      id,
      site: 'x',
      handle,
      url: `https://x.com/${author}/status/${id}`,
      text,
      image,
      media,
      link,
      mediaComplete,
      // To the millisecond, as the page tells it, which its date is not.
      createdAtMs: xPostTime(id) || parseRssDate(xmlField(item, 'pubDate')?.trim()),
      repostOf: reposted ? author : undefined,
      // Its time is the post it shares: Nitter tells no other.
      repostedAtUnknown: reposted || undefined,
      quote,
    })
  }
  const name = xmlField(channel, 'title')?.match(/^(.*?) \/ @[^/]+$/)?.[1]
  const avatar = xmlField(channel.match(/<image>[\s\S]*?<\/image>/)?.[0] || '', 'url')
  return {
    info: { name: name?.trim() || undefined, avatar: avatar ? nitterImageUrl(avatar.trim()) : undefined },
    posts,
  }
}

// The file offered is the largest there is, up to 4K: a larger one is kept as its cover, as it would
// take much of the room media is given. A GIF's tells no size, and is small.
const NITTER_VIDEO_MAX_SIDE = 1920

const fitsVideo = (url: string) => {
  const size = url.match(/\/(\d+)x(\d+)\//)
  return !size || Math.max(Number(size[1]), Number(size[2])) <= NITTER_VIDEO_MAX_SIDE
}

/**
 * The photos, videos and GIFs of a post's page, in order: a video as X's file the instance offers to
 * download, or only its cover when it does not or the file is too large, which leaves it incomplete.
 */
const nitterPageMedia = (html: string): { media: WatchMedia[]; complete: boolean } => {
  let complete = true
  const media = html
    .split(/<div class="attachment[ "]/)
    .slice(1)
    .flatMap((attachment): WatchMedia[] => {
      const video = attachment.match(/<video\s[^>]*>/)?.[0]
      if (!video) {
        const href = attachment.match(/<a class="still-image"[^>]*>/)?.[0]
        const src = (href && htmlAttribute(href, 'href')) || htmlAttribute(attachment.match(/<img\s[^>]*>/)?.[0] || '', 'src')
        return src ? [nitterPicture(src)] : []
      }
      const poster = htmlAttribute(video, 'poster')
      const cover = poster ? nitterPicture(poster) : undefined
      const file =
        htmlAttribute(attachment.match(/<source\s[^>]*>/)?.[0] || '', 'src') ||
        htmlAttribute(attachment.match(/<a class="video-download"[^>]*>/)?.[0] || '', 'href')
      const url = file ? nitterImageUrl(file) : undefined
      if (url && /^https:\/\/video\.twimg\.com\/.*\.mp4(?:\?|$)/.test(url) && fitsVideo(url)) return [{ type: 'video', url, thumb: cover?.thumb }]
      complete = false
      return cover ? [cover] : []
    })
  return { media, complete }
}

const statusOf = (href: string | undefined) => href?.match(/^\/([^/]+)\/status\/(\d+)/)

const nitterPageQuote = (html: string, instance: string): WatchQuote | undefined => {
  const status = statusOf(htmlAttribute(html.match(/<a class="quote-link"[^>]*>/)?.[0] || '', 'href'))
  if (!status) return undefined
  const avatar = htmlAttribute(html.match(/<img class="avatar[^>]*>/)?.[0] || '', 'src')
  return {
    handle: status[1],
    name: htmlAttribute(html.match(/<a class="fullname"[^>]*>/)?.[0] || '', 'title') || undefined,
    // The size X's own timeline gives, not the smallest the instance shows a quote's with.
    avatar: avatar ? nitterImageUrl(avatar).replace(/_mini(\.\w+)$/, '_normal$1') : undefined,
    url: `https://x.com/${status[1]}/status/${status[2]}`,
    text: nitterText(html.match(/<div class="quote-text"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '', instance, true),
    media: nitterPageMedia(html.match(/<div class="quote-media-container">[\s\S]*/)?.[0] || '').media,
    createdAtMs: xPostTime(status[2]) || undefined,
  }
}

/**
 * Reads the posts of a profile's page on a Nitter instance, the same as its RSS feed has, but for
 * its pinned post, which is first, and its videos. An instance whose own request to X failed shows
 * the page with no posts, which is told as a failure: the profile has not lost them.
 */
export function parseNitterProfilePage(html: string, handle: string, instance: string): WatchFetchResult {
  const [head, ...items] = html.split(/<div class="timeline-item[ "]/)
  const posts: WatchFetchResult['posts'] = []
  const pinnedIds: string[] = []
  for (const item of items) {
    const status = statusOf(htmlAttribute(item.match(/<a class="tweet-link"[^>]*>/)?.[0] || '', 'href'))
    if (!status) continue
    const [, author, id] = status
    // What it shares and quotes come after its own text, its media, then its card, then its quote.
    const quoteAt = item.search(/<div class="quote[ "]/)
    const own = quoteAt === -1 ? item : item.slice(0, quoteAt)
    const cardAt = own.search(/<div class="card[ "]/)
    const { media, complete } = nitterPageMedia(cardAt === -1 ? own : own.slice(0, cardAt))
    const card = cardAt === -1 ? '' : own.slice(cardAt)
    const cardPoster = htmlAttribute(card.match(/<video\s[^>]*>/)?.[0] || '', 'poster')
    const cardSrc = cardPoster || htmlAttribute(card.match(/<img\s[^>]*>/)?.[0] || '', 'src')
    const cardHref = htmlAttribute(card.match(/<a class="card-(?:content-container|container)"[^>]*>/)?.[0] || '', 'href')
    const cardImage = cardSrc ? nitterPicture(cardSrc) : undefined
    if (/<div class="pinned">/.test(item)) pinnedIds.push(id)
    posts.push({
      id,
      site: 'x',
      handle,
      url: `https://x.com/${author}/status/${id}`,
      text: nitterText(own.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '', instance, true),
      image: media[0]?.thumb || cardImage?.url,
      media,
      link: !media.length && cardImage && cardHref ? toX(cardHref, instance) : undefined,
      // A video only its cover here: one read before with its file keeps it.
      mediaComplete: complete,
      createdAtMs: xPostTime(id),
      repostOf: /<div class="retweet-header">/.test(item) ? author : undefined,
      // Its time is the post it shares: Nitter tells no other.
      repostedAtUnknown: /<div class="retweet-header">/.test(item) || undefined,
      quote: quoteAt === -1 ? undefined : nitterPageQuote(item.slice(quoteAt), instance),
    })
  }
  if (!posts.length && !/<div class="profile-card[ "]/.test(head)) {
    throw new Error('no posts in the page')
  }
  if (!posts.length) {
    throw new Error('no posts on the instance')
  }
  const avatar = htmlAttribute(head.match(/<a class="profile-card-avatar"[\s\S]*?(<img[^>]*>)/)?.[1] || '', 'src')
  const name = htmlAttribute(head.match(/<a class="profile-card-fullname"[^>]*>/)?.[0] || '', 'title')
  return { info: { name: name || undefined, avatar: avatar ? nitterImageUrl(avatar) : undefined }, posts, pinnedIds }
}
