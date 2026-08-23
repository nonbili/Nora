/**
 * YouTube serves its ads inside the same responses that carry the real content:
 * the player response lists ad breaks next to the video's formats, and the feed
 * responses mix promoted renderers into the item arrays. Nothing can be blocked
 * by URL, so the guard rewrites the payloads instead -- both the JSON the page
 * fetches from `/youtubei/v1/*` and the copies YouTube inlines into the HTML.
 *
 * These helpers are pure so they can be unit tested; `content/youtube.ts` is the
 * piece that hooks them into a page.
 */

// Keys on a player response that describe ad breaks. Dropping them leaves a
// player that has no ad to roll, which is why pre/mid-rolls disappear instead of
// merely being hidden.
const PLAYER_AD_KEYS = [
  'adBreakHeartbeatParams',
  'adPlacements',
  'adSlots',
  'adParams',
  'playerAds',
]

// Renderers that carry an ad or a promo instead of real content. Dropping the
// whole list item (rather than hiding it with css) also removes the grid cell,
// which is what otherwise leaves a blank tile in the feed.
const AD_RENDERER_KEYS = [
  'adSlotRenderer',
  'adsEngagementPanelRenderer',
  'bannerPromoRenderer',
  'brandVideoShelfRenderer',
  'brandVideoSingletonRenderer',
  'carouselAdRenderer',
  'compactPromotedItemRenderer',
  'compactPromotedVideoRenderer',
  'displayAdRenderer',
  'inFeedAdLayoutRenderer',
  'mealbarPromoRenderer',
  'primetimePromoRenderer',
  'promotedSparklesTextSearchRenderer',
  'promotedSparklesWebRenderer',
  'promotedVideoRenderer',
  'searchPyvRenderer',
  'statementBannerRenderer',
]

/** Endpoints whose responses can carry ads. */
export const RE_YOUTUBE_API = /^\/youtubei\/v1\/(browse|get_watch|guide|next|player|reel_watch_sequence|search)\b/

const YOUTUBE_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'youtubekids.com']

/**
 * Matches youtube.com and its subdomains (`www`, `m`, `music`), plus the
 * no-cookie host embeds use. Embedded players run on the same hosts as the site
 * itself, so one test covers both.
 */
export function isYouTubeHost(host: string) {
  const hostname = host.split(':')[0].toLowerCase()
  return YOUTUBE_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
}

export function isYouTubeAdApi(url: string, base?: string) {
  try {
    return RE_YOUTUBE_API.test(new URL(url, base).pathname)
  } catch {
    return false
  }
}

function isAdItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') {
    return false
  }

  const record = item as Record<string, any>
  // Wrappers keep the ad one level down, e.g. richItemRenderer.content.adSlotRenderer.
  const candidates = [
    record,
    record.richItemRenderer?.content,
    record.richSectionRenderer?.content,
    record.itemSectionRenderer?.contents?.length === 1 ? record.itemSectionRenderer.contents[0] : undefined,
  ].filter(Boolean)

  return candidates.some((candidate) => AD_RENDERER_KEYS.some((key) => candidate[key]))
}

/**
 * Walks the payload once, deleting the player's ad-break keys and dropping ad
 * items out of every array. The walk is depth-first over plain objects and
 * arrays only, so it never follows into strings or class instances. Mutates
 * `data` and returns it.
 */
export function stripYouTubeAds<T>(data: T): T {
  const seen = new WeakSet<object>()

  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || seen.has(node)) {
      return
    }
    seen.add(node)

    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }

    for (const key of PLAYER_AD_KEYS) {
      if (key in node) {
        delete node[key]
      }
    }

    for (const key of Object.keys(node)) {
      const value = node[key]
      if (Array.isArray(value)) {
        const filtered = value.filter((item) => !isAdItem(item))
        if (filtered.length !== value.length) {
          node[key] = filtered
        }
        node[key].forEach(walk)
      } else if (value && typeof value === 'object') {
        walk(value)
      }
    }
  }

  walk(data)
  return data
}

/**
 * Rewrites a `/youtubei/v1/*` response body. Returns the input untouched when it
 * isn't JSON -- YouTube also answers with protobuf-ish bodies for some clients,
 * and a failed parse must not break the page.
 */
export function transformYouTubeResponse(text: string) {
  if (!text || typeof text !== 'string') {
    return text
  }
  try {
    return JSON.stringify(stripYouTubeAds(JSON.parse(text)))
  } catch {
    return text
  }
}
