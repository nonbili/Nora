let handled = false

export function handleDialogs() {
  if (handled) {
    return
  }
  const target = document.querySelector('#xpromo-bottom-sheet')
  if (target) {
    // Dismiss "View in Reddit App"
    ;(target.querySelector('button[title="Continue"]') as HTMLButtonElement)?.click()
  }
}
