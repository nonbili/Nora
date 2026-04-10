import { BrowserWindow } from 'electrobun/bun'

export let mainWindow: BrowserWindow

export function setMainWindow(window: BrowserWindow) {
  mainWindow = window
}
