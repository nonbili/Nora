import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import youTubeGuard from 'nora/assets/scripts/youtube.bjs?raw'
import { observeNotificationClicks, installNotificationClickHandler, setupNotificationClicks } from './notifications'

// Tab webviews load this preload in every frame (see `nodeIntegrationInSubFrames`
// in the main process), because an embedded YouTube player is an iframe on
// youtube.com with a player response of its own. Preloads run before the page's
// scripts, and `webFrame.executeJavaScript` reaches the page's own context --
// which is where the guard has to patch `fetch`/`XMLHttpRequest`. The guard
// no-ops on every other host.
try {
  void webFrame.executeJavaScript(youTubeGuard)
} catch (error) {
  console.error('[nora] failed to install YouTube ad guard', error)
}

// This preload also runs in Nora's own window. Only guest frames have a host.
// Focus events can come from page scripts; require actual user input instead.
if (process.argv.includes('--nora-tab-guest')) {
  if (process.isMainFrame && process.contextIsolated) {
    // Electron 43 does not implement persistent (service-worker) notifications.
    setupNotificationClicks(
      () => observeNotificationClicks(() => ipcRenderer.send('notification-click')),
      () => webFrame.executeJavaScript(`(${installNotificationClickHandler.toString()})()`),
      (error) => console.error('[nora] failed to install notification click handler', error),
    )
  }

  const activateTab = (event: Event) => {
    if (event.isTrusted) ipcRenderer.sendToHost('activate-tab')
  }
  window.addEventListener('pointerdown', activateTab, true)
  window.addEventListener('keydown', activateTab, true)
}

// The renderer bridge stays a main-frame API. Every top-level page already had
// it; handing it to third-party iframes as well would be a new grant.
if (process.isMainFrame) {
  // Guests only need content messages. In particular, never expose arbitrary IPC
  // sends that could bypass the isolated notification click check.
  const api = process.argv.includes('--nora-tab-guest') ? {
    ipcRenderer: {
      sendToHost: (channel: string, ...args: unknown[]) => {
        if (channel !== 'activate-tab') ipcRenderer.sendToHost(channel, ...args)
      },
      send: (channel: string, ...args: unknown[]) => {
        if (channel === 'channel:content') ipcRenderer.send(channel, ...args)
      },
    },
  } : electronAPI
  // Use `contextBridge` APIs to expose Electron APIs to
  // renderer only if context isolation is enabled, otherwise
  // just add to the DOM global.
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('electron', api)
    } catch (error) {
      console.error(error)
    }
  } else {
    // @ts-ignore (define in dts)
    window.electron = api
  }
}
