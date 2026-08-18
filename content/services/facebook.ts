import type { UserStylesSnapshot } from '../../lib/user-styles'
import { noraUserStylesEvent } from '../nora'

// https://github.com/facebook-adblock/facebook_adblock/blob/mainline/src/constants.js
export const fbL10nSponsored = [
  'Sponsored',
  'Ad',
  'مُموَّل', // Arabic
  '赞助内容', // Chinese (Simplified)
  '贊助', // Chinese (Traditional)
  'Sponzorováno', // Czech
  'Gesponsord', // Dutch
  'May Sponsor', // Filipino
  'Commandité', // French (Canada)
  'Sponsorisé', // French
  'Anzeige', // German
  'Χορηγούμενη', // Greek
  'ממומן', // Hebrew
  'प्रायोजित', // Hindi
  'Hirdetés', // Hungarian
  'Bersponsor', // Indonesian
  'Sponsorizzato', // Italian
  '広告', // Japanese
  'Sponsorowane', // Polish
  'Patrocinado', // Portuguese (Brazil)
  'Sponsorizat', // Romanian
  'Реклама', // Russian
  'Sponzorované', // Slovak
  'Publicidad', // Spanish
  'Sponsrad', // Swedish
  'ได้รับการสนับสนุน', // Thai
  'Sponsorlu', // Turkish
  'Được tài trợ', // Vietnamese
]

const normalizeSponsoredText = (value?: string | null) => {
  return (value || '')
    .replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, '')
    .trim()
    .toLowerCase()
}

const fbNormalizedSponsored = new Set(fbL10nSponsored.map((value) => normalizeSponsoredText(value)))

export const isFacebookSponsoredText = (value?: string | null) => {
  const normalized = normalizeSponsoredText(value)
  return normalized ? fbNormalizedSponsored.has(normalized) : false
}

export const isFacebookMessagesPath = (pathname: string) => pathname === '/messages' || pathname.startsWith('/messages/')

export const isFacebookHomePath = (pathname: string) => pathname === '/' || pathname === '/home.php'

export const shouldHideFacebookOpenAppBanner = (element: HTMLElement | null) => {
  if (!element) {
    return false
  }

  if (element.dataset.noraHiddenOpenApp === '1') {
    return true
  }

  if (element.querySelector('form, input, textarea, select')) {
    return false
  }

  if (element.querySelector('[role="article"], [data-pagelet], [role="feed"]')) {
    return false
  }

  const textBlocks = element.querySelectorAll('.native-text')
  const buttons = element.querySelectorAll('[role="button"][data-focusable="true"]')
  const hasTopGradient = !!element.querySelector(
    ':scope > [data-mcomponent="MContainer"] > [data-mcomponent="TextArea"]',
  )

  return textBlocks.length === 1 && buttons.length === 1 && hasTopGradient
}

const shouldHideFacebookFeed = (snapshot?: UserStylesSnapshot | null) => {
  return snapshot?.builtins?.['hide-facebook-feed']?.enabled === true
}

export function runFacebookFeedController() {
  const root = window as Window &
    typeof globalThis & {
      __noraFacebookFeedControllerInit?: boolean
    }

  if (root.__noraFacebookFeedControllerInit) {
    return
  }
  root.__noraFacebookFeedControllerInit = true

  let enabled = shouldHideFacebookFeed(window.Nora?.getUserStyles?.())
  let scheduled = false
  let observer: MutationObserver | null = null

  const apply = () => {
    scheduled = false
    document.documentElement.classList.toggle(
      '_nora_hide_facebook_feed_',
      enabled && isFacebookHomePath(document.location.pathname),
    )
  }

  const scheduleApply = () => {
    if (scheduled) {
      return
    }
    scheduled = true
    window.requestAnimationFrame(apply)
  }

  const syncObserver = () => {
    if (!enabled) {
      observer?.disconnect()
      observer = null
      return
    }
    if (observer) {
      return
    }

    // Facebook's pushState navigation does not emit popstate. While this
    // feature is enabled, SPA render mutations also trigger a route check.
    observer = new MutationObserver(scheduleApply)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  window.addEventListener(noraUserStylesEvent, (event) => {
    enabled = shouldHideFacebookFeed((event as CustomEvent<UserStylesSnapshot>).detail)
    syncObserver()
    scheduleApply()
  })
  window.addEventListener('popstate', scheduleApply)

  syncObserver()
  apply()
}

export const isFacebookDesktopSponsoredPost = (element: HTMLElement) => {
  const candidates = element.matches('[aria-label], a, span, div[role="button"]')
    ? [element]
    : []

  for (const node of candidates) {
    const label = node.getAttribute('aria-label')
    if (isFacebookSponsoredText(label) || isFacebookSponsoredText(node.textContent)) {
      return true
    }
  }

  const descendants = element.querySelectorAll<HTMLElement>('[aria-label], a, span, div[role="button"]')
  for (const node of descendants) {
    const label = node.getAttribute('aria-label')
    if (isFacebookSponsoredText(label) || isFacebookSponsoredText(node.textContent)) {
      return true
    }
  }

  return false
}

// Every candidate post container in the desktop feed. `closest()` uses the same
// selector, so a mutation anywhere inside a post resolves back to the post itself.
export const facebookDesktopAdContainerSelector =
  '[role="article"], div[data-pagelet^="FeedUnit"], div[role="feed"] > div'

// Posts are scanned at most once and then remembered, because reading `textContent`
// of every link and span in a post is O(subtree) and the feed grows without bound as
// the user scrolls. Facebook renders the "Sponsored" label after the post is inserted,
// so any DOM change inside a post drops its cached verdict and it gets scanned again.
export const invalidateFacebookDesktopAdVerdict = (node: Node | null) => {
  const candidate = node as (Node & Partial<HTMLElement>) | null
  const element = typeof candidate?.closest === 'function' ? candidate : candidate?.parentElement
  if (typeof element?.closest !== 'function') {
    return
  }
  const container = element.closest<HTMLElement>(facebookDesktopAdContainerSelector)
  if (container && container.dataset.noraHiddenAd !== '1') {
    delete container.dataset.noraAdChecked
  }
}

export const shouldScanFacebookDesktopContainer = (container: HTMLElement) => {
  return container.dataset.noraHiddenAd !== '1' && container.dataset.noraAdChecked !== '1'
}
