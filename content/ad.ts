import { getService } from './services/manager'
import { emit } from './utils'

export function blockAds() {
  function interceptResponse(url: string, response: string) {
    try {
      const service = getService(url)
      if (service) {
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
      if (el.nodeName == 'ARTICLE') {
        if (el.querySelector('.x1fhwpqd.x132q4wb.x5n08af')) {
          // instagram server rendered ads
          el.style.visibility = 'hidden'
        }
      }
      if (
        el.classList?.contains('fixed-container') &&
        el.classList?.contains('bottom') &&
        el?.offsetHeight &&
        el.offsetHeight < 150
      ) {
        // facebook open app btn
        el.style.display = 'none'
      }
      if (el.dataset?.trackingDurationId) {
        const text = el.querySelector('.native-text.rslh .f5')?.textContent
        if (el.textContent?.includes('Sponsored')) {
          // facebook server rendered ads
          el.style.display = 'none'
        }
      }
    }
  }
}
