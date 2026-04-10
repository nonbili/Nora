import { BrowserWindow, Screen, Updater } from 'electrobun/bun'
import { setMainWindow } from './lib/main-window'
import { initMainChannel } from './ipc/main'
import { getUserAgent } from '@/lib/useragent'

// Set default user agent if possible
// Electrobun might not have a global userAgentFallback yet,
// but we can set it on BrowserViews.

async function getMainViewUrl(): Promise<string> {
  try {
    const channel = await Updater.localInfo.channel()
    if (channel === 'dev') {
      const DEV_SERVER_URL = 'http://localhost:5173'
      try {
        await fetch(DEV_SERVER_URL, { method: 'HEAD' })
        return DEV_SERVER_URL
      } catch {
        console.warn(`[desktop2] renderer dev server not reachable at ${DEV_SERVER_URL}; falling back to packaged assets`)
      }
    }
  } catch {
    // ignore
  }
  return 'views://mainview/index.html'
}

async function createWindow() {
  const display = Screen.getPrimaryDisplay()
  const { width, height } = display.workArea

  const url = await getMainViewUrl()

  const mainWindow = new BrowserWindow({
    title: 'Nora',
    url,
    frame: {
      width: Math.floor(width * 0.9),
      height: Math.floor(height * 0.9),
      x: Math.floor(width * 0.05),
      y: Math.floor(height * 0.05),
    },
  })

  setMainWindow(mainWindow)

  if (mainWindow.webview) {
    initMainChannel(mainWindow.webview)
  }

  // Handle window closing
  // Electrobun currently exits when all windows are closed by default or via config
}

void createWindow()
