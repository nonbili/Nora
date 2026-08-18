import {
  facebookDesktopAdContainerSelector,
  fbL10nSponsored,
  invalidateFacebookDesktopAdVerdict,
  isFacebookDesktopSponsoredPost,
  isFacebookMessagesPath,
  shouldHideFacebookOpenAppBanner,
  shouldScanFacebookDesktopContainer,
} from './services/facebook'
import { linkedinL10nPromoted } from './services/linkedin'
import { getService } from './services/manager'
import { emit } from './utils'

const { host } = document.location

const hideElement = (element: HTMLElement) => {
  element.style.display = 'none'
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
      if (isFacebookMessagesPath(document.location.pathname)) {
        break
      }
      const items = document.querySelectorAll<HTMLElement>(facebookDesktopAdContainerSelector)
      for (const item of items) {
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
