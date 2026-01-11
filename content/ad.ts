import { fbL10nSponsored } from './services/facebook'
import { linkedinL10nPromoted } from './services/linkedin'
import { getService } from './services/manager'
import { emit } from './utils'

const { host } = document.location

export function blockAds() {
  if (!['www.instagram.com', 'www.reddit.com', 'x.com'].includes(host)) {
    return
  }
  function interceptResponse(url: string, response: string) {
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

export function hideAds(mutations: MutationRecord[]) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes.values()) {
      const el = node as HTMLElement
      switch (host) {
        case 'm.facebook.com': {
          if (el.dataset?.trackingDurationId) {
            const text = el.querySelector('.native-text.rslh .f5')?.textContent
            for (const text of fbL10nSponsored) {
              if (el.textContent?.includes(text)) {
                // facebook server rendered ads
                el.style.display = 'none'
                break
              }
            }
          }
          break
        }
        case 'www.instagram.com': {
          if (el.nodeName == 'ARTICLE') {
            if (el.querySelector('.x1fhwpqd.x132q4wb.x5n08af')) {
              // instagram server rendered ads
              el.style.visibility = 'hidden'
            }
          }
          break
        }
      }
    }

    switch (host) {
      case 'm.facebook.com': {
        const target = document.querySelector('.fixed-container.bottom') as HTMLElement
        // facebook open app btn
        if (target?.textContent == 'Open app') {
          target.style.display = 'none'
        }
        break
      }
      case 'www.linkedin.com': {
        const items = document.querySelectorAll('.feed-item')
        for (const item of items) {
          const label = (item.querySelector('span.text-color-text-low-emphasis') as HTMLElement)?.innerText
          if (linkedinL10nPromoted.includes(label)) {
            ;(item as HTMLElement).style.display = 'none'
          }
        }
        break
      }
    }
  }
}
