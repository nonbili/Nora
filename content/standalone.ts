// Shortcuts install ad filtering without browser gestures or default user styles.
import { blockAds, hideAds } from './ad'
import { injectCSS } from './css'
import { initNora } from './nora'

try {
  blockAds()
  window.Nora = initNora()
  const observe = () => {
    injectCSS(false)
    new MutationObserver(hideAds).observe(document.documentElement, { childList: true, subtree: true })
  }
  if (document.documentElement) observe()
  else document.addEventListener('DOMContentLoaded', observe, { once: true })
} catch (error) {
  console.error('[nora] standalone ad filtering', error)
}
