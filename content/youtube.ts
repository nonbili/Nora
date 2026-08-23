import { isYouTubeAdApi, isYouTubeHost, stripYouTubeAds, transformYouTubeResponse } from '@/lib/youtube-ads'

/**
 * YouTube ad guard.
 *
 * Injected at document start into *every* frame, not just the tab's main frame:
 * a YouTube player embedded on Reddit, a forum or a blog is an iframe on
 * `youtube.com` / `youtube-nocookie.com`, and it fetches its own player
 * response. Only a script running inside that frame can rewrite it, so the
 * guard is a separate bundle from `content/main.ts` (which stays main-frame
 * work) and no-ops immediately on every other host.
 */

// Leftovers that live in the page rather than in a response: the player's own ad
// module, and slots the server renders straight into the document.
const CSS = `
.ytp-ad-module,
.ytp-ad-overlay-container,
.ytp-ad-progress-list,
ytd-ad-slot-renderer,
ytd-in-feed-ad-layout-renderer,
ytd-banner-promo-renderer,
ytd-statement-banner-renderer,
ytm-companion-slot,
ytm-promoted-video-renderer,
#masthead-ad,
#player-ads {
  display: none !important;
}
`

function injectCss() {
  const style = document.createElement('style')
  style.id = '_nora_youtube_ads'
  style.textContent = CSS
  const mount = () => (document.head || document.documentElement)?.appendChild(style)
  if (document.documentElement) {
    mount()
  } else {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  }
}

/**
 * The first video of a page never goes through the network hooks: YouTube
 * inlines its player response (and the feed's first page) into the HTML as
 * `var ytInitialPlayerResponse = {...}`. The var assignment runs through this
 * accessor, which is why the guard has to be in place before page scripts.
 */
function interceptInitialData(name: string) {
  let current = (window as any)[name]
  if (current) {
    stripYouTubeAds(current)
  }
  try {
    Object.defineProperty(window, name, {
      get() {
        return current
      },
      set(value) {
        try {
          stripYouTubeAds(value)
        } catch (e) {
          console.error('[nora] youtube initial data', e)
        }
        current = value
      },
      configurable: true,
    })
  } catch {
    // Another script may have locked the global down; the network hooks below
    // still cover everything after the first video.
  }
}

function interceptFetch() {
  const original = window.fetch
  // Typed loosely on purpose: React Native's `fetch` typings and the DOM's
  // disagree on the input union, and the wrapper only forwards the arguments.
  const patched = async function (this: unknown, ...args: any[]) {
    const response: Response = await (original as any).apply(this, args)
    try {
      const input = args[0]
      const url = input instanceof Request ? input.url : String(input)
      if (!response.ok || !isYouTubeAdApi(url, location.href)) {
        return response
      }
      const text = await response.clone().text()
      return new Response(transformYouTubeResponse(text), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (e) {
      console.error('[nora] youtube fetch', e)
      return response
    }
  }
  window.fetch = patched as typeof window.fetch
}

function interceptXhr() {
  const Original = window.XMLHttpRequest
  // The response is transformed on read rather than on load: rewriting it in a
  // readystatechange listener would race the page's own handler, which may be
  // registered first.
  class NoraXMLHttpRequest extends Original {
    private get noraShouldTransform() {
      return this.readyState === 4 && isYouTubeAdApi(this.responseURL, location.href)
    }

    get responseText() {
      const text = super.responseText
      return this.noraShouldTransform ? transformYouTubeResponse(text) : text
    }

    get response() {
      const value = super.response
      if (!this.noraShouldTransform) {
        return value
      }
      if (typeof value === 'string') {
        return transformYouTubeResponse(value)
      }
      // responseType: 'json' hands back an already parsed object.
      if (value && typeof value === 'object') {
        try {
          return stripYouTubeAds(value)
        } catch (e) {
          console.error('[nora] youtube xhr', e)
        }
      }
      return value
    }
  }
  window.XMLHttpRequest = NoraXMLHttpRequest
}

export function installYouTubeAdGuard() {
  const root = window as Window & typeof globalThis & { __noraYouTubeAdGuard?: boolean }
  if (root.__noraYouTubeAdGuard || !isYouTubeHost(location.host)) {
    return
  }
  root.__noraYouTubeAdGuard = true

  interceptInitialData('ytInitialPlayerResponse')
  interceptInitialData('ytInitialData')
  interceptFetch()
  interceptXhr()
  injectCss()
}

try {
  if (typeof window !== 'undefined') {
    installYouTubeAdGuard()
  }
} catch (e) {
  console.error('[nora] failed to install YouTube ad guard', e)
}
