import {
  Button,
  Modal,
  Text,
  Pressable,
  View,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ToastAndroid,
} from 'react-native'
import { NouText } from '../NouText'
import { version } from '../../package.json'
import { useEffect, useRef, useState } from 'react'
import { colors } from '@/lib/colors'
import { clsx, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { ui$ } from '@/states/ui'
import { showToast } from '@/lib/toast'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { Image } from 'expo-image'
import { NoraView } from '@/modules/nora-view'
import { Asset } from 'expo-asset'
import { tabs$ } from '@/states/tabs'

const repo = 'https://github.com/nonbili/Nora'
const tabs = ['Settings', 'About']
const themes = [null, 'dark', 'light'] as const

export const DownloadVideoModal: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const downloadVideoModalOpen = useValue(ui$.downloadVideoModalOpen)
  const onClose = () => ui$.downloadVideoModalOpen.set(false)
  /* const [url, setUrl] = useState('') */
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  /* const [scriptOnStart, setScriptOnStart] = useState('') */
  const nativeRef = useRef<any>(null)

  useEffect(() => {
    if (!downloadVideoModalOpen) {
      nativeRef.current = null
      setTitle('Loading...')
    }
  }, [downloadVideoModalOpen])
  /* useEffect(() => {
   *   ;(async () => {
   *     const [{ localUri }] = await Asset.loadAsync(require('../../assets/scripts/main.bjs'))
   *     if (localUri) {
   *       const res = await fetch(localUri)
   *       const content = await res.text()
   *       setScriptOnStart(content)
   *     }
   *   })()
   * }, []) */

  useEffect(() => {
    console.log('- useEffect nativeRef')
    const webview = nativeRef.current
    const url = tabs$.currentUrl()
    console.log('- modal', url)
    if (webview && url) {
      webview.loadUrl(url)
      /* webview.loadUrl('https://bsky.app') */
    }
  }, [nativeRef, downloadVideoModalOpen])

  if (!downloadVideoModalOpen) {
    return null
  }

  const webview = nativeRef.current

  const onLoad = async (e: { nativeEvent: any }) => {
    setTitle('Parsing...')
    //
    console.log('- m onload', e.nativeEvent)
    webview?.executeJavaScript('window.Nora.getVideoUrl()')
  }

  const onMessage = async (e: { nativeEvent: { payload: string } }) => {
    const { type, data } = JSON.parse(e.nativeEvent.payload)
    console.log('- m message', type, data)
    switch (type) {
      case 'download':
        webview?.download(data.url, data.filename)
        break
    }
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="py-6 px-4 h-[400px]">
        <NouText className="text-lg font-semibold mb-4">{title}</NouText>
        <View className="flex-1 bg-gray-800">
          <NoraView
            // @ts-expect-error ??
            ref={nativeRef}
            className="bg-white"
            style={{ flex: 1 }}
            scriptOnStart={contentJs}
            onLoad={onLoad}
            onMessage={onMessage}
          />
        </View>
      </View>
    </BaseCenterModal>
  )
}
