import { isUrlDrag, readDraggedUrl } from '@/lib/drag-url'
import { emit } from './utils'

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null
  return Boolean(element?.closest(EDITABLE_SELECTOR))
}

// A page fills its own tab, so a URL dropped on one of the tabs in deck or split view
// lands inside that page, not on the host. Chromium's own fallback is to navigate the
// webview, which is the right outcome but invisible to the tab state, so the drop is
// claimed here and reported to the host instead.
//
// Both listeners run in the bubble phase on purpose: a page that wants the drop (a
// drag-and-drop board, an upload zone, a link dropped into a text field) calls
// preventDefault on its own handler first, and then nothing below claims it. Only the
// drops this handler claimed in `dragover` are forwarded -- a page that claims the
// dragover keeps its drop even if it ignores the drop event itself.
export function forwardLinkDrops() {
  const root = window as Window & typeof globalThis & { __noraLinkDropsInit?: boolean }
  if (root.__noraLinkDropsInit) {
    return
  }
  root.__noraLinkDropsInit = true

  let claimed = false

  window.addEventListener('dragover', (e) => {
    claimed = !e.defaultPrevented && !isEditableTarget(e.target) && isUrlDrag(e.dataTransfer)
    if (!claimed) {
      return
    }
    // A drop event only fires when the dragover default was prevented.
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  })

  window.addEventListener('drop', (e) => {
    if (!claimed || e.defaultPrevented) {
      return
    }
    claimed = false
    const url = readDraggedUrl(e.dataTransfer)
    if (!url) {
      return
    }
    e.preventDefault()
    emit('drop-url', { url })
  })

  window.addEventListener('dragend', () => {
    claimed = false
  })
}
