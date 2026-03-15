import { hostHomes } from './css'
import { noraSettingsEvent } from './nora'

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
  let enabled = Boolean(window.Nora?.getSettings?.().videoEdgeLongPressTo2x)
  let pointerId: number | null = null
  let pendingVideo: HTMLVideoElement | null = null
  let activeVideo: HTMLVideoElement | null = null
  let timer: number | null = null
  let startX = 0
  let startY = 0

  const ensureIndicator = () => {
    let indicator = document.getElementById(INDICATOR_ID) as HTMLDivElement | null
    if (indicator) {
      return indicator
    }

    indicator = document.createElement('div')
    indicator.id = INDICATOR_ID
    indicator.textContent = 'Speed: 2x'
    indicator.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:24px',
      'transform:translateX(-50%)',
      'padding:8px 12px',
      'border-radius:999px',
      'background:rgba(0,0,0,0.78)',
      'color:#fff',
      'font:600 14px/1.2 -apple-system,BlinkMacSystemFont,sans-serif',
      'letter-spacing:0.01em',
      'pointer-events:none',
      'z-index:2147483647',
      'display:none',
      'white-space:nowrap',
    ].join(';')
    document.body?.appendChild(indicator)
    return indicator
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
  }

  const resetPlayback = () => {
    clearTimer()
    if (activeVideo) {
      activeVideo.playbackRate = 1
    }
    hideIndicator()
    pointerId = null
    pendingVideo = null
    activeVideo = null
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

  const activatePlayback = (video: HTMLVideoElement) => {
    if (!enabled || pendingVideo !== video) {
      return
    }
    if (video.paused || video.ended) {
      cancelPending()
      return
    }

    clearTimer()
    activeVideo = video
    video.playbackRate = 2
    const indicator = ensureIndicator()
    positionIndicator(video)
    indicator.style.display = 'block'
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!enabled || !event.isPrimary) {
      return
    }

    const video = getVideoFromTarget(event.target, event.clientX, event.clientY)
    if (!video || !isEdgePress(video, event.clientX, event.clientY)) {
      return
    }

    if (event.pointerType !== 'mouse') {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    clearTimer()
    pointerId = event.pointerId
    pendingVideo = video
    startX = event.clientX
    startY = event.clientY
    timer = window.setTimeout(() => activatePlayback(video), LONG_PRESS_DELAY_MS)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) {
      if (activeVideo) {
        positionIndicator(activeVideo)
      }
      return
    }

    if (activeVideo) {
      positionIndicator(activeVideo)
      return
    }

    const movedTooFar = Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX
    if (movedTooFar || (pendingVideo && !isEdgePress(pendingVideo, event.clientX, event.clientY))) {
      cancelPending()
    }
  }

  const onPointerEnd = (event: PointerEvent) => {
    if (pointerId === event.pointerId) {
      resetPlayback()
    }
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) {
      return
    }
    if (activeVideo) {
      pointerId = null
      pendingVideo = null
      return
    }
    cancelPending()
  }

  const onTouchStart = (event: TouchEvent) => {
    if (!enabled || event.touches.length !== 1) {
      return
    }

    const touch = event.touches[0]
    const video = getVideoFromTarget(event.target, touch.clientX, touch.clientY)
    if (!video || !isEdgePress(video, touch.clientX, touch.clientY)) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const onTouchEnd = () => {
    if (pendingVideo || activeVideo) {
      resetPlayback()
    }
  }

  window.addEventListener(noraSettingsEvent, (event) => {
    const detail = (event as CustomEvent<{ videoEdgeLongPressTo2x?: boolean }>).detail
    enabled = Boolean(detail?.videoEdgeLongPressTo2x)
    if (!enabled) {
      resetPlayback()
    }
  })

  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointermove', onPointerMove, true)
  document.addEventListener('pointerup', onPointerEnd, true)
  document.addEventListener('pointercancel', onPointerCancel, true)
  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false })
  document.addEventListener('touchend', onTouchEnd, true)
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
    true,
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

export function injectScript() {
  runVideoLongPressScript()

  const { host } = document.location
  const key = hostHomes[host]
  switch (key) {
    case 'bluesky':
      runBlueskyScript()
      break
  }
}
