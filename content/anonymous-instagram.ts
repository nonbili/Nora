import { INSTAGRAM_POST_KINDS, INSTAGRAM_USERNAME_PATTERN, getProfileUsername, isInstagramHost } from '../lib/instagram'
import { isModeOn } from './anonymous'

const POST_PAGE = new RegExp(`^/(?:${INSTAGRAM_USERNAME_PATTERN}/)?(${INSTAGRAM_POST_KINDS.join('|')})/([A-Za-z0-9_-]{5,})/?$`)

/**
 * Where a post's own page should be shown instead: its embed page. A visitor without an
 * account gets the post behind a sign-up dialog; the embed page has the player and needs
 * nothing. Null for any other page, and for the embed page itself.
 */
export function getEmbedUrlForPage(hostname: string, pathname: string) {
  if (!isInstagramHost(hostname)) {
    return null
  }
  const match = pathname.match(POST_PAGE)
  // A reel is also linked to under /reels/, which has no embed page of its own.
  return match ? `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/embed/` : null
}

/** The embed page of the post a link on Instagram leads to, or null for a link to anything else. */
export function getLinkedPostEmbedUrl(href: string | null | undefined, base: string) {
  if (!href) {
    return null
  }
  try {
    const url = new URL(href, base)
    return getEmbedUrlForPage(url.hostname, url.pathname)
  } catch {
    return null
  }
}

/** The link an embed page puts over a video that has ended, to watch it again on Instagram. */
export const isWatchAgainLink = (href: string | null | undefined) =>
  Boolean(href && /[?&]utm_campaign=embed_video_watch_again(&|$)/.test(href))

/** The profile a profile page or one of its tabs, the pages whose pictures are a grid of posts, is of; null for any other page. */
export const getGridUsername = (hostname: string, pathname: string) =>
  getProfileUsername(hostname, pathname.replace(/\/(reels|tagged)\/?$/, '/'))

// Characters a profile name can have, so that the name is only found standing on its own.
const NAME_CHARACTER = /[a-z0-9._]/

/**
 * The words of the button the desktop site puts under the first posts of a profile, "More posts
 * from <profile>", which has to be pressed before the grid goes on as it is scrolled. They follow
 * the page's language, so the button is told by naming the profile, as a word of its own, among a
 * few other words.
 */
export function isMorePostsButtonText(text: string, username: string) {
  const words = text.trim().toLowerCase()
  const name = username.toLowerCase()
  const extra = words.length - name.length
  if (extra < 3 || extra > 40) {
    return false
  }
  for (let at = words.indexOf(name); at !== -1; at = words.indexOf(name, at + 1)) {
    if (!NAME_CHARACTER.test(words[at - 1] ?? '') && !NAME_CHARACTER.test(words[at + name.length] ?? '')) {
      return true
    }
  }
  return false
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
export function initAnonymousInstagram() {
  if (!isInstagramHost(document.location.hostname)) {
    return () => {}
  }

  // A visitor's post page is swapped for its embed page, also when the site moves to it
  // without loading a page, which is why this is checked again as the page changes.
  let redirectingTo = ''
  const redirectPostPage = () => {
    if (window.top !== window || !isModeOn()) {
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
  // A page brought back by going back keeps what it had asked for, though the move was not made in it.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      redirectingTo = ''
      redirectPostPage()
    }
  })

  // When a video on an embed page has ended it goes back to the start and offers to watch it
  // again on Instagram, as a link to the post's own page, which asks for the app. Here it plays
  // again where it is.
  document.addEventListener(
    'click',
    (event) => {
      if (!isModeOn() || !/\/embed\/?$/.test(document.location.pathname)) {
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

  // A tap on a profile: a tile, a link to its post that the site opens behind a sign-up dialog, opens
  // on the embed page in this tab, so that going back lands on the profile; the Reels tab, a
  // placeholder that opens a sign-up dialog, opens the reels at their address.
  document.addEventListener(
    'click',
    (event) => {
      const username = getGridUsername(document.location.hostname, document.location.pathname)
      // The person's own tap, with nothing held: a held key or another button asks for something else.
      if (
        window.top !== window ||
        !username ||
        !isModeOn() ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return
      }
      const tab = event.target.closest('main [role="tablist"] a[href="#"]')
      const tabs = tab ? [...tab.closest('[role="tablist"]')!.querySelectorAll('a')] : []
      const url = tab
        ? getProfileTabPath(username, tabs.indexOf(tab as HTMLAnchorElement), tabs.length)
        : getLinkedPostEmbedUrl(event.target.closest('a[href]')?.getAttribute('href'), document.location.href)
      if (url) {
        event.preventDefault()
        event.stopImmediatePropagation()
        document.location.assign(url)
      }
    },
    true,
  )

  // The grid of a visitor stops after the first posts until "More posts" is pressed; here it goes on
  // by itself, as it does with an account.
  const presses = new WeakMap<Element, { count: number; at: number }>()
  let pressed: Element | undefined
  // The page the press worked on: the button is gone, and is not looked for again there.
  let doneOn = ''
  let moreTimer: ReturnType<typeof setTimeout> | undefined
  const morePostsUsername = () => {
    const username = getGridUsername(document.location.hostname, document.location.pathname)
    return window.top === window && username && document.location.pathname !== doneOn && isModeOn() ? username : null
  }
  const pressMorePosts = () => {
    moreTimer = undefined
    if (pressed && !pressed.isConnected) {
      doneOn = document.location.pathname
      pressed = undefined
    }
    const username = morePostsUsername()
    if (!username) {
      return
    }
    for (const button of document.querySelectorAll('main [role="button"]')) {
      // Not a picture, such as a highlight named after the profile.
      if (button.closest('header, a') || button.querySelector('img, canvas, video') || !isMorePostsButtonText(button.textContent || '', username)) {
        continue
      }
      // A press that worked takes the button away; one that is still there is pressed again in a while.
      pressed = button
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
    // Coming back to a profile draws its button again.
    if (doneOn && document.location.pathname !== doneOn) {
      doneOn = ''
    }
    if (morePostsUsername()) {
      moreTimer ??= setTimeout(pressMorePosts, MORE_POSTS_CHECK_MS)
    }
  }

  onPageChange()
  return onPageChange
}
