import { hostHomes } from './css'

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
        target.click()
        if (key == 'prev') {
          index--
        } else {
          index++
        }
        const img = imgs[index]
        if (img) {
          img.scrollIntoView()
          img.click()
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
  const { host } = document.location
  const key = hostHomes[host]
  switch (key) {
    case 'bluesky':
      runBlueskyScript()
      break
  }
}
