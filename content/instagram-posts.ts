import { INSTAGRAM_POST_KINDS, INSTAGRAM_USERNAME_PATTERN, getProfileUsername, isInstagramHost } from '../lib/instagram'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
// A media id is a number of up to 19 digits, which starts with the time it was made: the milliseconds
// since this moment, shifted by 23 bits. Some image addresses carry the id of the account after it,
// with nothing in between, so where the id ends is told by the time it would stand for.
const INSTAGRAM_EPOCH_MS = 1314220021721n
const MIN_MEDIA_ID_LENGTH = 15
const MAX_MEDIA_ID_LENGTH = 19
const DAY_MS = 86_400_000n

/**
 * The id at the start of a run of digits: the longest start of it that stands for a time that has
 * been, which is the whole of it unless more digits were glued on. Null when none does.
 */
export function pickMediaId(digits: string, now = Date.now()) {
  for (let length = Math.min(digits.length, MAX_MEDIA_ID_LENGTH); length >= MIN_MEDIA_ID_LENGTH; length--) {
    const id = digits.slice(0, length)
    if ((BigInt(id) >> 23n) + INSTAGRAM_EPOCH_MS <= BigInt(now) + DAY_MS) {
      return id
    }
  }
  return null
}

/**
 * The id of the post a picture belongs to, read from its address: Instagram marks
 * every picture with the id of its post, base64 encoded, as `ig_cache_key`. Null for
 * a picture that is not a post's, such as a profile photo.
 */
export function getMediaId(src: string, now = Date.now()) {
  try {
    const key = new URL(src).searchParams.get('ig_cache_key')
    if (!key) {
      return null
    }
    let encoded = key.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')
    while (encoded.length % 4) {
      encoded += '='
    }
    const digits = atob(encoded).match(/^\d+/)?.[0]
    return digits ? pickMediaId(digits, now) : null
  } catch {
    return null
  }
}

/** The short code in a post's address, which is its id written with 64 characters. */
export function toShortcode(mediaId: string) {
  if (!/^\d{1,19}$/.test(mediaId)) {
    return null
  }
  let rest = BigInt(mediaId)
  let code = ''
  while (rest > 0n) {
    code = ALPHABET[Number(rest % 64n)] + code
    rest /= 64n
  }
  return code || null
}

/** The embed page of the post that a picture on a profile belongs to, or null. */
export function getPostEmbedUrl(src: string, now = Date.now()) {
  const url = getPostUrl(src, now)
  return url ? getEmbedUrlForPage('www.instagram.com', new URL(url).pathname) : null
}

/** The address of the post that a picture on a profile belongs to, or null. */
export function getPostUrl(src: string, now = Date.now()) {
  const id = getMediaId(src, now)
  const code = id && toShortcode(id)
  return code ? `https://www.instagram.com/p/${code}/` : null
}

const POST_PAGE = new RegExp(`^/(?:${INSTAGRAM_USERNAME_PATTERN}/)?(${INSTAGRAM_POST_KINDS.join('|')})/([A-Za-z0-9_-]{5,})/?$`)

/**
 * Where a post's own page should be shown instead: its embed page. The page Instagram
 * gives a visitor without an account asks for the app in place of the post, or has no
 * player; the embed page has the player and needs nothing. Null for any other page, and
 * for the embed page itself.
 */
export function getEmbedUrlForPage(hostname: string, pathname: string) {
  if (!isInstagramHost(hostname)) {
    return null
  }
  const match = pathname.match(POST_PAGE)
  return match ? `https://www.instagram.com/${match[1]}/${match[2]}/embed/` : null
}

/** The link an embed page puts over a video that has ended, to watch it again on Instagram. */
export const isWatchAgainLink = (href: string | null | undefined) =>
  Boolean(href && /[?&]utm_campaign=embed_video_watch_again(&|$)/.test(href))

/** A profile or one of its tabs, the pages whose pictures are a grid of posts. */
export const isProfileGridPage = (hostname: string, pathname: string) =>
  getProfileUsername(hostname, pathname.replace(/\/(reels|tagged)\/?$/, '/')) !== null

/**
 * A visitor without an account gets a grid whose tiles are pictures with no link, and
 * a tap on one goes to a page asking for the app. The post is known all the same, from
 * the picture's address, so a tap opens it in this tab, as a tap on a link would.
 */
export function initInstagramPostOpener() {
  if (!isInstagramHost(document.location.hostname)) {
    return () => {}
  }

  // A visitor's post page is swapped for its embed page, also when the site moves to it
  // without loading a page, which is why this is checked again as the page changes.
  let redirectingTo = ''
  const redirectPostPage = () => {
    if (window.top !== window || !window.Nora?.getSettings?.().anonymousMode) {
      return
    }
    const embedUrl = getEmbedUrlForPage(document.location.hostname, document.location.pathname)
    // Asked once: the page goes on changing while the embed page is on its way, and each change
    // would start the move over.
    if (embedUrl && embedUrl !== redirectingTo) {
      redirectingTo = embedUrl
      document.location.replace(embedUrl)
    }
  }

  // When a video on an embed page has ended it goes back to the start and offers to watch it
  // again on Instagram, as a link to the post's own page, which asks for the app. Here it plays
  // again where it is.
  document.addEventListener(
    'click',
    (event) => {
      if (!window.Nora?.getSettings?.().anonymousMode || !/\/embed\/?$/.test(document.location.pathname)) {
        return
      }
      const link = (event.target as Element | null)?.closest?.('a')
      const video = document.querySelector('video')
      if (video && link && isWatchAgainLink(link.getAttribute('href'))) {
        event.preventDefault()
        event.stopImmediatePropagation()
        video.currentTime = 0
        void video.play().catch(() => {})
      }
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      if (!window.Nora?.getSettings?.().anonymousMode || !isProfileGridPage(document.location.hostname, document.location.pathname)) {
        return
      }
      // The tap is the person's own, with nothing held: a held key or another button asks for something else.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      // Only what was tapped is looked at, not what lies under it. A tile may sit inside a link of the
      // page's own, which would take the tap to the app, so a link around the picture is no reason to
      // leave it alone; but a button over the grid, or the sign-up link under which the grid goes on,
      // keeps doing what the page made it do.
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const pictures = target instanceof HTMLImageElement ? [target] : [...target.querySelectorAll('img')]
      const url = pictures.length === 1 ? getPostEmbedUrl(pictures[0].currentSrc || pictures[0].src) : null
      if (url) {
        event.preventDefault()
        event.stopImmediatePropagation()
        // In this tab, on the page that has the player, so that going back lands on the profile.
        document.location.assign(url)
      }
    },
    true,
  )

  redirectPostPage()
  return redirectPostPage
}
