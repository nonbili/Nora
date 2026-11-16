// Shortcuts install ad filtering without browser gestures or default user styles.
import { blockAds, hideAds } from './ad'
import { injectCSS } from './css'
import { initNora } from './nora'

try {
  blockAds()
  window.Nora = initNora()
  const observe = () => {
    injectCSS(false)
    new MutationObserver(hideAds).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: document.location.hostname === 'm.facebook.com',
    })
    hideAds([{ target: document.documentElement, addedNodes: [document.documentElement] } as unknown as MutationRecord])
  }
  if (document.documentElement) observe()
  else document.addEventListener('DOMContentLoaded', observe, { once: true })
} catch (error) {
  console.error('[nora] standalone ad filtering', error)
}
