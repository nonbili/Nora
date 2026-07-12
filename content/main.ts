import { blockAds, hideAds } from './ad'
import { injectCSS } from './css'
import { injectScript } from './script'
import { debounce, retry } from 'es-toolkit'
import { emit } from './utils'
import { handleDialogs } from './dialogs'
import { initNora } from './nora'
import { interceptClipboard } from './clipboard'

try {
  blockAds()

  window.Nora = initNora()
  if (document.documentElement) {
    emit('onload')
    initObserver()
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      emit('onload')
      initObserver()
    })
  }
  interceptClipboard()
} catch (e) {
  console.error('NouScript: ', e)
}

async function initObserver() {
  const observer = new MutationObserver((mutations) => {
    hideAds(mutations)
    handleDialogs()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  injectCSS()
  injectScript()
  installHeaderDoubleTapToggle()
  installBlockTranslationGesture()

  const viewport = document.querySelector('meta[name=viewport]')
  if (viewport) {
    const viewportContent = viewport.getAttribute('content')
    if (viewportContent?.includes('maximum-scale=1')) {
      const contents = viewportContent.split(',').filter((x) => !x.includes('maximum-scale'))
      viewport.setAttribute('content', contents.join(','))
    }
  }
}

function installBlockTranslationGesture() {
  const root = window as Window & typeof globalThis & { __noraBlockTranslationInit?: boolean }
  if (root.__noraBlockTranslationInit) return
  root.__noraBlockTranslationInit = true

  let touchStartAt = 0
  let touchPoints: { x: number; y: number }[] = []
  let moved = false

  const textOf = (element: Element) => (element as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() || ''
  const isIgnored = (target: Element) => Boolean(target.closest('input, textarea, select, button, a, video, audio, [contenteditable="true"], [role="button"]'))
  const getBlock = (target: Element) => {
    const post = target.closest('article, [role="article"], [data-testid*="tweet" i], [data-testid*="comment" i], [data-testid*="post" i]')
    const semantic = target.closest('p, blockquote, li, [role="paragraph"], h1, h2, h3, h4, h5, h6')
    const candidate = post || semantic || target.closest('div')
    if (!candidate) return null
    const text = textOf(candidate)
    if (text.length < 2 || text.length > 12000) return null
    return { text, rect: candidate.getBoundingClientRect() }
  }

  document.addEventListener('touchstart', (event) => {
    if (!window.Nora?.getSettings?.().translateOnTwoFingerTap || event.touches.length !== 2) return
    touchStartAt = Date.now()
    touchPoints = Array.from(event.touches, (touch) => ({ x: touch.clientX, y: touch.clientY }))
    moved = false
    event.preventDefault()
  }, { capture: true, passive: false })

  document.addEventListener('touchmove', (event) => {
    if (!touchStartAt) return
    const current = Array.from(event.touches)
    moved ||= current.length !== 2 || current.some((touch, index) => Math.hypot(touch.clientX - touchPoints[index].x, touch.clientY - touchPoints[index].y) > 24)
    event.preventDefault()
  }, { capture: true, passive: false })

  document.addEventListener('touchend', (event) => {
    if (!touchStartAt || event.touches.length > 0) return
    const isTap = !moved && Date.now() - touchStartAt <= 450
    const points = touchPoints
    touchStartAt = 0
    touchPoints = []
    if (!isTap || points.length !== 2) return
    event.preventDefault()
    const x = (points[0].x + points[1].x) / 2
    const y = (points[0].y + points[1].y) / 2
    const target = document.elementFromPoint(x, y)
    if (!target || isIgnored(target)) return
    const block = getBlock(target)
    if (!block) return
    emit('translate-block', { id: `${Date.now()}-${Math.random()}`, text: block.text, x: block.rect.left, y: block.rect.bottom })
  }, { capture: true, passive: false })
}

function installHeaderDoubleTapToggle() {
  let lastTapAt = 0
  let lastTapX = 0
  let lastTapY = 0
  let multiTouchSequence = false

  document.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length > 1) multiTouchSequence = true
    },
    { passive: true, capture: true },
  )

  document.addEventListener(
    'touchend',
    (event) => {
      if (multiTouchSequence) {
        if (event.touches.length === 0) multiTouchSequence = false
        return
      }
      if (!window.Nora?.getSettings?.().doubleTapToToggleHeader || event.changedTouches.length !== 1) {
        return
      }

      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, button, a')) {
        return
      }

      const touch = event.changedTouches[0]
      const now = Date.now()
      const dx = touch.clientX - lastTapX
      const dy = touch.clientY - lastTapY
      const isDoubleTap = now - lastTapAt <= 300 && dx * dx + dy * dy <= 48 * 48

      lastTapAt = now
      lastTapX = touch.clientX
      lastTapY = touch.clientY

      if (isDoubleTap) {
        lastTapAt = 0
        emit('header-double-tap')
      }
    },
    { passive: true, capture: true },
  )
}
