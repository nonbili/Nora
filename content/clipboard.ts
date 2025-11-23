import { log } from './utils'

export function fixSharingUrl(v: string) {
  try {
    const url = new URL(v)
    ;[
      // instagram & reddit
      'utm_source',
      'utm_medium',
      'utm_name',
      'utm_term',
      'utm_content',
      // instagram
      'igsh',
      // threads
      'xmt',
    ].forEach((x) => url.searchParams.delete(x))
    return url.href
  } catch (e) {
    return ''
  }
}

export function interceptClipboard() {
  const writeText = navigator.clipboard.writeText
  navigator.clipboard.writeText = async function (text) {
    const clean = fixSharingUrl(text)
    return writeText(clean || text)
  }
}
