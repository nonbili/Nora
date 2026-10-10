import { emit } from './utils'
import type { MorePostCard, MorePostsLabels, MorePostsMessage } from '../lib/more-posts'
import { noraMorePostsEvent, noraSettingsEvent } from './nora'
import { getAnonymousCss } from './anonymous'
import { getMediaId, toShortcode } from './instagram-posts'
import { getProfileUsername, isInstagramHost } from '../lib/instagram'
import {
  EMBED_AUTOMATIC_RETRIES,
  EMBED_LOAD_TIMEOUT_MS,
  EMBED_RENDER_CHECK_MS,
  MIN_RENDERED_EMBED_HEIGHT,
  clampEmbedHeight,
  isEmbedLoaded,
  parseEmbedMessage,
} from './embed-messages'

const SCAN_DELAY_MS = 400
const MIN_TILE_WIDTH = 80

const isOn = () => Boolean(window.Nora?.getSettings?.().anonymousMorePosts)

/**
 * The gate Instagram puts over the bottom of a profile for a visitor without an
 * account: a sign-up link inside a block with a gradient. Found by that, since its
 * class names are hashed. The profile's grid is the positioned block it sits in.
 */
function findGate() {
  for (const link of document.querySelectorAll<HTMLElement>('a[href*="/accounts/signup"]')) {
    if (link.closest('[role="dialog"]')) {
      continue
    }
    let gate: HTMLElement | null = null
    let grid: HTMLElement | null = null
    for (let node = link.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (!gate && style.backgroundImage.startsWith('linear-gradient')) {
        gate = node
      }
      if (gate && !grid && style.position === 'relative' && node.getBoundingClientRect().height > 200) {
        grid = node
      }
    }
    if (gate && grid) {
      return { gate, grid }
    }
  }
  return null
}

const style = <T extends HTMLElement>(element: T, css: string) => {
  element.style.cssText = css
  return element
}

const create = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) => {
  const element = style(document.createElement(tag), css)
  if (text) {
    element.textContent = text
  }
  return element
}

// Instagram's own look, on whatever theme the page is in: the text and the page behind it are
// inherited, and what is grey on one theme is a fainter shade of the same text on the other.
const INSTAGRAM_BLUE = '#0095f6'
const DIVIDER = 'rgba(127,127,127,0.3)'
const MUTED_OPACITY = '0.6'

const buttonCss =
  `display:block;margin:12px auto 0;padding:7px 16px;border:0;border-radius:8px;background:${INSTAGRAM_BLUE};` +
  'color:#fff;font:inherit;font-size:14px;font-weight:600;line-height:18px;cursor:pointer;'

const spinner = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '28')
  svg.setAttribute('height', '28')
  svg.style.cssText = 'display:block;margin:0 auto;opacity:0.6;'
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  for (const [name, value] of Object.entries({
    cx: '12', cy: '12', r: '9', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-dasharray': '42 100',
  })) {
    arc.setAttribute(name, value)
  }
  const turn = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform')
  for (const [name, value] of Object.entries({
    attributeName: 'transform', type: 'rotate', from: '0 12 12', to: '360 12 12', dur: '0.9s', repeatCount: 'indefinite',
  })) {
    turn.setAttribute(name, value)
  }
  arc.appendChild(turn)
  svg.appendChild(arc)
  return svg
}

/**
 * What tells the two lists apart: the posts above are the profile's own, the ones below are what
 * a search found. A thin line each side of a small label, the way Instagram marks a change of
 * section, so it reads as part of the page and not as something added to it.
 */
const createDivider = (label: string) => {
  const divider = create('div', 'display:flex;align-items:center;gap:12px;padding:20px 16px 12px;')
  divider.setAttribute('data-more-divider', '1')
  const line = () => create('div', `flex:1;height:1px;background:${DIVIDER};`)
  divider.appendChild(line())
  divider.appendChild(
    create('div', `font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;opacity:${MUTED_OPACITY};`, label),
  )
  divider.appendChild(line())
  return divider
}

interface EmbedCard {
  frame: HTMLIFrameElement
  wrapper: HTMLElement
  url: string
  labels: MorePostsLabels
  attempts: number
  loaded: boolean
  timer: ReturnType<typeof setTimeout> | undefined
}

/** The codes of the posts a profile's grid shows, read off its pictures, so that a search leaves those out. */
const getShownShortcodes = (grid: HTMLElement) => {
  const codes = new Set<string>()
  for (const picture of grid.querySelectorAll('img')) {
    // A tile's picture, not an icon or a profile photo that happens to sit in the grid's block.
    if (picture.getBoundingClientRect().width < MIN_TILE_WIDTH) {
      continue
    }
    const id = getMediaId(picture.currentSrc || picture.src)
    const code = id && toShortcode(id)
    if (code) {
      codes.add(code)
    }
  }
  return [...codes]
}

/** Shows the block below a profile and fills it with what the app finds. */
export function initMorePosts() {
  // Only a page of Instagram has a profile to continue: other sites are left alone, and so are frames,
  // which is what the posts of the list themselves are shown in.
  if (!isInstagramHost(document.location.hostname) || window.top !== window) {
    return () => {}
  }

  const embeds = new Set<EmbedCard>()
  const pendingEmbeds = new WeakMap<HTMLIFrameElement, EmbedCard>()

  /**
   * Starts a post loading and waits for it to say it is on screen. Instagram sometimes does not
   * show a post it showed a moment before, and a page that does not load never says so, so it is
   * tried once more and then replaced by a note that can be tried again by hand.
   */
  const startEmbed = (embed: EmbedCard) => {
    // Gone with the list it was in: nothing is started, or waited for, for a card that is not there.
    if (!embeds.has(embed)) {
      return
    }
    embed.loaded = false
    clearTimeout(embed.timer)
    showEmbedSpinner(embed)
    embed.frame.src = embed.url
    embed.timer = setTimeout(() => {
      if (!embed.loaded) {
        failEmbed(embed)
      }
    }, EMBED_LOAD_TIMEOUT_MS)
  }

  const failEmbed = (embed: EmbedCard) => {
    if (embed.attempts < EMBED_AUTOMATIC_RETRIES) {
      embed.attempts += 1
      embed.frame.removeAttribute('src')
      embed.timer = setTimeout(() => startEmbed(embed), 300)
    } else {
      showEmbedUnavailable(embed)
    }
  }

  /** The slot a post will fill says so while it waits, instead of standing empty. */
  const showEmbedSpinner = (embed: EmbedCard) => {
    if (embed.wrapper.querySelector('[data-embed-spinner]')) {
      return
    }
    const holder = create('div', 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;')
    holder.setAttribute('data-embed-spinner', '1')
    holder.appendChild(spinner())
    embed.frame.parentElement?.appendChild(holder)
  }

  const hideEmbedSpinner = (embed: EmbedCard) => embed.wrapper.querySelector('[data-embed-spinner]')?.remove()

  /** A page can say it is on screen and still be blank; a frame that shows nothing is tried again like one that never answered. */
  const checkEmbedRendered = (embed: EmbedCard) => {
    if (!embeds.has(embed) || !embed.loaded) {
      return
    }
    try {
      // A frame on another origin (a profile on instagram.com, its embeds on www.) cannot be looked into:
      // its own word that it is on screen is all there is.
      const doc = embed.frame.contentDocument
      if (!doc) {
        return
      }
      // Blank is a page with neither the post's block nor a picture or video at a height that shows
      // something. A small picture does not count: the header's is there on a page with no post in it.
      const shows = (element: Element) => element.getBoundingClientRect().height > MIN_RENDERED_EMBED_HEIGHT
      if ([...doc.querySelectorAll('.Embed, img, video')].some(shows)) {
        return
      }
    } catch {
      return
    }
    embed.loaded = false
    failEmbed(embed)
  }

  const showEmbedUnavailable = (embed: EmbedCard) => {
    hideEmbedSpinner(embed)
    embed.frame.removeAttribute('src')
    embed.frame.style.display = 'none'
    // The link leads to the same page, which would not show the post either.
    embed.wrapper.querySelector<HTMLElement>('[data-open-post]')?.style.setProperty('display', 'none')
    embed.wrapper.querySelector('[data-embed-unavailable]')?.remove()
    const note = create('div', 'padding:20px 16px 4px;text-align:center;font-size:14px;line-height:18px;')
    note.setAttribute('data-embed-unavailable', '1')
    note.appendChild(create('div', `opacity:${MUTED_OPACITY};`, embed.labels.unavailable))
    const retry = create('button', `${buttonCss}margin:12px auto 0;`, embed.labels.retry)
    retry.type = 'button'
    retry.addEventListener('click', () => {
      note.remove()
      embed.wrapper.querySelector<HTMLElement>('[data-open-post]')?.style.removeProperty('display')
      embed.attempts = 0
      embed.frame.style.display = 'block'
      startEmbed(embed)
    })
    note.appendChild(retry)
    embed.frame.insertAdjacentElement('afterend', note)
  }

  window.addEventListener('message', (event) => {
    const message = parseEmbedMessage(event.data)
    if (!message) {
      return
    }
    for (const embed of embeds) {
      if (embed.frame.contentWindow !== event.source) {
        continue
      }
      if (message.type === 'MEASURE' && message.height) {
        embed.frame.style.height = `${clampEmbedHeight(message.height)}px`
      }
      if (isEmbedLoaded(message)) {
        embed.loaded = true
        clearTimeout(embed.timer)
        hideEmbedSpinner(embed)
        setTimeout(() => checkEmbedRendered(embed), EMBED_RENDER_CHECK_MS)
      }
      return
    }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  let current: { username: string; block: HTMLElement; gate: HTMLElement; grid: HTMLElement; page: number; loading: boolean } | null = null
  let observer: IntersectionObserver | undefined
  let moreObserver: IntersectionObserver | undefined

  const remove = () => {
    if (!current) {
      return
    }
    current.block.remove()
    current.gate.style.removeProperty('display')
    current = null
    for (const embed of embeds) {
      clearTimeout(embed.timer)
    }
    embeds.clear()
    observer?.disconnect()
    observer = undefined
    moreObserver?.disconnect()
    moreObserver = undefined
  }

  const request = (page: number) => {
    if (!current) {
      return
    }
    current.loading = true
    emit('load-more-posts', { username: current.username, page })
  }

  /**
   * The button that shows more, which presses itself once it comes near the screen, so that the list goes
   * on as it is scrolled. After a failure it is left to the person, so that it does not retry without end.
   */
  const addMoreButton = (block: HTMLElement, labels: MorePostsLabels, automatic: boolean) => {
    const more = create('button', `${buttonCss}margin:16px auto;`, labels.more)
    more.type = 'button'
    more.setAttribute('data-more-button', '1')
    more.addEventListener('click', () => {
      if (current && !current.loading) {
        moreObserver?.unobserve(more)
        more.remove()
        renderStatus(block, null)
        request(current.page + 1)
      }
    })
    block.appendChild(more)
    if (automatic) {
      moreObserver ??= new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && current && !current.loading) {
              ;(entry.target as HTMLElement).click()
            }
          }
        },
        { rootMargin: '600px' },
      )
      moreObserver.observe(more)
    }
  }

  const placeNote = (block: HTMLElement, labels: MorePostsLabels) => {
    block.querySelector('[data-more-note]')?.remove()
    const note = create('div', `padding:8px 16px 20px;text-align:center;font-size:12px;line-height:16px;opacity:${MUTED_OPACITY};`, labels.note)
    note.setAttribute('data-more-note', '1')
    block.appendChild(note)
  }

  const renderStatus = (block: HTMLElement, text: string | null) => {
    block.querySelector('[data-more-status]')?.remove()
    const status = create('div', 'padding:20px 16px;text-align:center;font-size:14px;line-height:18px;')
    status.setAttribute('data-more-status', '1')
    // Announced as it changes: a search, an error and an empty list are all said aloud.
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    if (text === null) {
      status.appendChild(spinner())
    } else {
      status.appendChild(create('div', `opacity:${MUTED_OPACITY};`, text))
    }
    block.appendChild(status)
  }

  /**
   * What the list starts as: one button that says what it does -- carry on with this profile's
   * posts, found through a search -- and a line on who sees the name. Nothing is looked up until
   * it is pressed.
   */
  const renderContinue = (block: HTMLElement, payload: MorePostsMessage, message?: string) => {
    block.querySelector('[data-more-status]')?.remove()
    const status = create('div', 'padding:16px 16px 20px;text-align:center;font-size:14px;line-height:18px;')
    status.setAttribute('data-more-status', '1')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    if (message) {
      status.appendChild(create('div', `margin-bottom:12px;opacity:${MUTED_OPACITY};`, message))
    }
    const button = create('button', `${buttonCss}margin:0 auto;`, payload.labels.continue)
    button.type = 'button'
    button.addEventListener('click', () => {
      if (!payload.searchUrl) {
        return
      }
      renderStatus(block, null)
      block.querySelector('[data-more-status]')?.appendChild(create('div', `margin-top:10px;font-size:12px;opacity:${MUTED_OPACITY};`, payload.labels.searching))
      emit('search-profile-posts', { url: payload.searchUrl, shown: current ? getShownShortcodes(current.grid) : [] })
    })
    status.appendChild(button)
    status.appendChild(create('div', `margin-top:10px;font-size:12px;line-height:16px;opacity:${MUTED_OPACITY};`, payload.labels.continueHint))
    block.insertBefore(status, block.querySelector('[data-more-note]'))
  }

  const renderCard = (card: MorePostCard, labels: MorePostsLabels) => {
    const wrapper = create('div', `padding:12px 0;border-bottom:1px solid ${DIVIDER};`)
    wrapper.setAttribute('data-more-card', '1')

    // The picture comes from Instagram's own embed page, loaded only once the card is near the screen.
    const slot = create('div', 'position:relative;max-width:540px;margin:10px auto 0;')
    const frame = create('iframe', 'display:block;width:100%;height:560px;border:0;')
    // No sandbox: the page is on instagram.com like this one, and a sandbox that lets its scripts keep their
    // origin leaves nothing to separate them. The posts the embed page may show are Instagram's to show.
    frame.title = card.caption.slice(0, 80) || labels.openPost
    frame.setAttribute('loading', 'lazy')
    slot.appendChild(frame)
    wrapper.appendChild(slot)
    // The embed page is on instagram.com like this one, so what the mode hides on an embed page can be hidden
    // inside the card too, once it has loaded.
    frame.addEventListener('load', () => {
      try {
        const doc = frame.contentDocument
        if (doc?.head && !doc.getElementById('_nora_embed_css')) {
          const style = doc.createElement('style')
          style.id = '_nora_embed_css'
          style.textContent = getAnonymousCss('www.instagram.com', true)
          doc.head.appendChild(style)
        }
      } catch {
        // A frame that is not on this origin cannot be reached, and is left as it is.
      }
    })
    const embed: EmbedCard = { frame, wrapper, url: card.embedUrl, labels, attempts: 0, loaded: false, timer: undefined }
    embeds.add(embed)
    pendingEmbeds.set(frame, embed)
    observer?.observe(frame)

    const open = create('a', `display:block;padding:10px 16px 0;font-size:14px;font-weight:600;line-height:18px;color:${INSTAGRAM_BLUE};text-decoration:none;`, labels.openPost)
    // The embed page, in this tab: it has the player, and going back lands on the profile.
    open.href = card.embedUrl
    open.setAttribute('data-open-post', '1')
    wrapper.appendChild(open)
    return wrapper
  }

  const onPayload = (event: Event) => {
    const payload = (event as CustomEvent<MorePostsMessage>).detail
    // Names are compared without case, as Instagram does: the answer may spell it as an earlier address did.
    if (!current || typeof payload?.username !== 'string' || payload.username.toLowerCase() !== current.username.toLowerCase()) {
      return
    }
    current.loading = false
    const { block } = current
    block.querySelector('[data-more-status]')?.remove()
    block.querySelector('[data-more-button]')?.remove()
    // A later part that could not be had leaves the list as it is, and says so with a way to try again.
    if (payload.status === 'error' && payload.page > 0) {
      renderStatus(block, payload.labels.error)
      addMoreButton(block, payload.labels, false)
      placeNote(block, payload.labels)
      return
    }
    if (payload.status === 'idle' || payload.status === 'error') {
      renderContinue(block, payload, payload.status === 'error' ? payload.labels.error : undefined)
      return
    }
    current.page = payload.page

    // A first page is a new list: what was shown before, when a search has been done again after the
    // last one went stale, is replaced and not added to.
    if (payload.page === 0) {
      for (const stale of block.querySelectorAll('[data-more-card], [data-more-divider]')) {
        stale.remove()
      }
      for (const embed of [...embeds]) {
        if (!embed.wrapper.isConnected) {
          clearTimeout(embed.timer)
          embeds.delete(embed)
        }
      }
    }
    // The note is the foot of the list, so it is taken off while the list grows and put back after.
    block.querySelector('[data-more-note]')?.remove()
    if (!block.querySelector('[data-more-divider]')) {
      block.insertBefore(createDivider(payload.labels.title), block.firstChild)
    }
    for (const card of payload.posts) {
      block.appendChild(renderCard(card, payload.labels))
    }
    if (payload.hasMore) {
      addMoreButton(block, payload.labels, true)
    } else if (payload.page === 0 && !payload.posts.length) {
      renderStatus(block, payload.labels.empty)
    }
    placeNote(block, payload.labels)
  }

  const scan = () => {
    timer = undefined
    const username = isOn() ? getProfileUsername(document.location.hostname, document.location.pathname) : null
    if (!username || (current && current.username !== username)) {
      remove()
    }
    if (!username || current) {
      // The block is gone when the page replaced the part it sat in.
      if (current && !current.block.isConnected) {
        remove()
      }
      return
    }

    const found = findGate()
    if (!found) {
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const frame = entry.target as HTMLIFrameElement
          const embed = pendingEmbeds.get(frame)
          if (entry.isIntersecting && embed) {
            pendingEmbeds.delete(frame)
            observer?.unobserve(frame)
            startEmbed(embed)
          }
        }
      },
      { rootMargin: '400px' },
    )
    // Straight under the grid, so the list carries on from it.
    const block = create('div', 'margin:0;padding:0;')
    found.gate.style.setProperty('display', 'none', 'important')
    found.grid.insertAdjacentElement('afterend', block)
    current = { username, block, gate: found.gate, grid: found.grid, page: 0, loading: false }
    renderStatus(block, null)
    request(0)
  }

  const schedule = () => {
    if (timer === undefined) {
      timer = setTimeout(scan, SCAN_DELAY_MS)
    }
  }

  window.addEventListener(noraMorePostsEvent, onPayload)
  window.addEventListener(noraSettingsEvent, schedule)
  schedule()
  return schedule
}
