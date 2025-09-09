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
import { NouLink } from '../NouLink'
import { version } from '../../package.json'
import { useState } from 'react'
import { colors } from '@/lib/colors'
import { clsx } from '@/lib/utils'
import { use$ } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { ui$ } from '@/states/ui'

const repo = 'https://github.com/nonbili/Nora'
const tabs = ['Settings', 'About']
const themes = [null, 'dark', 'light'] as const

export const CookieModal = () => {
  const cookieModalOpen = use$(ui$.cookieModalOpen)
  const onClose = () => ui$.cookieModalOpen.set(false)
  const [text, setText] = useState('')

  if (!cookieModalOpen) {
    return null
  }

  const _onSubmit = () => {
    const cookie = text.trim()
    if (!cookie) {
      ToastAndroid.show('Invalid cookie', ToastAndroid.SHORT)
    } else {
      const webview = ui$.webview.get()
      cookie
        .split(';')
        .forEach((x) => webview?.eval(`document.cookie="${x.trim()};max-age=31536000"; document.location.reload()`))
      onClose()
      setText('')
    }
  }

  return (
    <Modal animationType="slide" transparent={true} visible={true} onRequestClose={onClose}>
      <View className="flex-1 bg-[#222] py-6 px-4">
        <View className="flex-1">
          <NouText className="text-lg font-semibold mb-4">Inject auth cookie into the webview</NouText>
          <NouText className="mb-6 text-slate-200 leading-[20px]">
            Copy the Cookie header value from your PC browser. This is a workaround when you couldn't login with
            email/password.
          </NouText>
          <TextInput
            className="border border-gray-600 mb-4 text-white"
            value={text}
            onChangeText={setText}
            placeholder="auth_token=xxx"
            placeholderTextColor="#777"
          />
          <TouchableOpacity onPress={_onSubmit}>
            <NouText className="py-2 px-6 text-center bg-indigo-600 rounded-full">Submit</NouText>
          </TouchableOpacity>
        </View>
        <View className="items-center mt-12">
          <TouchableOpacity onPress={onClose}>
            <NouText className="py-2 px-6 text-center bg-gray-700 rounded-full">Close</NouText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
