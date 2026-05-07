import { Modal, Pressable, View } from 'react-native'
import { NouText } from '../NouText'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx, isIos } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { NouButton } from '../button/NouButton'
import { NoraView } from '@/modules/nora-view'
import { settings$ } from '@/states/settings'
import { delay } from 'es-toolkit'
import { getUserAgent } from '@/lib/useragent'
import { executeWebviewJavaScriptQuietly } from '@/lib/webview'
import { normalizeDownloadUrl } from '@/content/download'

const userAgent = getUserAgent(isIos ? 'ios' : 'android')

type DownloadOption = {
  description: string
  label: string
  url: string
}

type DownloadWebview = {
  loadUrl: (url: string) => Promise<unknown> | unknown
  download: (url: string, fileName?: string) => Promise<unknown> | unknown
  saveFile: (content: string, fileName: string, mimeType?: string) => Promise<unknown> | unknown
  executeJavaScript?: (script: string) => Promise<unknown> | unknown
}

export const DownloadVideoModal: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const currentUrl = useValue(ui$.downloadVideoModalUrl)
  const inspectable = useValue(settings$.inspectable)
  const onClose = () => ui$.downloadVideoModalUrl.set('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [downloadOptions, setDownloadOptions] = useState<DownloadOption[]>([])
  const [fileName, setFileName] = useState('')
  const nativeRef = useRef<DownloadWebview | null>(null)
  const parsingStartedRef = useRef(false)
  const loadRequestRef = useRef(0)

  const downloadVideoModalOpen = !!currentUrl

  const loadDownloadUrl = useCallback(
    (webview: DownloadWebview, targetUrl: string) => {
      const url = normalizeDownloadUrl(targetUrl)
      if (!url) {
        return
      }

      const requestId = ++loadRequestRef.current
      const timer = setTimeout(() => {
        if (nativeRef.current !== webview || loadRequestRef.current !== requestId || !ui$.downloadVideoModalUrl.peek()) {
          return
        }

        void Promise.resolve(webview.loadUrl(url)).catch((error) => {
          if (nativeRef.current !== webview) {
            return
          }
          console.warn('[DownloadVideoModal] loadUrl failed', error)
        })
      }, 0)

      return () => clearTimeout(timer)
    },
    [],
  )

  useEffect(() => {
    if (!downloadVideoModalOpen) {
      loadRequestRef.current += 1
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
      return loadDownloadUrl(webview, currentUrl)
    }
  }, [currentUrl, downloadVideoModalOpen, loadDownloadUrl])

  const setWebviewRef = useCallback(
    (webview: DownloadWebview | null) => {
      nativeRef.current = webview
      if (webview && currentUrl) {
        loadDownloadUrl(webview, currentUrl)
      }
    },
    [currentUrl, loadDownloadUrl],
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
