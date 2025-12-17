import { Text, View } from 'react-native'
import { NouText } from '../NouText'
import { useEffect, useRef, useState } from 'react'
import { clsx, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { showToast } from '@/lib/toast'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NoraView } from '@/modules/nora-view'
import { tabs$ } from '@/states/tabs'
import { delay } from 'es-toolkit'
import { getUserAgent } from '@/lib/webview'

const userAgent = getUserAgent()

export const DownloadVideoModal: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const downloadVideoModalOpen = useValue(ui$.downloadVideoModalOpen)
  const onClose = () => ui$.downloadVideoModalOpen.set(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const nativeRef = useRef<any>(null)
  const parsingStartedRef = useRef(false)

  useEffect(() => {
    if (!downloadVideoModalOpen) {
      nativeRef.current = null
      setTitle('Loading...')
      setUrl('')
      parsingStartedRef.current = false
    }
  }, [downloadVideoModalOpen])

  useEffect(() => {
    const webview = nativeRef.current
    const currentUrl = tabs$.currentTab()?.url
    if (webview && currentUrl) {
      if (currentUrl.startsWith('https://m.facebook.com/reel/')) {
        const canonical = new URL(currentUrl)
        canonical.search = ''
        webview.loadUrl(canonical.href)
      } else {
        webview.loadUrl(currentUrl)
      }
    }
  }, [nativeRef, downloadVideoModalOpen])

  const webview = nativeRef.current

  useEffect(() => {
    if (url && !parsingStartedRef.current) {
      parsingStartedRef.current = true
      webview?.executeJavaScript('window.Nora.getVideoUrl()')
    }
  }, [url])

  if (!downloadVideoModalOpen) {
    return null
  }

  const onLoad = async (e: { nativeEvent: any }) => {
    setTitle('Parsing...')
    const value = e.nativeEvent.url
    if (value) {
      setUrl(value)
    }
  }

  const onMessage = async (e: { nativeEvent: { payload: string } }) => {
    const { type, data } = JSON.parse(e.nativeEvent.payload)
    switch (type) {
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
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="py-6 px-4 h-[400px]">
        <NouText className="text-lg font-semibold mb-4">{title}</NouText>
        <View className="flex-1 bg-gray-800">
          <NoraView
            ref={nativeRef}
            className="bg-white"
            style={{ flex: 1 }}
            scriptOnStart={contentJs}
            useragent={userAgent}
            onLoad={onLoad}
            onMessage={onMessage}
          />
        </View>
      </View>
    </BaseCenterModal>
  )
}
