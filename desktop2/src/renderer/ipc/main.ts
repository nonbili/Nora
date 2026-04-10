import { Electroview } from 'electrobun/view'
import type { NoraRPC } from '../../shared/rpc'

const rpc = Electroview.defineRPC<NoraRPC>({
  handlers: {
    requests: {},
  },
})

new Electroview({ rpc })

export const mainClient = new Proxy({} as any, {
  get(_target, name) {
    return async (...args: any[]) => {
      let params: any
      if (name === 'fetchText') {
        params = { url: args[0], headers: args[1] }
      } else if (name === 'writeBlocklistSource') {
        params = { profile: args[0], data: args[1] }
      } else if (
        name === 'writeBlocklistMatcherSnapshot' ||
        name === 'setBlocklist' ||
        name === 'readBlocklistSource' ||
        name === 'clearProfileData' ||
        name === 'downloadVideo'
      ) {
        params = args[0]
      } else {
        params = args.length === 1 ? args[0] : args.length > 1 ? args : undefined
      }

      return rpc.request.bun[name as any](params as any)
    }
  },
})
