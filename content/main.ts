import { blockAds, hideAds } from './ad'
import { injectCSS } from './css'
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

  const viewport = document.querySelector('meta[name=viewport]')
  if (viewport) {
    const viewportContent = viewport.getAttribute('content')
    if (viewportContent?.includes('maximum-scale=1')) {
      const contents = viewportContent.split(',').filter((x) => !x.includes('maximum-scale'))
      viewport.setAttribute('content', contents.join(','))
    }
  }
}
