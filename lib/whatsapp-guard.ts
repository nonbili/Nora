/**
 * WhatsApp Web closes its emoji, sticker and reaction pickers on any resize. Its desktop site puts the cursor in the
 * picker's search field, so on a phone the keyboard comes up, the page gets shorter, and the picker closes at once
 * (#359). A resize that only changes the height while a text field has focus is the keyboard, so it is stopped before
 * WhatsApp hears about it; a change of width, like rotating the phone, still reaches it.
 *
 * A string, not a function: Hermes keeps no source to inject. It runs at document start, so its listeners come
 * before any of WhatsApp's (`onresize` ones included) and can stop the event for all of them.
 */
export const whatsAppKeyboardGuardScript = `(() => {
  try {
    if (location.hostname !== 'web.whatsapp.com' || window.top !== window) return
    const notTyped = /^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/
    const editing = () => {
      const el = document.activeElement
      if (!el) return false
      if (el.tagName === 'INPUT') return !notTyped.test(el.type || '')
      return el.isContentEditable || el.tagName === 'TEXTAREA'
    }
    const watch = (target, width) => {
      if (!target) return
      let last = width()
      target.addEventListener('resize', (e) => {
        const next = width()
        const keyboard = next === last && editing()
        last = next
        if (keyboard) e.stopImmediatePropagation()
      }, true)
    }
    const vv = window.visualViewport
    watch(window, () => window.innerWidth)
    watch(vv, () => vv.width)
  } catch (e) {}
})()`
