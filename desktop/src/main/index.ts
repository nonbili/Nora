import { app, shell, BrowserWindow, ipcMain, screen, session } from 'electron'
import { attachDownloadHandler } from './lib/download'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setMainWindow } from './lib/main-window'
import { bindDeeplink } from './lib/deeplink'
import { genDesktopFile } from './lib/linux'
import { checkForUpdate } from './lib/auto-update'
import { initMainChannel } from './ipc/main'
import { uiClient } from './ipc/ui'
import contextMenu, { type Options as ContextMenuOptions } from 'electron-context-menu'
import { getUserAgent } from '@/lib/useragent'

app.userAgentFallback = getUserAgent(process.platform, true)

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.9),
    height: Math.floor(height * 0.9),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
    },
  })
  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.on('will-attach-webview', (_, webPreferences) => {
    webPreferences.sandbox = false
    webPreferences.preload = join(__dirname, '../preload/index.js')
  })

  const contextMenuAppend: NonNullable<ContextMenuOptions['append']> = (
    _defaults: unknown,
    params: Electron.ContextMenuParams,
    target,
  ): Electron.MenuItemConstructorOptions[] => {
    const wc = 'downloadURL' in target ? target : target.webContents

    return [
      {
        label: 'Open in profile',
        visible: /^https?:\/\//i.test(params.linkURL),
        click: () => {
          uiClient.openLinkInProfile(params.linkURL)
        },
      },
      {
        label: 'Save Image As…',
        visible: params.mediaType === 'image',
        click: () => {
          wc.downloadURL(params.srcURL)
        },
      },
    ]
  }

  const contextMenuOptions = {
    showCopyImage: true,
    showSaveImageAs: false,
    showLearnSpelling: false,
    showLookUpSelection: false,
    showSearchWithGoogle: false,
    showSelectAll: false,
    append: contextMenuAppend,
  }
  attachDownloadHandler(mainWindow.webContents.session)
  contextMenu({ ...contextMenuOptions, window: mainWindow })
  mainWindow.webContents.on('did-attach-webview', (e, wc) => {
    attachDownloadHandler(wc.session)
    wc.session.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications')
    })
    // @ts-expect-error electron-context-menu accepts a webContents-shaped wrapper
    contextMenu({ ...contextMenuOptions, window: { webContents: wc } })
    wc.setWindowOpenHandler((details) => {
      let url = details.url
      const { host, pathname, searchParams } = new URL(url)
      switch (host) {
        case 'l.threads.com':
          url = searchParams.get('u') || url
          break
      }
      shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  initMainChannel()

  attachDownloadHandler(session.defaultSession)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const win = createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  if (import.meta.env.VITE_BUILD_TARGET != 'portable') {
    genDesktopFile()
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

bindDeeplink()

if (import.meta.env.VITE_BUILD_TARGET != 'portable') {
  checkForUpdate()
}
