const mediaViewerHosts = /(^|\.)(x\.com|twitter\.com|instagram\.com|facebook\.com|reddit\.com)$/

export function isGestureMediaViewer({ hostname, pathname, hash }: Pick<Location, 'hostname' | 'pathname' | 'hash'>) {
  if (/(^|\.)(x\.com|twitter\.com)$/.test(hostname)) {
    return /^\/[^/]+\/status\/\d+\/photo\/\d+\/?$/.test(pathname)
  }
  if (/(^|\.)instagram\.com$/.test(hostname)) {
    return /^\/(stories|reels?)(\/|$)/.test(pathname)
  }
  if (/(^|\.)facebook\.com$/.test(hostname)) {
    return /^\/(photo\.php|photo|stories)(\/|$)/.test(pathname)
  }
  return /(^|\.)reddit\.com$/.test(hostname) && hash === '#lightbox'
}

// Android's pull to refresh wraps the WebView, so it only knows the top level
// scroll position. Sites that scroll an inner element (a fixed body with a
// scrolling feed) keep the WebView at scrollY 0 at any depth, which would let a
// downward drag refresh the page mid-feed.
//
// Report the screen area of every scroller the page has scrolled away from its
// top, so the gesture can block a drag that starts inside one of them and still
// refresh from a drag anywhere else -- a scrolled sidebar, dropdown or textarea
// shouldn't disable the gesture for the rest of the page. Rects are in device
// pixels, matching the WebView's own touch coordinates.
export function trackInnerScrollers() {
  const bridge = window.NoraI
  if (!bridge?.setScrolledRegions) {
    return
  }

  // Elements are dropped once they leave the document, so a removed feed
  // container can't keep the gesture disabled for the rest of the session.
  const scrolledAway = new Set<Element>()
  let sent = ''
  let frame = 0
  const hasMediaViewers = mediaViewerHosts.test(window.location.hostname)

  const report = () => {
    frame = 0
    const rects: number[][] = []
    // Media viewers own downward drags (dismiss/pan/page) as well as sideways
    // swipes. Protect the whole viewport even though nothing has scrolled.
    // Use regions rather than the suspension flag shared with video long-press.
    if (hasMediaViewers && isGestureMediaViewer(window.location)) {
      const dpr = window.devicePixelRatio || 1
      rects.push([0, 0, Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr)])
    }
    for (const el of scrolledAway) {
      if (!el.isConnected) {
        scrolledAway.delete(el)
        continue
      }
      if (el.scrollTop <= 0) {
        scrolledAway.delete(el)
        continue
      }
      const dpr = window.devicePixelRatio || 1
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        continue
      }
      rects.push([rect.left * dpr, rect.top * dpr, rect.right * dpr, rect.bottom * dpr].map(Math.round))
    }
    const payload = JSON.stringify(rects)
    if (payload === sent) {
      return
    }
    sent = payload
    bridge.setScrolledRegions!(payload)
  }

  // Rects move as the page reflows or scrolls under a scrolled element, so they
  // are rebuilt per frame while anything is tracked, and only crossed over the
  // bridge when the result actually changes.
  const schedule = () => {
    if (!frame) {
      frame = requestAnimationFrame(report)
    }
  }

  if (hasMediaViewers) {
    // Opening/closing the viewer changes the SPA route and its DOM without a
    // document load or scroll event. Back/Forward can also change that route.
    new MutationObserver(schedule).observe(document, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)
    window.addEventListener('hashchange', schedule)
    window.addEventListener('resize', schedule)
    schedule()
  }

  document.addEventListener(
    'scroll',
    (event) => {
      const target = event.target
      // The document scroller is covered by the WebView's own scroll position.
      if (target instanceof Element) {
        if (target.scrollTop > 0) {
          scrolledAway.add(target)
        } else {
          scrolledAway.delete(target)
        }
      }
      if (scrolledAway.size || sent !== '[]') {
        schedule()
      }
    },
    { capture: true, passive: true },
  )
}
