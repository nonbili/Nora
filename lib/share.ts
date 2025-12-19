import { Share } from 'react-native'
import { removeTrackingParams } from '@/lib/page'
import { isWeb } from './utils'
import { showToast } from './toast'

export function share(url: string) {
  url = removeTrackingParams(url)
  if (isWeb) {
    navigator.clipboard.writeText(url)
    showToast('Copied to clipboard')
  } else {
    Share.share({ message: url })
  }
}
