import { INSTAGRAM_POST_KINDS, INSTAGRAM_USERNAME_PATTERN, getProfileUsername, isInstagramHost } from '../lib/instagram'

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

/** The embed page of the post a link on Instagram leads to, or null for a link to anything else. */
export function getLinkedPostEmbedUrl(href: string | null | undefined, base: string) {
  try {
    const url = new URL(href || '', base)
    return href ? getEmbedUrlForPage(url.hostname, url.pathname) : null
  } catch {
    return null
  }
}

/** The link an embed page puts over a video that has ended, to watch it again on Instagram. */
export const isWatchAgainLink = (href: string | null | undefined) =>
  Boolean(href && /[?&]utm_campaign=embed_video_watch_again(&|$)/.test(href))

/** The profile a profile page or one of its tabs is of, or null for any other page. */
const getGridUsername = (hostname: string, pathname: string) =>
  getProfileUsername(hostname, pathname.replace(/\/(reels|tagged)\/?$/, '/'))

/** A profile or one of its tabs, the pages whose pictures are a grid of posts. */
export const isProfileGridPage = (hostname: string, pathname: string) => getGridUsername(hostname, pathname) !== null

/**
 * The words of the button the desktop site puts under the first posts of a profile, "More posts
 * from <profile>", which has to be pressed before the grid goes on as it is scrolled. They follow
 * the page's language, so the button is told by naming the profile among a few other words.
 */
export function isMorePostsButtonText(text: string, username: string) {
  const words = text.trim().toLowerCase()
  const extra = words.length - username.length
  return extra >= 3 && extra <= 40 && words.includes(username.toLowerCase())
}

/**
 * Where a tab of a profile leads that the desktop site gives a visitor only as a placeholder: the
 * tabs are Posts, Reels and Tagged, in that order. Reels opens for a visitor at its own address;
 * Tagged needs an account. Null for any other tab.
 */
export function getProfileTabPath(username: string, index: number, count: number) {
  return count === 3 && index === 1 ? `/${username}/reels/` : null
}

const MORE_POSTS_CHECK_MS = 500
// The button is drawn before the page's code has taken it over, and a press then does nothing.
const MORE_POSTS_PRESS_AGAIN_MS = 1500
const MORE_POSTS_MAX_PRESSES = 5

/**
 * What the anonymous mode changes on Instagram's desktop site: a post opens on its embed page,
 * which has the player, and the parts of a profile that a visitor gets as sign-up prompts work.
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
      // A tile is a link to its post, which the site opens behind a sign-up dialog. Only what was
      // tapped counts: one picture, in a link to a post.
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const pictures = target instanceof HTMLImageElement ? [target] : [...target.querySelectorAll('img')]
      const link = pictures.length === 1 ? target.closest('a[href]') : null
      const url = getLinkedPostEmbedUrl(link?.getAttribute('href'), document.location.href)
      if (url) {
        event.preventDefault()
        event.stopImmediatePropagation()
        // In this tab, on the page that has the player, so that going back lands on the profile.
        document.location.assign(url)
      }
    },
    true,
  )

  // The Reels tab of a visitor opens a sign-up dialog instead of the reels, which are there at their address.
  document.addEventListener(
    'click',
    (event) => {
      const username = getGridUsername(document.location.hostname, document.location.pathname)
      const tab = event.target instanceof Element ? event.target.closest('main [role="tablist"] a[href="#"]') : null
      if (!tab || !username || !window.Nora?.getSettings?.().anonymousMode) {
        return
      }
      const tabs = [...tab.closest('[role="tablist"]')!.querySelectorAll('a')]
      const path = getProfileTabPath(username, tabs.indexOf(tab as HTMLAnchorElement), tabs.length)
      if (path) {
        event.preventDefault()
        event.stopImmediatePropagation()
        document.location.assign(path)
      }
    },
    true,
  )

  // The grid of a visitor stops after the first posts until "More posts" is pressed; here it goes on
  // by itself, as it does with an account.
  const presses = new WeakMap<Element, { count: number; at: number }>()
  let moreTimer: ReturnType<typeof setTimeout> | undefined
  const pressMorePosts = () => {
    moreTimer = undefined
    const username = getGridUsername(document.location.hostname, document.location.pathname)
    if (window.top !== window || !username || !window.Nora?.getSettings?.().anonymousMode) {
      return
    }
    for (const button of document.querySelectorAll('main [role="button"]')) {
      if (button.closest('header, a') || !isMorePostsButtonText(button.textContent || '', username)) {
        continue
      }
      // A press that worked takes the button away; one that is still there is pressed again in a while.
      const last = presses.get(button) ?? { count: 0, at: 0 }
      if (last.count < MORE_POSTS_MAX_PRESSES && Date.now() - last.at >= MORE_POSTS_PRESS_AGAIN_MS) {
        presses.set(button, { count: last.count + 1, at: Date.now() })
        ;(button as HTMLElement).click()
      }
      if (presses.get(button)!.count < MORE_POSTS_MAX_PRESSES) {
        moreTimer ??= setTimeout(pressMorePosts, MORE_POSTS_PRESS_AGAIN_MS)
      }
    }
  }

  const onPageChange = () => {
    redirectPostPage()
    moreTimer ??= setTimeout(pressMorePosts, MORE_POSTS_CHECK_MS)
  }

  onPageChange()
  return onPageChange
}
