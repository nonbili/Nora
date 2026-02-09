import { log } from './utils'
import { removeTrackingParams } from '@/lib/url'

export function interceptClipboard() {
  const writeText = navigator.clipboard.writeText
  navigator.clipboard.writeText = async function (text) {
    const clean = removeTrackingParams(text)
    return writeText.call(this, clean || text)
  }
}
