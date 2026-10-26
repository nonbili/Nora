import { hostHomes } from './css'
import { noraSettingsEvent } from './nora'
import { normalizeVideoSpeed, videoLongPressSpeeds } from '../lib/video-speed'
import { runFacebookFeedController } from './services/facebook'
import { runXHomeTabsController } from './services/twitter/home-tabs'

function runVideoLongPressScript() {
  const root = window as Window & typeof globalThis & { __noraVideoEdgeLongPressInit?: boolean }
  if (root.__noraVideoEdgeLongPressInit) {
    return
  }
  root.__noraVideoEdgeLongPressInit = true

  const LONG_PRESS_DELAY_MS = 300
  const MOVE_TOLERANCE_PX = 18
  const EDGE_RATIO = 0.28
  const EDGE_MIN_WIDTH_PX = 56
  const INDICATOR_ID = '_nora_video_speed_indicator'
  const SPEED_STEP_PX = 48
  let enabled = Boolean(window.Nora?.getSettings?.().videoEdgeLongPressTo2x)
  // What a video is given as it starts.
  let defaultSpeed = normalizeVideoSpeed(window.Nora?.getSettings?.().videoDefaultSpeed)
  // What the pressed video was playing at, and goes back to on release. Usually the default,
  // but it may be a speed picked in the site's own player.
  let restingSpeed = 1
  // What the current long press offers: never the speed already playing.
  let speeds = videoLongPressSpeeds
  let pendingWasPlaying = false
  let pointerId: number | null = null
  let pendingVideo: HTMLVideoElement | null = null
  let activeVideo: HTMLVideoElement | null = null
  let timer: number | null = null
  let suppressedClickVideo: HTMLVideoElement | null = null
  let suppressedClickUntil = 0
  let startX = 0
  let startY = 0
  let speedAnchorX = 0
  let anchorIndex = 0
  let speedIndex = 0
  let lastX = 0
  const defaultSpeedApplied = new WeakSet<HTMLVideoElement>()

  const ensureIndicator = () => {
    let indicator = document.getElementById(INDICATOR_ID) as HTMLDivElement | null
    if (indicator) {
      return indicator
    }

    indicator = document.createElement('div')
    indicator.id = INDICATOR_ID
    indicator.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:24px',
      'transform:translateX(-50%)',
      'gap:4px',
      'align-items:center',
      'font:600 14px/1.2 -apple-system,BlinkMacSystemFont,sans-serif',
      'letter-spacing:0.01em',
      'pointer-events:none',
      'z-index:2147483647',
      'display:none',
      'white-space:nowrap',
    ].join(';')
    for (const speed of speeds) {
      const option = document.createElement('span')
      option.textContent = `${speed}x`
      option.style.cssText = [
        'padding:8px 12px',
        'border-radius:999px',
        'text-shadow:0 1px 2px rgba(0,0,0,0.6)',
        'transition:background-color 0.12s,color 0.12s',
      ].join(';')
      indicator.appendChild(option)
    }
    document.body?.appendChild(indicator)
    return indicator
  }

  const renderIndicator = () => {
    const indicator = ensureIndicator()
    Array.from(indicator.children).forEach((option, index) => {
      const style = (option as HTMLElement).style
      const selected = index === speedIndex
      style.background = selected ? 'rgba(0,0,0,0.78)' : 'transparent'
      style.color = selected ? '#fff' : 'rgba(255,255,255,0.6)'
    })
  }

  const updateSpeedFromX = (clientX: number) => {
    if (!activeVideo) {
      return
    }
    lastX = clientX
    // Past the slowest or fastest speed the anchor follows the finger, so sliding back
    // half a step changes speed again. Otherwise a press near the screen edge could never
    // reach the speeds on that side; this way you slide inward, then back.
    const minPos = 0
    const maxPos = speeds.length - 1
    const pos = anchorIndex + (clientX - speedAnchorX) / SPEED_STEP_PX
    if (pos < minPos || pos > maxPos) {
      const clampedPos = pos < minPos ? minPos : maxPos
      speedAnchorX = clientX - (clampedPos - anchorIndex) * SPEED_STEP_PX
    }
    const nextIndex = Math.min(Math.max(Math.round(pos), 0), speeds.length - 1)
    if (nextIndex === speedIndex) {
      return
    }
    speedIndex = nextIndex
    activeVideo.playbackRate = speeds[speedIndex]
    renderIndicator()
  }

  const clearTimer = () => {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  const positionIndicator = (video: HTMLVideoElement) => {
    const indicator = ensureIndicator()
    const rect = video.getBoundingClientRect()
    indicator.style.top = `${Math.max(rect.top + 20, 20)}px`
    indicator.style.left = `${rect.left + rect.width / 2}px`
  }

  const hideIndicator = () => {
    const indicator = document.getElementById(INDICATOR_ID) as HTMLDivElement | null
    if (indicator) {
      indicator.style.display = 'none'
    }
  }

  const cancelPending = () => {
    clearTimer()
    pointerId = null
    pendingVideo = null
    pendingWasPlaying = false
  }

  const resetPlayback = () => {
    clearTimer()
    if (activeVideo) {
      activeVideo.playbackRate = restingSpeed
      window.NoraI?.setPullToRefreshSuspended?.(false)
    }
    hideIndicator()
    pointerId = null
    pendingVideo = null
    pendingWasPlaying = false
    activeVideo = null
  }

  const isInstagramReelPage = () => {
    const { hostname, pathname } = document.location
    return hostname === 'www.instagram.com' && (pathname.startsWith('/reel/') || pathname.startsWith('/reels/'))
  }

  const shouldGuardInstagramReelPlayback = (video: HTMLVideoElement | null) => {
    return Boolean(video && isInstagramReelPage() && pendingWasPlaying)
  }

  const resumeVideoPlayback = (video: HTMLVideoElement | null, playbackRate: number) => {
    if (!video || video.ended) {
      return
    }
    video.playbackRate = playbackRate
    void video.play().catch(() => { })
  }

  const suppressClick = (video: HTMLVideoElement | null) => {
    suppressedClickVideo = video
    suppressedClickUntil = video ? Date.now() + 750 : 0
  }

  const shouldSuppressClick = () => {
    if (!suppressedClickVideo) {
      return false
    }
    if (Date.now() > suppressedClickUntil) {
      suppressClick(null)
      return false
    }
    return true
  }

  const getVideoFromTarget = (target: EventTarget | null, clientX?: number, clientY?: number) => {
    if (clientX != null && clientY != null) {
      const elements = document.elementsFromPoint(clientX, clientY)
      const videoAtPoint = elements.find((element): element is HTMLVideoElement => element instanceof HTMLVideoElement)
      if (videoAtPoint) {
        return videoAtPoint
      }
    }
    if (target instanceof HTMLVideoElement) {
      return target
    }
    if (target instanceof Element) {
      return target.closest('video') as HTMLVideoElement | null
    }
    return null
  }

  const isEdgePress = (video: HTMLVideoElement, clientX: number, clientY: number) => {
    const rect = video.getBoundingClientRect()
    if (
      rect.width < EDGE_MIN_WIDTH_PX * 2 ||
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false
    }

    const edgeWidth = Math.min(Math.max(rect.width * EDGE_RATIO, EDGE_MIN_WIDTH_PX), rect.width / 2)
    const x = clientX - rect.left
    return x <= edgeWidth || x >= rect.width - edgeWidth
  }

  const activatePlayback = async (video: HTMLVideoElement) => {
    if (!enabled || pendingVideo !== video) {
      return
    }
    if (video.ended) {
      cancelPending()
      return
    }
    if (video.paused) {
      if (isInstagramReelPage() && pendingWasPlaying) {
        try {
          await video.play()
        } catch { }
      }
      if (video.paused) {
        cancelPending()
        return
      }
    }

    clearTimer()
    activeVideo = video
    window.NoraI?.setPullToRefreshSuspended?.(true)
    restingSpeed = video.playbackRate
    speeds = videoLongPressSpeeds.filter((speed) => speed !== restingSpeed)
    // Starts at 2x, or at 3x when 2x is what already plays.
    anchorIndex = speeds.indexOf(restingSpeed === 2 ? 3 : 2)
    speedIndex = anchorIndex
    speedAnchorX = lastX
    video.playbackRate = speeds[speedIndex]
    // Built again for each press, as its options follow the speed pressed from.
    document.getElementById(INDICATOR_ID)?.remove()
    const indicator = ensureIndicator()
    renderIndicator()
    positionIndicator(video)
    indicator.style.display = 'flex'
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!enabled || !event.isPrimary) {
      return
    }

    const video = getVideoFromTarget(event.target, event.clientX, event.clientY)
    if (!video || !isEdgePress(video, event.clientX, event.clientY)) {
      return
    }

    clearTimer()
    pointerId = event.pointerId
    pendingVideo = video
    pendingWasPlaying = !video.paused && !video.ended
    startX = event.clientX
    startY = event.clientY
    lastX = event.clientX
    timer = window.setTimeout(() => {
      void activatePlayback(video)
    }, LONG_PRESS_DELAY_MS)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) {
      if (activeVideo) {
        positionIndicator(activeVideo)
      }
      return
    }

    if (activeVideo) {
      updateSpeedFromX(event.clientX)
      positionIndicator(activeVideo)
      return
    }

    lastX = event.clientX
    const movedTooFar = Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX
    if (movedTooFar || (pendingVideo && !isEdgePress(pendingVideo, event.clientX, event.clientY))) {
      cancelPending()
    }
  }

  const onPointerEnd = (event: PointerEvent) => {
    if (pointerId === event.pointerId) {
      if (activeVideo) {
        suppressClick(activeVideo)
      }
      resetPlayback()
    }
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) {
      return
    }
    if (activeVideo && event.pointerType === 'touch') {
      // The browser cancels the pointer once a drag turns into a pan gesture. Touch events keep
      // flowing, so keep tracking the speed via touchmove and wait for touchend to reset.
      pointerId = null
      return
    }
    resetPlayback()
  }

  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (activeVideo && touch) {
      updateSpeedFromX(touch.clientX)
    }
  }

  const onTouchEnd = () => {
    if (pendingVideo || activeVideo) {
      resetPlayback()
    }
  }

  const onTouchCancel = () => {
    if (pendingVideo || activeVideo) {
      resetPlayback()
    }
  }

  const onClick = (event: MouseEvent) => {
    if (!shouldSuppressClick()) {
      return
    }

    const video = getVideoFromTarget(event.target, event.clientX, event.clientY)
    if (video && video === suppressedClickVideo) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    suppressClick(null)
  }

  const onPause = (event: Event) => {
    const video = event.target instanceof HTMLVideoElement ? event.target : null
    if (!video) {
      return
    }
    if (video === activeVideo) {
      resumeVideoPlayback(video, speeds[speedIndex])
      return
    }
    if (video === pendingVideo && shouldGuardInstagramReelPlayback(video)) {
      resumeVideoPlayback(video, video.playbackRate)
    }
  }

  // A video starts over at 1x whenever it loads a source, and the next one in a feed is
  // usually a different element altogether, so the default speed is put back as each begins.
  // `play` only covers a video whose load was missed: past its first, it is a resume, and
  // the speed by then may be one picked in the site's own player.
  const applyDefaultSpeed = (event: Event) => {
    const video = event.target
    if (defaultSpeed === 1 || !(video instanceof HTMLVideoElement) || video === activeVideo) {
      return
    }
    if (event.type === 'play' && defaultSpeedApplied.has(video)) {
      return
    }
    defaultSpeedApplied.add(video)
    if (video.playbackRate !== defaultSpeed) {
      video.playbackRate = defaultSpeed
    }
  }

  window.addEventListener(noraSettingsEvent, (event) => {
    const detail = (event as CustomEvent<{ videoEdgeLongPressTo2x?: boolean; videoDefaultSpeed?: number }>).detail
    enabled = Boolean(detail?.videoEdgeLongPressTo2x)
    if (!enabled) {
      resetPlayback()
    }
    const nextDefaultSpeed = normalizeVideoSpeed(detail?.videoDefaultSpeed)
    if (nextDefaultSpeed !== defaultSpeed) {
      resetPlayback()
      defaultSpeed = nextDefaultSpeed
      // The settings land after the page has loaded, so videos may already be playing.
      document.querySelectorAll('video').forEach((video) => {
        defaultSpeedApplied.add(video)
        video.playbackRate = defaultSpeed
      })
    }
  })

  // None of these ever preventDefault -- only the click and contextmenu handlers below do.
  // Registering them non-passive marks the whole document a blocking touch region, which
  // makes the compositor wait on the main thread before every scroll update; the page then
  // lurches instead of tracking the finger whenever a frame runs long.
  const passiveCapture = { capture: true, passive: true } as const
  document.addEventListener('pointerdown', onPointerDown, passiveCapture)
  document.addEventListener('pointermove', onPointerMove, passiveCapture)
  document.addEventListener('pointerup', onPointerEnd, passiveCapture)
  document.addEventListener('pointercancel', onPointerCancel, passiveCapture)
  document.addEventListener('touchmove', onTouchMove, passiveCapture)
  document.addEventListener('touchend', onTouchEnd, passiveCapture)
  document.addEventListener('touchcancel', onTouchCancel, passiveCapture)
  document.addEventListener('click', onClick, true)
  document.addEventListener('pause', onPause, true)
  document.addEventListener('play', applyDefaultSpeed, true)
  document.addEventListener('loadedmetadata', applyDefaultSpeed, true)
  document.addEventListener(
    'contextmenu',
    (event) => {
      const pointerEvent = event as MouseEvent
      const video = getVideoFromTarget(event.target, pointerEvent.clientX, pointerEvent.clientY)
      if (video && (video === pendingVideo || video === activeVideo)) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    true,
  )
  window.addEventListener('blur', resetPlayback)
  window.addEventListener('resize', () => {
    if (activeVideo) {
      positionIndicator(activeVideo)
    }
  })
  window.addEventListener(
    'scroll',
    () => {
      if (activeVideo) {
        positionIndicator(activeVideo)
      }
    },
    { capture: true, passive: true },
  )
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetPlayback()
    }
  })
}

function runBlueskyScript() {
  const ROOT_SELECTOR = 'div.css-g5y9jx.r-1loqt21.r-1otgn73.r-1xcajam'
  const LEFT_BTN_ID = '_nora_bsky_prev_btn'
  const RIGHT_BTN_ID = '_nora_bsky_next_btn'

  const createButtonHTML = (id: string, side: 'left' | 'right', iconPath: string) => {
    const btnParent = document.createElement('div')
    const btn = document.createElement('button')
    btnParent.appendChild(btn)

    const svgParent = document.createElement('div')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svgParent.appendChild(svg)
    svg.outerHTML = /* HTML */ `
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="${iconPath}" />
      </svg>
    `
    btn.outerHTML = /* HTML */ `
      <button
        id="${id}"
        type="button"
        style="position:fixed;bottom:20px;${side}:20px;width:44px;height:44px;border:none;border-radius:9999px;background:rgba(0, 0, 0, 0.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:999999;"
      >
        ${svgParent.innerHTML}
      </button>
    `
    return btnParent.innerHTML
  }

  const ensureButtons = () => {
    const target = document.querySelector(ROOT_SELECTOR)
    if (!target) return
    const imgs = document.querySelectorAll<HTMLImageElement>('button[aria-label] img[loading=lazy]')
    const currentImg = target.querySelector('img')
    if (!currentImg?.src) {
      return
    }
    const currentImgId = currentImg.src.split('/').at(-1)
    let index = [...imgs].findIndex((x) => x.src.split('/').at(-1) == currentImgId)

    if (index > 0 && !target.querySelector(`#${LEFT_BTN_ID}`)) {
      target.insertAdjacentHTML('beforeend', createButtonHTML(LEFT_BTN_ID, 'left', 'M15 18l-6-6 6-6'))
    }
    if (!target.querySelector(`#${RIGHT_BTN_ID}`)) {
      target.insertAdjacentHTML('beforeend', createButtonHTML(RIGHT_BTN_ID, 'right', 'M9 18l6-6-6-6'))
    }

    const bindClick = (id: string, key: 'prev' | 'next') => {
      const btn = target.querySelector(`#${id}`) as HTMLButtonElement | null
      if (!btn || btn.dataset._noraBound === '1') return
      btn.dataset._noraBound = '1'
      btn.onclick = (e) => {
        e.stopPropagation()
          ; (target as HTMLElement).click()
        if (key == 'prev') {
          index--
        } else {
          index++
        }
        const img = imgs[index]
        if (img) {
          img.scrollIntoView()
          setTimeout(() => {
            img.click()
          })
        }
      }
    }
    bindClick(LEFT_BTN_ID, 'prev')
    bindClick(RIGHT_BTN_ID, 'next')
  }

  ensureButtons()
  if (!document.body) return
  const observer = new MutationObserver(() => ensureButtons())
  observer.observe(document.body, { childList: true, subtree: true })
}

// TikTok's web player has no fullscreen button, and a page can only enter fullscreen from a tap
// on it, so each video card gets one.
function runTikTokFullscreenScript() {
  const BTN_CLASS = '_nora_tiktok_fullscreen'
  const CARD_SELECTOR = '[data-e2e="feed-video"]'

  // iPhone has no element fullscreen, and WKWebView leaves it off on iPad, but the video's own works.
  const enterVideoFullscreen = (video: HTMLVideoElement) =>
    (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.()

  const enterFullscreen = (video: HTMLVideoElement) => {
    if (!video.requestFullscreen || !document.fullscreenEnabled) {
      enterVideoFullscreen(video)
      return
    }
    video.requestFullscreen().catch((e) => {
      console.warn('[nora] tiktok fullscreen failed', e)
      enterVideoFullscreen(video)
    })
  }

  const ensureButtons = () => {
    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
      if (card.querySelector(`.${BTN_CLASS}`)) continue
      const btn = document.createElement('button')
      btn.className = BTN_CLASS
      btn.type = 'button'
      btn.setAttribute('aria-label', 'Fullscreen')
      btn.style.cssText =
        'position:absolute;top:16px;left:56px;width:32px;height:32px;padding:0;border:none;border-radius:9999px;background:rgba(0, 0, 0, 0.35);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;'
      btn.innerHTML = /* HTML */ `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      `
      // Kept from the card, which would pause the video or open it.
      for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
        btn.addEventListener(type, (e) => e.stopPropagation())
      }
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const video = card.querySelector('video')
        if (video) enterFullscreen(video)
      })
      card.appendChild(btn)
    }
  }

  ensureButtons()
  if (!document.body) return
  const observer = new MutationObserver(() => ensureButtons())
  observer.observe(document.body, { childList: true, subtree: true })
}

export function injectScript() {
  runVideoLongPressScript()

  const { host } = document.location
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    runTikTokFullscreenScript()
  }
  if (host === 'm.facebook.com' || host === 'www.facebook.com') {
    runFacebookFeedController()
  }
  const key = hostHomes[host]
  switch (key) {
    case 'bluesky':
      runBlueskyScript()
      break
    case 'x':
      runXHomeTabsController()
      break
  }
}
