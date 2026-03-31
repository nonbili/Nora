import { Modal, Pressable, Text, View } from 'react-native'
import { NouText } from '../NouText'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx, isIos, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { showToast } from '@/lib/toast'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NoraView } from '@/modules/nora-view'
import { tabs$ } from '@/states/tabs'
import { settings$ } from '@/states/settings'
import { delay } from 'es-toolkit'
import { getUserAgent } from '@/lib/useragent'
import { parseJson } from '@/content/utils'
import { executeWebviewJavaScriptQuietly } from '@/lib/webview'
import { normalizeDownloadUrl } from '@/content/download'

const userAgent = getUserAgent(isIos ? 'ios' : 'android')

type DownloadOption = {
  description: string
  label: string
  url: string
}

export const DownloadVideoModal: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const currentUrl = useValue(ui$.downloadVideoModalUrl)
  const inspectable = useValue(settings$.inspectable)
  const onClose = () => ui$.downloadVideoModalUrl.set('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [downloadOptions, setDownloadOptions] = useState<DownloadOption[]>([])
  const [fileName, setFileName] = useState('')
  const nativeRef = useRef<any>(null)
  const parsingStartedRef = useRef(false)

  const downloadVideoModalOpen = !!currentUrl

  useEffect(() => {
    if (!downloadVideoModalOpen) {
      nativeRef.current = null
      setTitle('Loading...')
      setUrl('')
      setFileName('')
      setDownloadOptions([])
      parsingStartedRef.current = false
    }
  }, [downloadVideoModalOpen])

  useEffect(() => {
    const webview = nativeRef.current
    if (webview && currentUrl) {
      webview.loadUrl(normalizeDownloadUrl(currentUrl))
    }
  }, [currentUrl, downloadVideoModalOpen])

  const setWebviewRef = useCallback(
    (webview: any) => {
      nativeRef.current = webview
      if (webview && currentUrl) {
        webview.loadUrl(normalizeDownloadUrl(currentUrl))
      }
    },
    [currentUrl],
  )

  if (!downloadVideoModalOpen) {
    return null
  }

  const onLoad = async (e: { nativeEvent: any }) => {
    setTitle('Parsing...')
    const value = e.nativeEvent.url
    if (value) {
      setUrl(value)
    }
    const webview = nativeRef.current
    if (!parsingStartedRef.current && webview) {
      parsingStartedRef.current = true
      void executeWebviewJavaScriptQuietly(webview, 'window.Nora.getVideoUrl()')
    }
  }

  const onMessage = async (e: { nativeEvent: { payload: string | object } }) => {
    const { payload } = e.nativeEvent
    const { type, data } = typeof payload == 'string' ? JSON.parse(payload) : payload
    switch (type) {
      case '[content]':
      case '[kotlin]':
        console.log(type, data)
        break
      case 'onload':
        if (url && !parsingStartedRef.current) {
          const webview = nativeRef.current
          parsingStartedRef.current = true
          void executeWebviewJavaScriptQuietly(webview, 'window.Nora.getVideoUrl()')
        }
        break
      case 'download':
        setTitle('Downloading...')
        nativeRef.current?.download(data.url, data.fileName)
        await delay(500)
        onClose()
        break
      case 'save-file':
        setTitle('Downloading...')
        nativeRef.current?.saveFile(data.content, data.fileName, data.mimeType || 'video/mp4')
        await delay(500)
        onClose()
        break
      case 'download-options':
        setFileName(data.fileName || '')
        setDownloadOptions(data.options || [])
        setTitle('Choose download quality')
        break
      case 'video-not-found':
        setTitle('Failed to find video url')
        break
    }
  }

  return (
    <Modal transparent visible onRequestClose={onClose}>
      <View className={clsx('flex-1 items-center justify-center')}>
        <Pressable className="absolute inset-0 bg-gray-600/80" onPress={onClose} />
        <View className="rounded-lg bg-gray-950 py-6 px-4 w-screen h-[75%]">
          <NouText className="text-lg font-semibold mb-4">{title}</NouText>
          <View className="flex-1">
            <View className={clsx('flex-1', downloadOptions.length && 'hidden')}>
              <NoraView
                ref={setWebviewRef}
                className="bg-white"
                style={{ flex: 1 }}
                scriptOnStart={contentJs}
                useragent={userAgent}
                onLoad={onLoad}
                onMessage={onMessage}
                inspectable={inspectable}
              />
            </View>
            {downloadOptions.length ? (
              <View className="gap-3">
                {downloadOptions.map((option) => (
                  <View key={option.label} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 gap-3">
                    <View className="gap-1">
                      <NouText className="font-semibold">{option.label}</NouText>
                      <NouText className="text-sm text-zinc-400">{option.description}</NouText>
                    </View>
                    <NouButton
                      onPress={async () => {
                        setTitle('Downloading...')
                        nativeRef.current?.download(option.url, fileName || undefined)
                        await delay(500)
                        onClose()
                      }}
                    >
                      Download
                    </NouButton>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  )
}
