import { removeTrackingParams } from '@/lib/url'

export function interceptClipboard(nav: Navigator = navigator, doc: Document = document) {
  const writeText = nav.clipboard?.writeText
  if (writeText) {
    nav.clipboard.writeText = async function (text) {
      const clean = removeTrackingParams(text)
      return writeText.call(this, clean || text)
    }
  }
  // X's Copy link uses a selected temporary node + execCommand('copy'), not
  // navigator.clipboard. Change only a selection that is itself a URL.
  doc.addEventListener('copy', (event) => {
    if (event.defaultPrevented) return
    const text = doc.getSelection()?.toString() || ''
    const clean = removeTrackingParams(text)
    if (event.clipboardData && clean !== text) {
      event.clipboardData.setData('text/plain', clean)
      event.preventDefault()
    }
  })
  const share = nav.share
  if (share) {
    nav.share = function (data) {
      return share.call(this, data?.url ? { ...data, url: removeTrackingParams(data.url) } : data)
    }
  }
}
