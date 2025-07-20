import { blockAds, hideAds } from './ad'
import { injectCSS } from './css'
import { debounce, retry } from 'es-toolkit'
import { emit } from './utils'

try {
  blockAds()

  initObserver()
} catch (e) {
  console.error('NouScript: ', e)
}

async function initObserver() {
  const target = await retry(
    async () => {
      if (!document.documentElement) {
        throw 'documentElement not ready'
      }
      return document.documentElement
    },
    { retries: 50, delay: 100 },
  )

  const observer = new MutationObserver((mutations) => {
    hideAds(mutations)
  })
  observer.observe(target, {
    childList: true,
    subtree: true,
  })

  injectCSS()

  // const emitScrollChange = debounce((payload) => emit({ type: 'scroll', payload }), 200)

  // let lastScrollY = 0
  // document.addEventListener('scroll', (e) => {
  //   if (Math.abs(window.scrollY - lastScrollY) < 100) {
  //     return
  //   }
  //   const up = window.scrollY < lastScrollY
  //   lastScrollY = window.scrollY
  //   window.requestAnimationFrame(() => {
  //     emitScrollChange(up)
  //   })
  // })
}
