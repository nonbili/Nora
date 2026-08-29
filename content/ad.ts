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
      console.log('[nora][xhr] intercept candidate', {
        pageHost: host,
        requestUrl: url,
        hasService: !!service,
      })
      if (service?.shouldIntercept(url)) {
        console.log('[nora][xhr] transforming response', { requestUrl: url })
        response = service.transformResponse(response)
      } else {
        console.log('[nora][xhr] skipped response', { requestUrl: url })
      }
    } catch (e) {
      console.error(e)
    }
    return response
  }

  // https://stackoverflow.com/a/77243932
  const XHR = window.XMLHttpRequest
  class XMLHttpRequest extends XHR {
    get responseText() {
      if (this.readyState == 4) {
        return interceptResponse(this.responseURL, super.responseText)
      }
      return super.responseText
    }

    get response() {
      if (this.readyState == 4) {
        return interceptResponse(this.responseURL, super.response)
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

export function hideAds(mutations: MutationRecord[]) {
  if (!adBlockingEnabled()) {
    return
  }

  for (const mutation of mutations) {
    switch (host) {
      case 'm.facebook.com': {
        for (const node of mutation.addedNodes.values()) {
          const el = node as HTMLElement
          if (el.dataset?.trackingDurationId) {
            // facebook server rendered ads. Read the subtree text once: it is an
            // O(subtree) allocation, and there are ~30 labels to test against it.
            const text = el.textContent
            if (text && fbL10nSponsored.some((sponsored) => text.includes(sponsored))) {
              hideElement(el)
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
