import { contextBridge, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import youTubeGuard from 'nora/assets/scripts/youtube.bjs?raw'

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

// The renderer bridge stays a main-frame API. Every top-level page already had
// it; handing it to third-party iframes as well would be a new grant.
if (process.isMainFrame) {
  // Use `contextBridge` APIs to expose Electron APIs to
  // renderer only if context isolation is enabled, otherwise
  // just add to the DOM global.
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('electron', electronAPI)
    } catch (error) {
      console.error(error)
    }
  } else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
  }
}
