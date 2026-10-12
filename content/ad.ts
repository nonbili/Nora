import {
  facebookDesktopAdContainerSelector,
  fbL10nSponsored,
  invalidateFacebookDesktopAdVerdict,
  isFacebookDesktopSponsoredPost,
  isFacebookMessagesPath,
  isFacebookReelPagerAdCandidate,
  isFacebookReelsPath,
  shouldHideFacebookOpenAppBanner,
  shouldScanFacebookDesktopContainer,
} from './services/facebook'
import { linkedinL10nPromoted } from './services/linkedin'
import { getService } from './services/manager'
import { isAdBlockingDisabledHere } from './site-blocking'
import { emit } from './utils'

const { host } = document.location

// The per-site "Block ads" switch reaches the page as a setting, which is only
// pushed once the page has loaded, so it is read at call time rather than
// captured. `blockAds` runs before `window.Nora` exists at all, and the first
// requests can go out before the push lands, so until then the switch is
// resolved from the exceptions injected at document start.
const adBlockingEnabled = () => window.Nora?.getSettings?.().adBlockingEnabled ?? !isAdBlockingDisabledHere()

// Facebook's reel pager is a mandatory scroll-snap container. Chromium re-runs snap
// selection whenever such a scroller is relaid out, and it re-snaps to the target it
// remembers -- the reel the user just swiped away from. Collapsing an ad above the
// viewport therefore rewinds playback to the previous clip a beat after the swipe.
const findSnapScroller = (element: HTMLElement) => {
  if (typeof getComputedStyle !== 'function') {
    return null
  }
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { scrollSnapType } = getComputedStyle(node)
    if (scrollSnapType && scrollSnapType !== 'none' && node.scrollHeight > node.clientHeight) {
      return node
    }
  }
  return null
}

const hideElement = (element: HTMLElement) => {
  const scroller = findSnapScroller(element)
  if (!scroller) {
    element.style.display = 'none'
    return
  }

  // Only content above the viewport moves what is on screen; anything below it collapses
  // harmlessly. An ad that is on screen has no scroll-neutral answer -- it is the item the
  // user is looking at -- so the scroller is left to snap wherever it lands.
  const wasAbove = element.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top
  const { scrollTop } = scroller
  const heightBefore = scroller.scrollHeight

  element.style.display = 'none'

  // Reading scrollHeight forces the layout the hide just invalidated, which is the point:
  // the offset is corrected in the same frame, before snap selection can run.
  const shrunkBy = wasAbove ? heightBefore - scroller.scrollHeight : 0
  const restored = Math.max(0, scrollTop - shrunkBy)
  if (scroller.scrollTop !== restored) {
    scroller.scrollTop = restored
  }
}

// Facebook's mobile reel pager cannot have a slide collapsed at all. Every few reels it
// re-creates the slides around the viewport and then puts scrollTop back to the value it
// saved beforehand, on the assumption that nothing above changed height. A collapsed ad
// comes back at full height in that pass, and hiding it again leaves the pager one reel
// short of where it was: playback rewinds to the previous clip a few seconds after the
// swipe. So the slide keeps its box, is blanked, and is stepped over instead.
const skippedReelAdAttr = 'data-nora-skipped-ad'
type ReelPagerWatch = { settleSoon: () => void; childrenChanged: () => void }
const reelPagerWatches = new WeakMap<HTMLElement, ReelPagerWatch>()
const hasScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window

const isReelSlide = (element: Element | null, scroller: HTMLElement): element is HTMLElement => {
  return element instanceof HTMLElement && element.offsetHeight > scroller.clientHeight / 2
}

// `settleSoon` checks, once the pager is at rest, whether it is resting on an ad.
const watchReelPager = (scroller: HTMLElement) => {
  const existing = reelPagerWatches.get(scroller)
  if (existing) {
    return existing
  }

  // Where the pager last rested on something other than an ad.
  let lastRestTop = scroller.scrollTop
  let settleTimer = 0
  // Between a scroll event and its scrollend.
  let scrolling = false
  let touching = false
  // Whether the user has started a gesture since the pager last came to rest.
  let userMoved = false
  // The way the skip in progress is heading. It holds until the pager rests on a reel or
  // the user starts another gesture, so a run of ads is crossed in one direction.
  let skipForward: boolean | null = null
  // The skip found no reel loaded past the ad yet.
  let waitingForTarget = false

  const settle = () => {
    // A finger held still mid-drag is not rest; releasing it settles again.
    if (touching) {
      return
    }
    const top = scroller.getBoundingClientRect().top
    const offsetOf = (element: HTMLElement) => element.getBoundingClientRect().top - top
    const ads = scroller.querySelectorAll<HTMLElement>(`:scope > [${skippedReelAdAttr}]`)
    const ad = [...ads].find((element) => Math.abs(offsetOf(element)) < element.offsetHeight / 2)
    if (!ad) {
      lastRestTop = scroller.scrollTop
      userMoved = false
      skipForward = null
      waitingForTarget = false
      return
    }
    // Keep going the way the user came from, judged by resting positions: the last scroll
    // delta is no guide, since an abandoned drag snaps back against the swipe. Only a
    // gesture can mean backward; an ad that appears in place, or that the browser snaps
    // back onto by itself, is stepped over forward.
    const forward = skipForward ?? (!userMoved || scroller.scrollTop >= lastRestTop - 1)
    skipForward = forward
    userMoved = false
    let target = forward ? ad.nextElementSibling : ad.previousElementSibling
    while (target && (!isReelSlide(target, scroller) || target.hasAttribute(skippedReelAdAttr))) {
      target = forward ? target.nextElementSibling : target.previousElementSibling
    }
    // With nothing to land on yet, the blank slide is left in place rather than bouncing
    // back, and the skip resumes once the pager gains slides.
    waitingForTarget = !isReelSlide(target, scroller)
    if (isReelSlide(target, scroller)) {
      scroller.scrollTo({ top: scroller.scrollTop + offsetOf(target), behavior: 'smooth' })
    }
  }

  const settleSoon = () => {
    clearTimeout(settleTimer)
    if (!scrolling) {
      settleTimer = window.setTimeout(settle, 150)
    }
  }

  const passive = { passive: true } as const
  scroller.addEventListener(
    'scroll',
    () => {
      // A scroll in progress settles itself when it ends, so a pending check is dropped.
      clearTimeout(settleTimer)
      if (hasScrollEnd) {
        scrolling = true
      } else {
        settleTimer = window.setTimeout(settle, 150)
      }
    },
    passive,
  )
  scroller.addEventListener(
    'scrollend',
    () => {
      scrolling = false
      settle()
    },
    passive,
  )

  const onUserGesture = () => {
    userMoved = true
    skipForward = null
  }
  const onTouch = (event: TouchEvent) => {
    touching = event.touches.length > 0
    if (event.type === 'touchstart') {
      onUserGesture()
      // Facebook can replace the slide under the finger, and a detached target ends its
      // touch without the event ever reaching the pager, so the target is watched too.
      event.target?.addEventListener('touchend', onTouch as EventListener, passive)
      event.target?.addEventListener('touchcancel', onTouch as EventListener, passive)
    } else if (!touching) {
      settleSoon()
    }
  }
  scroller.addEventListener('touchstart', onTouch, passive)
  scroller.addEventListener('touchend', onTouch, passive)
  scroller.addEventListener('touchcancel', onTouch, passive)
  scroller.addEventListener('wheel', onUserGesture, passive)
  scroller.addEventListener('keydown', onUserGesture, passive)

  const watch: ReelPagerWatch = {
    settleSoon,
    // Reels appended below the viewport raise no scroll event, so a skip that had nowhere
    // to go is retried when the pager gains slides.
    childrenChanged: () => {
      if (waitingForTarget) {
        settleSoon()
      }
    },
  }
  reelPagerWatches.set(scroller, watch)
  return watch
}

const hideFacebookMobileAd = (element: HTMLElement) => {
  const scroller = findSnapScroller(element)
  if (!scroller || element.parentElement !== scroller) {
    hideElement(element)
    return
  }
  element.setAttribute(skippedReelAdAttr, '1')
  element.style.visibility = 'hidden'
  // The slide may be the one already on screen, in which case no scroll is coming to
  // step over it.
  watchReelPager(scroller).settleSoon()
}

const scanFacebookDesktopContainer = (container: HTMLElement) => {
  if (!shouldScanFacebookDesktopContainer(container)) {
    return
  }

  if (isFacebookDesktopSponsoredPost(container)) {
    container.dataset.noraHiddenAd = '1'
    hideElement(container)
    return
  }

  container.dataset.noraAdChecked = '1'
}

export function blockAds() {
  if (!['www.instagram.com', 'www.reddit.com', 'x.com'].includes(host)) {
    return
  }
  function interceptResponse(url: string, response: string) {
    if (!adBlockingEnabled()) {
      return response
    }
    try {
      const service = getService(document.location.href)
      if (service?.shouldIntercept(url)) {
        response = service.transformResponse(response)
      }
    } catch (e) {
      console.error(e)
    }
    return response
  }

  // Sites read `response` and `responseText` more than once per request, and each
  // transform parses and re-serializes the whole payload, so the result is kept per
  // request. `open()` drops it, since a reused request can hit another URL and get the
  // same body back. Non-text bodies (json, blob, arraybuffer) are passed through untouched.
  const transformed = new WeakMap<XMLHttpRequest, { source: string; result: string }>()
  const transformOnce = (xhr: XMLHttpRequest, source: unknown) => {
    if (typeof source !== 'string') {
      return source
    }
    const cached = transformed.get(xhr)
    if (cached?.source === source) {
      return cached.result
    }
    const result = interceptResponse(xhr.responseURL, source)
    transformed.set(xhr, { source, result })
    return result
  }

  // https://stackoverflow.com/a/77243932
  const XHR = window.XMLHttpRequest
  class XMLHttpRequest extends XHR {
    open(...args: unknown[]) {
      transformed.delete(this)
      return (super.open as (...args: unknown[]) => void)(...args)
    }

    get responseText() {
      if (this.readyState == 4) {
        return transformOnce(this, super.responseText) as string
      }
      return super.responseText
    }

    get response() {
      if (this.readyState == 4) {
        return transformOnce(this, super.response)
      }
      return super.response
    }
  }
  window.XMLHttpRequest = XMLHttpRequest
}

// Facebook emits hundreds of mutation records per batch and its feed never shrinks, so
// the whole-document pass runs once per frame instead of once per record. Anything more
// than that starves the page's own script: comments and post routes then spin forever
// until a reload trims the DOM back down.
let sweepScheduled = false

const scheduleSweep = () => {
  if (sweepScheduled) {
    return
  }
  sweepScheduled = true
  const run = () => {
    sweepScheduled = false
    sweepAds()
  }
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run)
  } else {
    setTimeout(run, 0)
  }
}

const sweepAds = () => {
  if (!adBlockingEnabled()) {
    return
  }

  switch (host) {
    case 'm.facebook.com': {
      const target = document.querySelector('.fixed-container.bottom') as HTMLElement | null

      // facebook open app btn
      if (target && target.dataset.noraHiddenOpenApp !== '1' && shouldHideFacebookOpenAppBanner(target)) {
        target.dataset.noraHiddenOpenApp = '1'
        hideElement(target)
      }
      break
    }
    case 'www.facebook.com': {
      const { pathname } = document.location
      if (isFacebookMessagesPath(pathname)) {
        break
      }
      // Desktop mode serves reels from this host too, so they are still scanned; only the
      // candidates are narrowed, because a false positive on the pager itself would hide
      // the viewer. hideElement keeps the collapse scroll-neutral inside the pager.
      const onReels = isFacebookReelsPath(pathname)
      const items = document.querySelectorAll<HTMLElement>(facebookDesktopAdContainerSelector)
      for (const item of items) {
        if (onReels && !isFacebookReelPagerAdCandidate(item)) {
          continue
        }
        scanFacebookDesktopContainer(item)
      }
      break
    }
    case 'www.linkedin.com': {
      const items = document.querySelectorAll<HTMLElement>('.feed-item')
      for (const item of items) {
        if (item.dataset.noraHiddenAd === '1') {
          continue
        }
        const label = (item.querySelector('span.text-color-text-low-emphasis') as HTMLElement)?.innerText
        if (linkedinL10nPromoted.includes(label)) {
          item.dataset.noraHiddenAd = '1'
          hideElement(item)
        }
      }
      break
    }
  }
}

// Only these hosts have anything for the observer to hide; everywhere else the
// mutation records are not even walked.
const adHosts = ['m.facebook.com', 'www.facebook.com', 'www.linkedin.com']

export function hideAds(mutations: MutationRecord[]) {
  if (!adHosts.includes(host) || !adBlockingEnabled()) {
    return
  }

  for (const mutation of mutations) {
    switch (host) {
      case 'm.facebook.com': {
        if (mutation.addedNodes.length) {
          reelPagerWatches.get(mutation.target as HTMLElement)?.childrenChanged()
        }
        for (const node of mutation.addedNodes.values()) {
          const el = node as HTMLElement
          if (el.dataset?.trackingDurationId) {
            // facebook server rendered ads. Read the subtree text once: it is an
            // O(subtree) allocation, and there are ~30 labels to test against it.
            const text = el.textContent
            if (text && fbL10nSponsored.some((sponsored) => text.includes(sponsored))) {
              hideFacebookMobileAd(el)
            }
          }
        }
        break
      }
      case 'www.facebook.com': {
        // Nothing is scanned here. A batch holds hundreds of records touching the same
        // handful of posts, so scanning inline would re-scan a post once per record;
        // the records only drop cached verdicts and the sweep scans each post once.
        // The "Sponsored" label lands after the post is inserted, which is what makes
        // the invalidation necessary.
        invalidateFacebookDesktopAdVerdict(mutation.target)
        break
      }
    }
  }

  scheduleSweep()
}
