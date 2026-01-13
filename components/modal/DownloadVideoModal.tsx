import type { WebviewTag } from 'electron'
import { Text, View } from 'react-native'
import { NouText } from '../NouText'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { showToast } from '@/lib/toast'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NoraView } from '@/modules/nora-view'
import { tabs$ } from '@/states/tabs'
import { delay } from 'es-toolkit'
import { getUserAgent } from '@/lib/webview'
import { parseJson } from '@/content/utils'

const userAgent = getUserAgent()

export const DownloadVideoModal: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const currentUrl = useValue(ui$.downloadVideoModalUrl)
  const onClose = () => ui$.downloadVideoModalUrl.set('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const nativeRef = useRef<any>(null)
  const webviewRef = useRef<WebviewTag>(null)
  const parsingStartedRef = useRef(false)

  const downloadVideoModalOpen = !!currentUrl

  useEffect(() => {
    if (!downloadVideoModalOpen) {
      nativeRef.current = null
      webviewRef.current = null
      setTitle('Loading...')
      setUrl('')
      parsingStartedRef.current = false
    }
  }, [downloadVideoModalOpen])

  const noraViewRef = (webview: WebviewTag) => {
    console.log('- webview', webview)
    webviewRef.current = webview
    /* const webview = webviewRef.current
     * if (!webview) {
     *   return
     * } */

    webview.addEventListener('dom-ready', () => {
      console.log('-- dom-ready')
      webview.executeJavaScript(contentJs)
      webview.openDevTools()
    })

    webview.addEventListener('ipc-message', (e) => {
      onMessage(e.channel, e.args[0])
    })
  }
  /* }, [webviewRef.current]) */

  useEffect(() => {
    const webview = webviewRef.current
    const native = nativeRef.current
    let url
    if (currentUrl) {
      if (currentUrl.startsWith('https://m.facebook.com/reel/')) {
        const canonical = new URL(currentUrl)
        canonical.search = ''
        url = canonical.href
      } else {
        url = currentUrl
      }
      if (webview) {
        webview.src = url
      } else if (native) {
        native.loadUrl(url)
      }
    }
  }, [nativeRef, downloadVideoModalOpen])

  const webview = nativeRef.current || webviewRef.current

  useEffect(() => {
    if (url && !parsingStartedRef.current) {
      parsingStartedRef.current = true
      console.log('- getVideoUrl')
      webview?.executeJavaScript('window.Nora.getVideoUrl()')
    }
  }, [url])

  const onLoad = async (e: { nativeEvent: any }) => {
    //
  }

  const onMessage = useCallback(async (type: string, data: any) => {
    console.log('- onMessage', type, data)
    switch (type) {
      case '[content]':
      case '[kotlin]':
        console.log(type, data)
        break
      case 'onload':
        webview?.executeJavaScript('window.Nora.getVideoUrl()')
        /* setTitle('Parsing...')
           const value = e.nativeEvent.url
           if (value) {
           setUrl(value)
           } */
        break
      case 'download':
        setTitle('Downloading...')
        webview?.download(data.url, data.fileName)
        await delay(500)
        onClose()
        break
      case 'video-not-found':
        setTitle('Failed to find video url')
        break
    }
  }, [])

  const onNativeMessage = async (e: { nativeEvent: { payload: string | object } }) => {
    const { payload } = e.nativeEvent
    const { type, data } = typeof payload == 'string' ? JSON.parse(payload) : payload
    onMessage(type, data)
  }

  if (!downloadVideoModalOpen) {
    return null
  }

  const noraView = isWeb ? (
    <NoraView
      ref={noraViewRef}
      className="bg-white"
      style={{ flex: 1 }}
      partition="persist:webview"
      useragent={userAgent}
    />
  ) : (
    <NoraView
      ref={nativeRef}
      className="bg-white"
      style={{ flex: 1 }}
      scriptOnStart={contentJs}
      useragent={userAgent}
      onLoad={onLoad}
      onMessage={onNativeMessage}
    />
  )

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="py-6 px-4 h-[400px]">
        <NouText className="text-lg font-semibold mb-4">{title}</NouText>
        <View className="flex-1 bg-gray-800">{noraView}</View>
      </View>
    </BaseCenterModal>
  )
}
