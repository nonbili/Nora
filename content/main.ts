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

  const viewport = document.querySelector('meta[name=viewport]')
  if (viewport) {
    const viewportContent = viewport.getAttribute('content')
    if (viewportContent?.includes('maximum-scale=1')) {
      const contents = viewportContent.split(',').filter((x) => !x.includes('maximum-scale'))
      viewport.setAttribute('content', contents.join(','))
    }
  }
}

function installHeaderDoubleTapToggle() {
  let lastTapAt = 0
  let lastTapX = 0
  let lastTapY = 0

  document.addEventListener(
    'touchend',
    (event) => {
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
