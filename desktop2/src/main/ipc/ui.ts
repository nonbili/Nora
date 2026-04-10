import { mainWindow } from '../lib/main-window'

export const uiClient = {
  showToast: (message: string) => {
    mainWindow.webview?.rpc.send('showToast', message)
  },
  handleDeeplink: (url: string) => {
    mainWindow.webview?.rpc.send('handleDeeplink', url)
  },
}
