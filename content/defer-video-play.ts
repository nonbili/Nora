// Starting a video stalls the app for a moment in Android WebView: the first decoded frame is
// imported and drawn on the app's own RenderThread (Chrome does this in its GPU process), so
// the UI thread waits on it and stops handing touches to the WebView for 100-500ms. X starts
// each video as it scrolls into view, which put that stall in the middle of the scroll: the
// finger moves on while the page freezes, the moves land in a burst after release, and the
// fling is lost, so the page seems to hang and scrolls less than the finger did.
//
// While a touch is down or the page is still scrolling, play() is held and run once the user
// has stopped. Settling only until the fling ends is not enough: flicking through a feed
// lifts and lands the finger every ~0.7s, and a video started in that gap stalls the next
// touch just the same. A video then starts ~0.6s after scrolling stops on it.

const SETTLE_MS = 600
// A play() this soon after a tap is the user starting the video (the click runs after
// touchend): it runs right away, also so it keeps the tap's user activation.
const TAP_MS = 1000

type Pending = { resolve: () => void; reject: (error: unknown) => void }

export function deferVideoPlayWhileScrolling(win: Window & typeof globalThis = window) {
  const doc = win.document
  const proto = win.HTMLMediaElement.prototype
  const play = proto.play
  const pause = proto.pause
  const load = proto.load
  const srcDescriptor = Object.getOwnPropertyDescriptor(proto, 'src')
  const pending = new Map<HTMLMediaElement, Pending[]>()
  let touches = 0
  // Only scrolling counts: a drag or fling scrolls until it stops, while a tap on a video's own
  // play button scrolls nothing, so the video it starts is not held. Lifting a finger that
  // scrolled counts too, as its fling only starts scrolling after the release.
  let lastActivity = -Infinity
  let scrolledThisTouch = false
  let lastTap = -Infinity
  let tappedVideo: Element | undefined
  // A press on a video itself (the edge long-press for 2x resumes it with play()) is not held,
  // until the touch turns into a scroll and other videos move under the point. Only the point
  // is kept: hit testing on every touchstart would force a layout flush.
  let touchX = 0
  let touchY = 0
  const isUnderTouch = (media: HTMLMediaElement) => {
    const rect = media.getBoundingClientRect()
    return touchX >= rect.left && touchX <= rect.right && touchY >= rect.top && touchY <= rect.bottom
  }
  const isPressed = (media: HTMLMediaElement) => touches > 0 && !scrolledThisTouch && isUnderTouch(media)
  // The tap is the last touch (a new one clears it) and landed on this video's player: its
  // controls sit over the video, so the video is the nearest one around the tapped element and
  // the tap landed inside it. It is found when the tap ends, before the page can move or
  // restyle it. A play() elsewhere in that window is still autoplay.
  const findTappedVideo = (target: EventTarget | null) => {
    let el = target instanceof win.Element ? target : null
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
      if (el instanceof win.HTMLVideoElement) {
        return el
      }
      const video = el.querySelector('video')
      if (video) {
        return video
      }
    }
  }
  const isTapped = (media: HTMLMediaElement) => media === tappedVideo && win.performance.now() - lastTap < TAP_MS
  let timer: number | undefined

  const busy = () => touches > 0 || win.performance.now() - lastActivity < SETTLE_MS

  const flush = () => {
    timer = undefined
    if (busy()) {
      schedule()
      return
    }
    const entries = [...pending]
    pending.clear()
    for (const [media, waiters] of entries) {
      if (!media.isConnected) {
        settle(waiters, new DOMException('The element was removed from the document.', 'AbortError'))
        continue
      }
      play.call(media).then(
        () => waiters.forEach((w) => w.resolve()),
        (error) => waiters.forEach((w) => w.reject(error)),
      )
    }
  }

  // Checked again once the page has been still for SETTLE_MS; a finger still down rechecks
  // after another SETTLE_MS, and its release schedules a check of its own.
  const schedule = () => {
    if (timer === undefined && pending.size) {
      const wait = touches ? SETTLE_MS : lastActivity + SETTLE_MS - win.performance.now()
      timer = win.setTimeout(flush, Math.max(wait, 0))
    }
  }

  const settle = (waiters: Pending[], error: unknown) => waiters.forEach((w) => w.reject(error))

  proto.play = function (this: HTMLMediaElement) {
    // Audio, and a video the user starts with a tap, play right away. Requests held for the
    // same video are settled by this play() rather than run again later.
    if (!(this instanceof win.HTMLVideoElement) || !busy() || isTapped(this) || isPressed(this)) {
      const result = play.call(this)
      const waiters = pending.get(this)
      if (waiters) {
        pending.delete(this)
        result.then(
          () => waiters.forEach((w) => w.resolve()),
          (error) => settle(waiters, error),
        )
      }
      return result
    }
    return new Promise<void>((resolve, reject) => {
      const waiters = pending.get(this) || []
      waiters.push({ resolve, reject })
      pending.set(this, waiters)
      schedule()
    })
  }

  const drop = (media: HTMLMediaElement, message: string) => {
    const waiters = pending.get(media)
    if (waiters) {
      pending.delete(media)
      settle(waiters, new DOMException(message, 'AbortError'))
    }
  }

  // A video that scrolls back out before it started is paused by the site; a held play() is
  // then dropped, the way a real pause() interrupts a pending play().
  proto.pause = function (this: HTMLMediaElement) {
    drop(this, 'The play() request was interrupted by a call to pause().')
    return pause.call(this)
  }

  // Loading another source aborts a pending play() too, so a held one can't start the new one.
  proto.load = function (this: HTMLMediaElement) {
    drop(this, 'The play() request was interrupted by a new load request.')
    return load.call(this)
  }
  if (srcDescriptor?.set && srcDescriptor.get) {
    const { get, set } = srcDescriptor
    Object.defineProperty(proto, 'src', {
      ...srcDescriptor,
      get,
      set(this: HTMLMediaElement, value: string) {
        drop(this, 'The play() request was interrupted by a new load request.')
        set.call(this, value)
      },
    })
  }

  const onTouch = (event: TouchEvent) => {
    touches = event.touches.length
    const touch = event.touches[0]
    if (event.type === 'touchstart' && touch) {
      touchX = touch.clientX
      touchY = touch.clientY
      scrolledThisTouch = false
      lastTap = -Infinity
      tappedVideo = undefined
    }
    if (!touches) {
      if (scrolledThisTouch) {
        lastActivity = win.performance.now()
      } else if (event.type === 'touchend') {
        const tapAt = (lastTap = win.performance.now())
        const video = findTappedVideo(event.target)
        // Another control in the same post (like, reply) shares the ancestor but not the spot.
        tappedVideo = video && isUnderTouch(video) ? video : undefined
        // Not kept past the window, so a player removed by the tap is not held on to.
        win.setTimeout(() => {
          if (lastTap === tapAt) {
            tappedVideo = undefined
          }
        }, TAP_MS)
      }
      schedule()
    }
  }
  const options = { capture: true, passive: true } as const
  doc.addEventListener('touchstart', onTouch, options)
  doc.addEventListener('touchend', onTouch, options)
  doc.addEventListener('touchcancel', onTouch, options)
  doc.addEventListener(
    'scroll',
    () => {
      lastActivity = win.performance.now()
      scrolledThisTouch = true
    },
    options,
  )
}
