type ScriptableWebview = {
  executeJavaScript?: (script: string) => unknown
}

type PausableWebview = ScriptableWebview & {
  stop?: () => unknown
  stopLoading?: () => unknown
}

type ReloadableWebview = ScriptableWebview & {
  reload?: () => unknown
  loadUrl?: (url: string) => unknown
}

const tabWebviews = new Map<string, PausableWebview>()

export function executeWebviewJavaScript(webview: ScriptableWebview | null | undefined, script: string) {
  if (!webview?.executeJavaScript) {
    return Promise.resolve(undefined)
  }

  try {
    return Promise.resolve(webview.executeJavaScript(script))
  } catch (error) {
    return Promise.reject(error)
  }
}

export function executeWebviewJavaScriptQuietly(webview: ScriptableWebview | null | undefined, script: string) {
  return executeWebviewJavaScript(webview, script).catch(() => undefined)
}

// Scroll the document, which is what nearly every site actually scrolls. Note the
// argument shape: `scrollTo(0, 0, { behavior })` is not a valid signature — it takes
// either (x, y) or a single options object — so the old three-argument call silently
// dropped the smooth behavior.
//
// Fall back to the innermost scroller under the viewport centre only when the document
// itself isn't scrolled, which covers layouts that put `overflow: hidden` on html/body
// and scroll a nested container instead. Deliberately narrow: resetting every scrolled
// container on the page would also reset sidebars, chat lists and docked panels.
//
// Long distances jump instead of animating because virtualized feeds change height
// mid-animation and the browser abandons a smooth scroll partway.
const SCROLL_TO_TOP_SCRIPT = `(function () {
  var SMOOTH_MAX_DISTANCE = 4000

  function toTop(el, top) {
    if (!(top > 0)) {
      return false
    }
    try {
      el.scrollTo({ top: 0, left: 0, behavior: top > SMOOTH_MAX_DISTANCE ? 'auto' : 'smooth' })
    } catch (e) {
      el.scrollTop = 0
    }
    return true
  }

  var root = document.scrollingElement || document.documentElement
  if (root && toTop(root, window.scrollY || window.pageYOffset || root.scrollTop || 0)) {
    return true
  }

  var stack = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2) || []
  for (var i = 0; i < stack.length; i++) {
    var el = stack[i]
    if (el.scrollTop > 0 && el.scrollHeight - el.clientHeight > 1) {
      var overflowY = ''
      try {
        overflowY = getComputedStyle(el).overflowY
      } catch (e) {}
      if (/auto|scroll|overlay/.test(overflowY)) {
        return toTop(el, el.scrollTop)
      }
    }
  }
  return false
})()`

export function scrollWebviewToTop(webview: ScriptableWebview | null | undefined) {
  return executeWebviewJavaScriptQuietly(webview, SCROLL_TO_TOP_SCRIPT)
}

// Electron webviews expose a real `reload()`; the native views don't, so they fall back
// to injecting `location.reload()` as page script.
export function reloadWebview(webview: ReloadableWebview | null | undefined, fallbackUrl?: string | null) {
  if (!webview) {
    return
  }
  if (typeof webview.reload === 'function') {
    webview.reload()
    return
  }
  if (typeof webview.executeJavaScript === 'function') {
    void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
    return
  }
  if (fallbackUrl) {
    webview.loadUrl?.(fallbackUrl)
  }
}

export function registerTabWebview(tabId: string, webview: PausableWebview | null | undefined) {
  if (webview) {
    tabWebviews.set(tabId, webview)
  } else {
    tabWebviews.delete(tabId)
  }
}

export function getTabWebview(tabId: string) {
  return tabWebviews.get(tabId)
}

export function pauseWebview(webview: PausableWebview | null | undefined) {
  if (!webview) {
    return
  }

  if (typeof webview.stop === 'function') {
    webview.stop()
  } else if (typeof webview.stopLoading === 'function') {
    webview.stopLoading()
  }

  void executeWebviewJavaScriptQuietly(
    webview,
    `
      (() => {
        document.querySelectorAll('audio, video').forEach((media) => {
          media.pause();
          media.removeAttribute('autoplay');
        });
      })()
    `,
  )
}
