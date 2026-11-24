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

// How far a scroller can still go up. A column-reverse scroller (a chat thread
// such as Instagram's DMs) starts at its newest content with scrollTop 0 and goes
// negative as it scrolls back, so 0 is its bottom, not its top.
export function canScrollUp(el: Element) {
  const range = el.scrollHeight - el.clientHeight
  if (range <= 1) {
    return false
  }
  if (el.scrollTop > 0) {
    return true
  }
  if (el.scrollTop < 0) {
    return el.scrollTop > 1 - range
  }
  // flex-direction computes to column-reverse on any element, but only reverses a flex container.
  const { display, flexDirection } = getComputedStyle(el)
  return flexDirection === 'column-reverse' && (display === 'flex' || display === 'inline-flex')
}

// Whether one of `el`'s ancestors is in `set`, so a walk of that ancestor's subtree covers it.
function hasAncestorIn(el: Element, set: Set<Element>) {
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (set.has(parent)) {
      return true
    }
  }
  return false
}

function isScrollable(el: Element) {
  if (el.scrollHeight - el.clientHeight <= 1) {
    return false
  }
  // A pane hidden with visibility keeps its size and scroll range, but takes no touch.
  const { overflowY, visibility } = getComputedStyle(el)
  return visibility === 'visible' && (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
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
      // A pane switched to overflow hidden can't be dragged any more either.
      if (!isScrollable(el) || !canScrollUp(el)) {
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

  // Track the nearest scroller above `start` that can go up. `visited` lets a
  // batch of walks stop where an earlier one went.
  const adoptScrollerAbove = (start: Element | null, visited?: Set<Element>) => {
    const root = document.scrollingElement
    for (let el = start; el && el !== root; el = el.parentElement) {
      if (visited) {
        if (visited.has(el)) {
          return
        }
        visited.add(el)
      }
      if (scrolledAway.has(el)) {
        return
      }
      if (isScrollable(el) && canScrollUp(el)) {
        scrolledAway.add(el)
        return
      }
    }
  }

  // A scroller that can go up without ever having scrolled (a chat thread opened
  // at its newest message) sends no scroll event. It fills as its content renders,
  // so look above where the page changed, once the changes settle, and report it
  // before the first touch rather than racing that touch. A pane built off the
  // page and inserted whole holds its scroller below the change, so added
  // subtrees are searched too.
  const changed = new Set<Element>()
  const added = new Set<Element>()
  let scanTimer: ReturnType<typeof setTimeout> | undefined
  const scan = () => {
    scanTimer = undefined
    const visited = new Set<Element>()
    for (const root of added) {
      if (!root.isConnected || hasAncestorIn(root, added)) {
        continue
      }
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (!scrolledAway.has(el) && isScrollable(el) && canScrollUp(el)) {
          scrolledAway.add(el)
        }
      }
    }
    for (const el of changed) {
      if (el.isConnected) {
        adoptScrollerAbove(el, visited)
      }
    }
    added.clear()
    changed.clear()
    // Also when nothing was found: a removed pane's region has to be cleared.
    if (scrolledAway.size || sent !== '[]') {
      schedule()
    }
  }
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.target instanceof Element) {
        changed.add(record.target)
      }
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          added.add(node)
        }
      }
    }
    if (!scanTimer) {
      scanTimer = setTimeout(scan, 200)
    }
    if (hasMediaViewers) {
      schedule()
    }
  }).observe(document, { childList: true, subtree: true })

  if (hasMediaViewers) {
    // Opening/closing the viewer changes the SPA route and its DOM without a
    // document load or scroll event. Back/Forward can also change that route.
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
        if (canScrollUp(target)) {
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

  // Also check under the finger as a touch starts, for a scroller the scan above
  // hasn't reached yet, and report right away: the refresh layout only decides
  // once the drag passes the touch slop. Reporting rebuilds every tracked rect, so
  // a pane that moved without a scroll or resize is current for this drag too.
  document.addEventListener(
    'touchstart',
    (event) => {
      adoptScrollerAbove(event.target instanceof Element ? event.target : null)
      if (scrolledAway.size || sent !== '[]') {
        if (frame) {
          cancelAnimationFrame(frame)
        }
        report()
      }
    },
    { capture: true, passive: true },
  )
}
