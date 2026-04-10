import { showToast } from '@/lib/toast.js'
import { handleDeeplink } from '../lib/deeplink.js'
import { Electroview } from 'electrobun/view'
import type { NoraRPC } from '../../shared/rpc.js'

const rpc = Electroview.defineRPC<NoraRPC>({
  handlers: {
    messages: {
      handleDeeplink: (url: string) => {
        handleDeeplink(url)
      },
      showToast: (message: string) => {
        showToast(message)
      },
    },
  },
})

new Electroview({ rpc })

export function initUiChannel() {
  // Electroview initialization handles message routing
}
