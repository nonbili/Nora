import path from 'path'
import { BrowserWindow, ipcMain, IpcMainEvent, session, WebPreferences } from 'electron'
import { is } from '@electron-toolkit/utils'
import contentJs from '@/assets/scripts/main.bjs?raw'
import { uiClient } from 'main/ipc/ui'

async function handleProtocolRequest(req: Request, callback: (url: string) => void): Promise<Response> {
  const url = req.url
  const ses = session.defaultSession

  try {
    const res = await ses.fetch(req, {
      bypassCustomProtocolHandlers: true,
    })
    if (req.url.startsWith('https://api.x.com/graphql/') && req.url.includes('TweetResultByRestId')) {
      const body = await res.text()
      const data = JSON.parse(body)
      const media = data.data.tweetResult.result.legacy.entities.media || []
      for (const entity of media) {
        const variants = entity.video_info?.variants || []
        const videoUrl = variants.at(-1)?.url
        callback(videoUrl)
        break
      }

      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    }

    return res
  } catch (error) {
    console.error('Protocol handling error:', error)
    return new Response('Error handling request', { status: 500 })
  }
}

export async function openDownloadWindow(url: string) {
  let win: BrowserWindow | undefined
  const webPreferences: WebPreferences = {
    sandbox: false,
  }

  const download = (videoUrl: string) => {
    if (win && videoUrl) {
      ses.downloadURL(videoUrl)
      win.close()
      win = undefined
    }
  }

  const { host } = new URL(url)
  switch (host) {
    case 'm.facebook.com':
    case 'www.facebook.com':
    case 'www.instagram.com':
      webPreferences.preload = path.join(__dirname, '../preload/index.js')
      break
    case 'x.com':
      const ses = session.defaultSession
      ses.protocol.handle('https', (req) =>
        handleProtocolRequest(req, (videoUrl: string) => {
          download(videoUrl)
        }),
      )
      break
  }

  win = new BrowserWindow({
    width: 400,
    height: 800,
    autoHideMenuBar: true,
    webPreferences,
  })

  win.loadURL(url)
  const ses = session.defaultSession

  const onMessage = (e: IpcMainEvent, payload: { type: string; data: any }) => {
    if (is.dev) {
      console.log('onMessage', payload)
    }
    const { type, data } = payload
    switch (type) {
      case 'download':
        download(data.url)
        break
    }
  }

  switch (host) {
    case 'm.facebook.com':
    case 'www.facebook.com':
    case 'www.instagram.com':
      ipcMain.addListener('channel:content', onMessage)
      win.webContents.executeJavaScript(contentJs)
      win.webContents.executeJavaScript('window.Nora.getVideoUrl()')
      break
    case 'x.com':
      break
  }

  if (is.dev) {
    win.webContents.openDevTools()
  }

  ses.on('will-download', (event, downloadItem) => {
    const name = downloadItem.getFilename()
    downloadItem.on('done', (event, state) => {
      const path = downloadItem.getSavePath()
      if (state === 'completed') {
        uiClient.showToast(`Download finished: ${path}`)
      } else {
        uiClient.showToast(`Download failed: ${path}`)
      }
    })
  })

  win.on('closed', () => {
    ipcMain.removeListener('channel:content', onMessage)
  })
}
