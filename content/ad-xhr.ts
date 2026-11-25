import { getService, getServiceForHost } from './services/manager'
import { filterInitialProps, initialPropsId, isPinterestHost } from './services/pinterest'
import { isAdBlockingDisabledHere } from './site-blocking'

const { host } = document.location

// The per-site "Block ads" switch reaches the page as a setting, which is only
// pushed once the page has loaded, so it is read at call time rather than
// captured. `blockAds` runs before `window.Nora` exists at all, and the first
// requests can go out before the push lands, so until then the switch is
// resolved from the exceptions injected at document start.
export const adBlockingEnabled = () => window.Nora?.getSettings?.().adBlockingEnabled ?? !isAdBlockingDisabledHere()

// Pinterest renders a feed's first page on the server and passes it to the app in a JSON
// script, so those pins never go through XHR. The script is rewritten while the page is
// still being parsed, before the app's scripts read it for hydration.
function filterPinterestInitialProps() {
  if (typeof MutationObserver !== 'function') {
    return
  }
  const observer = new MutationObserver(() => {
    const script = document.getElementById(initialPropsId)
    if (!script) {
      return
    }
    if (adBlockingEnabled()) {
      // The parser may hand the text over in chunks; incomplete JSON is skipped and
      // picked up again by the next mutation.
      const filtered = filterInitialProps(script.textContent || '')
      if (filtered !== null) {
        script.textContent = filtered
      }
    }
    if (script.nextSibling || document.readyState !== 'loading') {
      observer.disconnect()
    }
  })
  // The document itself, since this can run before the parser has created <html>.
  observer.observe(document, { childList: true, subtree: true, characterData: true })
  document.addEventListener('DOMContentLoaded', () => observer.disconnect(), { once: true })
}

export function blockAds() {
  // Desktop installs the Pinterest part from its preload, ahead of the main bundle.
  if (!getServiceForHost(host) || window.__noraAdXhrInstalled) {
    return
  }
  window.__noraAdXhrInstalled = true
  if (isPinterestHost(host)) {
    filterPinterestInitialProps()
  }
  function interceptResponse(url: string, body: unknown, response: string) {
    try {
      const service = getService(document.location.href)
      if (service?.shouldIntercept(url)) {
        // Services decide what still applies with ads allowed (X's feed de-duplication does).
        response = service.transformResponse(response, { url, body }, { blockAds: adBlockingEnabled() })
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
  const requestBodies = new WeakMap<XMLHttpRequest, unknown>()
  const transformOnce = (xhr: XMLHttpRequest, source: unknown) => {
    if (typeof source !== 'string') {
      return source
    }
    const cached = transformed.get(xhr)
    if (cached?.source === source) {
      return cached.result
    }
    const result = interceptResponse(xhr.responseURL, requestBodies.get(xhr), source)
    transformed.set(xhr, { source, result })
    return result
  }

  // https://stackoverflow.com/a/77243932
  const XHR = window.XMLHttpRequest
  class XMLHttpRequest extends XHR {
    open(...args: unknown[]) {
      transformed.delete(this)
      requestBodies.delete(this)
      return (super.open as (...args: unknown[]) => void)(...args)
    }

    send(body?: Document | XMLHttpRequestBodyInit | null) {
      requestBodies.set(this, body)
      return super.send(body)
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
