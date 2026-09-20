// A link dragged out of a page carries `text/uri-list` (one entry per line, lines
// starting with `#` are comments) and, on most sites, a `text/plain` copy of the same
// URL. During `dragover` the payload is protected and only `types` can be read, so the
// checks are split: `isUrlDrag` decides whether to claim the drop, `readDraggedUrl`
// reads it once the drop lands.

const URI_LIST = 'text/uri-list'

type DragPayload = (Pick<DataTransfer, 'types' | 'getData'> & { items?: DataTransferItemList }) | null | undefined

export function isUrlDrag(dataTransfer: DragPayload) {
  if (!dataTransfer) {
    return false
  }
  const types = Array.from(dataTransfer.types || [])
  if (!types.includes(URI_LIST)) {
    return false
  }
  // A file drag can also advertise a uri-list, and those belong to the page (upload
  // zones), never to us. `items` reports the real kinds and, unlike the payload, its
  // kinds stay readable during `dragover`, so it beats looking for a `Files` type -- a
  // link dragged out of another webview picks up entries a same-page drag never has.
  const items = Array.from(dataTransfer.items || [])
  return items.length ? !items.some((item) => item.kind === 'file') : !types.includes('Files')
}

// The app chrome has no drop behaviour of its own, and a drop nothing claims makes
// Chromium navigate the window itself -- which would replace the whole UI with the
// dropped target. So the chrome claims every drag that carries anything and decides what
// to do once the payload becomes readable, at drop time.
export function claimsHostDrop(dataTransfer: DragPayload) {
  return Boolean(dataTransfer && Array.from(dataTransfer.types || []).length)
}

export function readDraggedUrl(dataTransfer: DragPayload): string | null {
  if (!dataTransfer) {
    return null
  }

  let candidate = ''
  try {
    candidate =
      (dataTransfer.getData(URI_LIST) || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#')) || dataTransfer.getData('text/plain')
  } catch {
    return null
  }

  const url = candidate?.trim()
  if (!url) {
    return null
  }

  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
