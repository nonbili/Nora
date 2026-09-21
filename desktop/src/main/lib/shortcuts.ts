import type { Input, WebContents } from 'electron'

export function attachGuestShortcuts(webContents: WebContents, handleShortcuts: (input: Input) => void) {
  webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || !(input.control || input.meta)) return

    const key = input.key.toLowerCase()
    if (key === 'r') {
      event.preventDefault()
      webContents.reload()
    } else if (key === 't' || key === 'w' || /^[1-9]$/.test(key)) {
      // Reserve digit shortcuts even when the renderer has no matching tab:
      // cancellation must be synchronous, while the tab list lives in the renderer.
      event.preventDefault()
      handleShortcuts(input)
    }
  })
}
