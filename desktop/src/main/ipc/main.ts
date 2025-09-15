import { MAIN_CHANNEL } from './constants.js'
import { ipcMain, session } from 'electron'

const interfaces = {
  clearData: () => {
    session.fromPartition('persist:webview').clearData()
  },
  fetchFeed: async (url: string) => {
    const res = await fetch(url)
    return await res.text()
  },
}

export type MainInterface = typeof interfaces
type MainInterfaceKey = keyof MainInterface

function setupChannel() {
  ipcMain.handle(MAIN_CHANNEL, (_, name: string, ...args) => {
    console.log(MAIN_CHANNEL, name, JSON.stringify(args).slice(0, 100))
    const fn = interfaces[name as MainInterfaceKey]
    if (!fn) {
      console.error(`${fn} unimplemented`)
      return
    }
    // @ts-expect-error ??
    return fn(...args)
  })
}

export function initMainChannel() {
  setupChannel()
}
