import type { WatchFetchResult, WatchMedia, WatchProfileInfo, WatchQuote } from '../types'

// When X began counting its ids from: the first bits of a post's id are the milliseconds since then.
const X_EPOCH_MS = 1288834974657

/** When a post on X was made, told by its id. */
export const xPostTime = (id: string) => {
  try {
    return Number(BigInt(id) / BigInt(4194304)) + X_EPOCH_MS
  } catch {
    return 0
  }
}

/** The page that embeds a profile's timeline; it needs no account, but may be behind. */
export const xTimelineUrl = (handle: string) =>
  `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/

const xImage = (tweet: any): string | undefined => {
  const media = tweet?.extended_entities?.media || tweet?.entities?.media
  return Array.isArray(media) ? media[0]?.media_url_https : undefined
}

// A video is kept at up to about 720p: what a phone shows well, at a fraction of the largest file.
const X_VIDEO_MAX_BITRATE = 2_500_000

/** The mp4 to keep of a video: the best one up to the bitrate above, or the smallest there is. */
export const pickXVideoVariant = (variants: { content_type?: string; bitrate?: number; url?: string }[] | undefined) => {
  const mp4s = (variants || []).filter((variant) => variant.content_type === 'video/mp4' && variant.url)
  const fitting = mp4s.filter((variant) => (variant.bitrate || 0) <= X_VIDEO_MAX_BITRATE)
  const sorted = (fitting.length ? fitting : mp4s).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
  return (fitting.length ? sorted[0] : sorted[sorted.length - 1])?.url
}

const xMedia = (tweet: any): WatchMedia[] => {
  const media = tweet?.extended_entities?.media || tweet?.entities?.media
  const items: WatchMedia[] = []
  for (const item of Array.isArray(media) ? media : []) {
    const thumb: string | undefined = item?.media_url_https
    if (!thumb) continue
    const width = item.original_info?.width
    const height = item.original_info?.height
    if (item.type === 'video' || item.type === 'animated_gif') {
      const url = pickXVideoVariant(item.video_info?.variants)
      if (url) items.push({ type: 'video', url, thumb, width, height })
    } else {
      // "large" is up to 2048px; the original can be several times that.
      items.push({ type: 'image', url: `${thumb}?name=large`, thumb, width, height })
    }
  }
  return items
}

// The text comes with its links shortened, and a link to the post's own media at the end.
const xText = (tweet: any): string => {
  let text: string = tweet?.full_text || tweet?.text || ''
  for (const url of tweet?.entities?.urls || []) {
    if (url?.url && url?.expanded_url) {
      text = text.split(url.url).join(url.expanded_url)
    }
  }
  for (const media of tweet?.entities?.media || []) {
    if (media?.url) {
      text = text.split(media.url).join('')
    }
  }
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

// A quote's text ends with the link to the post it quotes, which is shown below it instead.
const withoutXQuoteLink = (text: string, quotedId: string) =>
  text.replace(new RegExp(`\\s*https://(?:x|twitter)\\.com/\\w+/status/${quotedId}\\S*\\s*$`), '').trim()

const xQuote = (tweet: any): WatchQuote => {
  const screenName = tweet.user?.screen_name || ''
  return {
    handle: screenName,
    name: tweet.user?.name || undefined,
    avatar: tweet.user?.profile_image_url_https || undefined,
    url: `https://x.com/${screenName || 'i'}/status/${tweet.id_str}`,
    text: xText(tweet),
    media: xMedia(tweet),
    createdAtMs: parseXDate(tweet.created_at) || undefined,
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** X's dates, as "Fri Oct 16 19:42:20 +0000 2026": not a format every engine's Date.parse reads. */
export function parseXDate(value: string | undefined): number {
  const match = value?.match(/^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2}) (\d{4})$/)
  if (!match) return 0
  const [, month, day, hours, minutes, seconds, sign, offsetHours, offsetMinutes, year] = match
  const monthIndex = MONTHS.indexOf(month)
  if (monthIndex === -1) return 0
  const offsetMs = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60000 * (sign === '-' ? -1 : 1)
  return Date.UTC(Number(year), monthIndex, Number(day), Number(hours), Number(minutes), Number(seconds)) - offsetMs
}

export function parseXTimeline(html: string, handle: string): WatchFetchResult {
  const match = html.match(NEXT_DATA)
  if (!match) {
    throw new Error('no timeline data')
  }
  const data = JSON.parse(match[1])
  const entries = data?.props?.pageProps?.timeline?.entries
  if (!Array.isArray(entries)) {
    throw new Error('no timeline entries')
  }
  const info: WatchProfileInfo = {}
  const posts: WatchFetchResult['posts'] = []
  for (const entry of entries) {
    const tweet = entry?.content?.tweet
    if (entry?.type !== 'tweet' || !tweet?.id_str) {
      continue
    }
    const user = tweet.user
    if (!info.name && user?.screen_name?.toLowerCase() === handle.toLowerCase()) {
      info.name = user.name
      info.avatar = user.profile_image_url_https
    }
    const shown = tweet.retweeted_status || tweet
    const quoted = shown.quoted_status
    // A repost is told by the post it shares, as a Nitter instance tells it, which knows no other id:
    // the same repost read from either is one post. When it was reposted is its own.
    const reposted = tweet.retweeted_status?.id_str ? shown : undefined
    posts.push({
      id: reposted ? reposted.id_str : tweet.id_str,
      site: 'x',
      handle,
      url: reposted
        ? `https://x.com/${reposted.user?.screen_name || 'i'}/status/${reposted.id_str}`
        : `https://x.com${tweet.permalink || `/${user?.screen_name || handle}/status/${tweet.id_str}`}`,
      text: quoted?.id_str ? withoutXQuoteLink(xText(shown), quoted.id_str) : xText(shown),
      quote: quoted?.id_str ? xQuote(quoted) : undefined,
      image: xImage(shown),
      media: xMedia(shown),
      mediaComplete: true,
      createdAtMs: parseXDate(tweet.created_at),
      repostOf: tweet.retweeted_status ? shown.user?.screen_name : undefined,
    })
  }
  return { info, posts }
}
