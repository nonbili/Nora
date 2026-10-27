import { useEffect, useRef } from 'react'
import { useValue } from '@legendapp/state/react'
import { NoraView } from '@/modules/nora-view'
import { getUserAgent } from '@/lib/useragent'
import { isIos } from '@/lib/utils'
import {
  WATCH_WEBVIEW_PROFILE,
  buildWatchPageScript,
  onWatchWebViewError,
  onWatchWebViewMessage,
  watchWebView$,
} from '@/lib/watch-webview'
import { WatchWebViewFrame } from './WatchWebViewFrame'

const LOAD_URL_RETRY_DELAY = 100
const LOAD_URL_MAX_RETRIES = 20

/** The webview that reads a watched profile's page, out of sight but for a check to pass; there only while it has a page to read. */
export const WatchWebViewHost = () => {
  const job = useValue(watchWebView$.job)
  const nativeRef = useRef<any>(null)

  useEffect(() => {
    watchWebView$.hostMounted.set(true)
    return () => watchWebView$.hostMounted.set(false)
  }, [])

  // As in a tab: the native view can take a moment to be ready for its first page.
  useEffect(() => {
    if (!job) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const attempt = (retriesLeft: number) => {
      timer = null
      if (cancelled) return
      const native = nativeRef.current
      const retry = () => {
        if (retriesLeft > 0) {
          timer = setTimeout(() => attempt(retriesLeft - 1), LOAD_URL_RETRY_DELAY)
        } else {
          onWatchWebViewError(job.id, new Error('webview not ready'))
        }
      }
      if (!native) {
        retry()
        return
      }
      void Promise.resolve(native.loadUrl(job.url)).catch((error) => {
        if (cancelled) return
        if (error?.code === 'ERR_VIEW_NOT_FOUND') retry()
        else onWatchWebViewError(job.id, error instanceof Error ? error : new Error(String(error)))
      })
    }
    timer = setTimeout(() => attempt(LOAD_URL_MAX_RETRIES), 0)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [job])

  if (!job) {
    return null
  }

  const onMessage = (e: { nativeEvent: { payload: string | object } }) => {
    let message: any
    try {
      const { payload } = e.nativeEvent
      message = typeof payload === 'string' ? JSON.parse(payload) : payload
    } catch {
      return
    }
    if (message?.type === 'watch-page' && typeof message.data?.id === 'number') {
      onWatchWebViewMessage(
        message.data.id,
        typeof message.data.html === 'string' ? message.data.html : '',
        message.data.rateLimited === true,
        message.data.challenge === true,
      )
    }
  }

  return (
    <WatchWebViewFrame job={job}>
      <NoraView
        // A new view for each page, so nothing of the last one is left over.
        key={job.id}
        ref={nativeRef}
        style={{ flex: 1 }}
        profile={job.profile || WATCH_WEBVIEW_PROFILE}
        // The desktop site, as Anonymous mode uses for Instagram: its profile page comes with its posts.
        useragent={job.ownUserAgent ? getUserAgent(isIos ? 'ios' : 'android') : getUserAgent('win32', true)}
        // Before the page's own scripts, so the answers it asks for as it loads are kept too.
        scriptOnDocumentStart={buildWatchPageScript(job.id, job.marker, job.more, job.until, job.selector)}
        onMessage={onMessage}
        active
        visible
      />
    </WatchWebViewFrame>
  )
}
