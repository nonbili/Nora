import { blockAds, hideAds } from './ad'
import { injectCSS } from './css'
import { debounce, retry } from 'es-toolkit'
import { emit } from './utils'
import { handleDialogs } from './dialogs'
import { initNora } from './nora'
import { interceptClipboard } from './clipboard'

function onload() {
  emit('onload')
  initObserver()
}

try {
  blockAds()

  window.Nora = initNora()
  if (document.documentElement) {
    console.log('- onload 0')
    onload()
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('- onload 1')
      onload()
    })
  }
  console.log('- onload 2')
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
