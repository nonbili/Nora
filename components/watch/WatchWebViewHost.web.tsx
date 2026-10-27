import { useCallback, useEffect, useRef } from 'react'
import { useValue } from '@legendapp/state/react'
import type { WebviewTag } from 'electron'
import { NoraView } from '@/modules/nora-view'
import { getUserAgent } from '@/lib/useragent'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import {
  WATCH_WEBVIEW_PROFILE,
  buildWatchPageScript,
  onWatchWebViewError,
  onWatchWebViewMessage,
  watchWebView$,
} from '@/lib/watch-webview'
import { WatchWebViewFrame } from './WatchWebViewFrame'

// What a webview says of a load the next one replaced, which is not a failure.
const ERR_ABORTED = -3

/**
 * The webview that reads a watched profile's page out of sight, on desktop; there only while it
 * has a page to read. It starts on a blank page, so its script is handed to the main process
 * before the profile's page is loaded, and run there by the preload before the page's own.
 */
export const WatchWebViewHost = () => {
  const job = useValue(watchWebView$.job)
  const listenersRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return
    watchWebView$.hostMounted.set(true)
    return () => watchWebView$.hostMounted.set(false)
  }, [])

  const ref = useCallback(
    (webview: WebviewTag | null) => {
      listenersRef.current?.abort()
      listenersRef.current = null
      if (!webview || !job) return
      const controller = new AbortController()
      listenersRef.current = controller
      const on = <E extends Event = Event>(event: string, handler: (e: E) => void) =>
        (webview as unknown as HTMLElement).addEventListener(event, handler as EventListener, {
          signal: controller.signal,
        })
      let started = false
      // Its methods work once the blank page it starts on is ready.
      on('dom-ready', async () => {
        if (started) return
        started = true
        try {
          // A page it reads never plays aloud, as TikTok's would.
          webview.setAudioMuted(true)
          await mainClient.setWatchPageScript(
            webview.getWebContentsId(),
            buildWatchPageScript(job.id, job.marker, job.more, job.until, job.selector),
          )
          if (controller.signal.aborted) return
          await webview.loadURL(job.url)
        } catch (error: any) {
          if (controller.signal.aborted || error?.errno === ERR_ABORTED) return
          onWatchWebViewError(job.id, error instanceof Error ? error : new Error(String(error)))
        }
      })
      on<Electron.IpcMessageEvent>('ipc-message', (e) => {
        const data = e.args?.[0] as { id?: unknown; html?: unknown; rateLimited?: unknown; challenge?: unknown } | undefined
        if (e.channel !== 'watch-page' || typeof data?.id !== 'number') return
        onWatchWebViewMessage(data.id, typeof data.html === 'string' ? data.html : '', data.rateLimited === true, data.challenge === true)
      })
      on<Electron.DidFailLoadEvent>('did-fail-load', (e) => {
        if (!e.isMainFrame || e.errorCode === ERR_ABORTED || !started) return
        onWatchWebViewError(job.id, new Error(`page failed to load: ${e.errorDescription || e.errorCode}`))
      })
    },
    [job],
  )

  if (!job) {
    return null
  }

  return (
    <WatchWebViewFrame job={job}>
      <NoraView
        // A new view for each page, so nothing of the last one is left over.
        key={job.id}
        ref={ref}
        style={job.visible ? { flex: 1 } : { width: 1280, height: 900 }}
        partition={`persist:${job.profile || WATCH_WEBVIEW_PROFILE}`}
        // The desktop site, as Anonymous mode uses for Instagram: its profile page comes with its posts.
        useragent={getUserAgent(job.ownUserAgent ? window.electron.process.platform : 'win32', true)}
        src="about:blank"
      />
    </WatchWebViewFrame>
  )
}
