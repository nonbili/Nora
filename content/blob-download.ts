// Android's DownloadListener receives the blob URL, but not <a download>.
// Remember the name before the page removes the link or revokes its object URL.
export function trackBlobDownloadNames(win: Window, doc: Document) {
  const names = new Map<string, string>()
  const remember = (anchor: HTMLAnchorElement) => {
    if (!anchor.href.startsWith('blob:') || !anchor.download) return
    names.delete(anchor.href)
    names.set(anchor.href, anchor.download)
    while (names.size > 8) names.delete(names.keys().next().value!)
  }
  // Export libraries commonly click a detached anchor, so a document listener
  // alone misses them. Keep native click behavior (and the native save flow).
  const prototype = (win as Window & typeof globalThis).HTMLAnchorElement.prototype
  const click = prototype.click
  prototype.click = function () {
    remember(this)
    return click.call(this)
  }
  // FileSaver dispatches a MouseEvent on a detached anchor instead of click().
  // Patch only anchors, not every EventTarget on the page.
  const dispatchEvent = prototype.dispatchEvent
  prototype.dispatchEvent = function (event: Event) {
    if (event.type === 'click') remember(this)
    return dispatchEvent.call(this, event)
  }
  doc.addEventListener(
    'click',
    (event) => {
      const anchor = event
        .composedPath()
        .find((node) => node instanceof (win as Window & typeof globalThis).HTMLAnchorElement)
      if (anchor) remember(anchor as HTMLAnchorElement)
    },
    true,
  )
  return (url: string) => names.get(url)
}
export function sanitizeDownloadName(name: string) {
  const safe = name.replace(/[/\\\x00-\x1f\x7f]/g, '_')
  return !safe || safe === '.' || safe === '..' ? 'download' : safe
}
