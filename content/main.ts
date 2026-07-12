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
  installDoubleTapGestures()

  const viewport = document.querySelector('meta[name=viewport]')
  if (viewport) {
    const viewportContent = viewport.getAttribute('content')
    if (viewportContent?.includes('maximum-scale=1')) {
      const contents = viewportContent.split(',').filter((x) => !x.includes('maximum-scale'))
      viewport.setAttribute('content', contents.join(','))
    }
  }
}

function installDoubleTapGestures() {
  const root = window as Window & typeof globalThis & { __noraDoubleTapGesturesInit?: boolean }
  if (root.__noraDoubleTapGesturesInit) return
  root.__noraDoubleTapGesturesInit = true

  let lastTapAt = 0
  let lastTapX = 0
  let lastTapY = 0
  let multiTouchSequence = false

  const textOf = (element: Element) => {
    const parts: string[] = []
    const appendBreak = () => {
      if (parts.length && !parts.at(-1)?.endsWith('\n')) parts.push('\n')
    }
    const appendParagraphBreak = () => {
      appendBreak()
      if (parts.length && !parts.at(-1)?.endsWith('\n\n')) parts.push('\n')
    }
    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent?.replace(/\s+/g, ' ').trim()
        if (value) parts.push(value, ' ')
        return
      }
      if (!(node instanceof Element)) return
      if (node.tagName === 'BR') {
        appendBreak()
        return
      }
      const isParagraph = /^(P|LI|BLOCKQUOTE|H[1-6])$/.test(node.tagName)
      const isTextBlock = isParagraph
        || (node.tagName === 'DIV' && Array.from(node.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
      if (isParagraph) appendParagraphBreak()
      else if (isTextBlock) appendBreak()
      node.childNodes.forEach(visit)
      if (isParagraph) appendParagraphBreak()
      else if (isTextBlock) appendBreak()
    }
    visit(element)
    return parts.join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  const isIgnored = (target: Element) => Boolean(target.closest('input, textarea, select, button, a, video, audio, [contenteditable="true"], [role="button"]'))
  const isTextAtPoint = (x: number, y: number) => {
    const range = document.caretRangeFromPoint?.(x, y)
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return false
    const text = range.startContainer.textContent || ''
    if (!text.trim()) return false
    const offset = Math.min(range.startOffset, Math.max(0, text.length - 1))
    const glyphRange = document.createRange()
    glyphRange.setStart(range.startContainer, offset)
    glyphRange.setEnd(range.startContainer, Math.min(text.length, offset + 1))
    const rect = glyphRange.getBoundingClientRect()
    return x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 8 && y <= rect.bottom + 8
  }
  const getBlock = (target: Element) => {
    const post = target.closest('article, [role="article"], [data-testid*="tweet" i], [data-testid*="comment" i], [data-testid*="post" i]')
    const semantic = target.closest('p, blockquote, li, [role="paragraph"], h1, h2, h3, h4, h5, h6')
    const candidate = post || semantic
    if (!candidate) return null
    const text = textOf(candidate)
    if (text.length < 2 || text.length > 12000) return null
    return { text, rect: candidate.getBoundingClientRect() }
  }

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length > 1) multiTouchSequence = true
  }, { passive: true, capture: true })

  document.addEventListener('touchend', (event) => {
    if (multiTouchSequence) {
      if (event.touches.length === 0) multiTouchSequence = false
      return
    }
    if (event.changedTouches.length !== 1) return
    const touch = event.changedTouches[0]
    const now = Date.now()
    const dx = touch.clientX - lastTapX
    const dy = touch.clientY - lastTapY
    const isDoubleTap = now - lastTapAt <= 300 && dx * dx + dy * dy <= 48 * 48
    lastTapAt = now
    lastTapX = touch.clientX
    lastTapY = touch.clientY
    if (!isDoubleTap) return
    lastTapAt = 0

    const target = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!target || isIgnored(target)) return
    const settings = window.Nora?.getSettings?.()
    const block = settings?.translateOnDoubleTap && isTextAtPoint(touch.clientX, touch.clientY) ? getBlock(target) : null
    if (block) {
      event.preventDefault()
      emit('translate-block', { id: `${Date.now()}-${Math.random()}`, text: block.text, x: block.rect.left, y: block.rect.bottom })
      return
    }
    if (settings?.doubleTapToToggleHeader) {
      event.preventDefault()
      emit('header-double-tap')
    }
  }, { capture: true, passive: false })
}
