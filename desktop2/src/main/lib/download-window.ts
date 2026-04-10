// import path from 'path'
// import fs from 'fs/promises'
// import { app, BrowserWindow, ipcMain, IpcMainEvent, session, WebPreferences } from 'electron'
// import { is } from '@electron-toolkit/utils'
// import contentJs from '@/assets/scripts/main.bjs?raw'
// import { uiClient } from 'main/ipc/ui'
// import { normalizeDownloadUrl } from '@/content/download'

export async function openDownloadWindow(url: string) {
  console.warn('Download window is not yet supported in Electrobun migration: ', url)
  // TODO: Implement download window using Electrobun's BrowserWindow and download management
}
