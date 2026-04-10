import * as React from 'react'
import { NoraViewProps } from './NoraView.types'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'electrobun-webview': any
    }
  }
}

type ElectrobunWebviewElement = HTMLElement & {
  src?: string | null
  partition?: string | null
  canGoBack?: () => Promise<boolean>
  goBack?: () => void
  reload?: () => void
  loadURL?: (url: string) => void
  executeJavascript?: (code: string) => void
  on?: (event: string, listener: (event: CustomEvent) => void) => void
  off?: (event: string, listener: (event: CustomEvent) => void) => void
}

const eventNameMap: Record<string, string | null> = {
  'dom-ready': 'dom-ready',
  'did-start-loading': 'load-started',
  'did-stop-loading': 'load-finished',
  'did-fail-load': null,
  'did-fail-provisional-load': null,
  'did-navigate': 'did-navigate',
  'did-navigate-in-page': 'did-navigate-in-page',
  'page-favicon-updated': null,
  'ipc-message': 'host-message',
}

const downloadFile = (content: string, fileName: string, mimeType?: string) => {
  const link = document.createElement('a')
  link.href = content
  link.download = fileName
  if (!content.startsWith('data:')) {
    link.href = `data:${mimeType || 'application/octet-stream'};base64,${content}`
  }
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const NoraView = React.forwardRef((props: NoraViewProps, forwardedRef) => {
  const { src, partition, onLoad, onMessage, ...rest } = props
  const internalRef = React.useRef<ElectrobunWebviewElement | null>(null)
  const listenerMapRef = React.useRef(new Map<Function, { eventName: string; wrapped: (event: CustomEvent) => void }>())
  const titleRef = React.useRef('')
  const urlRef = React.useRef(src || '')

  React.useImperativeHandle(forwardedRef, () => ({
    addEventListener: (eventName: string, listener: (event: any) => void) => {
      const webview = internalRef.current
      const mappedEventName = eventNameMap[eventName]
      if (!webview || !mappedEventName) {
        return
      }

      const wrapped = (event: CustomEvent) => {
        const detail = event.detail
        const normalized =
          eventName === 'ipc-message'
            ? { channel: 'channel:content', args: [detail], data: detail }
            : typeof detail === 'string'
              ? { url: detail }
              : (detail ?? {})

        listener(normalized)
      }

      listenerMapRef.current.set(listener, { eventName: mappedEventName, wrapped })
      webview.on?.(mappedEventName, wrapped)
    },
    removeEventListener: (_eventName: string, listener: (event: any) => void) => {
      const webview = internalRef.current
      const registered = listenerMapRef.current.get(listener)
      if (!webview || !registered) {
        return
      }

      webview.off?.(registered.eventName, registered.wrapped)
      listenerMapRef.current.delete(listener)
    },
    canGoBack: async () => {
      return (await internalRef.current?.canGoBack?.()) ?? false
    },
    goBack: () => internalRef.current?.goBack?.(),
    reload: () => internalRef.current?.reload?.(),
    loadUrl: (url: string) => internalRef.current?.loadURL?.(url),
    loadURL: (url: string) => internalRef.current?.loadURL?.(url),
    executeJavaScript: (code: string) => internalRef.current?.executeJavascript?.(code),
    getTitle: () => titleRef.current,
    getURL: () => urlRef.current,
    saveFile: (content: string, fileName: string, mimeType?: string) => downloadFile(content, fileName, mimeType),
  }))

  React.useEffect(() => {
    const webview = internalRef.current
    if (!webview) return

    const handleDidNavigate = (event: CustomEvent) => {
      const url = typeof event.detail === 'string' ? event.detail : src
      if (url) {
        urlRef.current = url
      }

      onLoad?.({
        nativeEvent: {
          url: url || undefined,
          canGoBack: false,
          title: titleRef.current,
        },
      })
    }

    const handleHostMessage = (event: CustomEvent) => {
      onMessage?.({ nativeEvent: { payload: JSON.stringify(event.detail) } })
    }

    webview.on?.('did-navigate', handleDidNavigate)
    webview.on?.('did-navigate-in-page', handleDidNavigate)
    webview.on?.('host-message', handleHostMessage)

    return () => {
      webview.off?.('did-navigate', handleDidNavigate)
      webview.off?.('did-navigate-in-page', handleDidNavigate)
      webview.off?.('host-message', handleHostMessage)
    }
  }, [onLoad, onMessage, src])

  return <electrobun-webview ref={internalRef} src={src} partition={partition} {...rest} />
})

export default NoraView
