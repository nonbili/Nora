// Reddit can show the sheet again after client-side navigation, so this keeps running
// on every mutation batch; it is a host compare and an id lookup.
export function handleDialogs() {
  if (document.location.host != 'www.reddit.com') {
    return
  }
  const target = document.getElementById('xpromo-bottom-sheet')
  if (target) {
    // Dismiss "View in Reddit App"
    ;(target.querySelector('button[title="Continue"]') as HTMLButtonElement)?.click()
  }
}
