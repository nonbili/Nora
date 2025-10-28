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
import { useEffect, useState } from 'react'
import { colors } from '@/lib/colors'
import { clsx, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { ui$ } from '@/states/ui'
import { showToast } from '@/lib/toast'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { getMeta } from '@/lib/bookmark'
import { bookmarks$ } from '@/states/bookmarks'
import { Image } from 'expo-image'

const repo = 'https://github.com/nonbili/Nora'
const tabs = ['Settings', 'About']
const themes = [null, 'dark', 'light'] as const

export const BookmarkModal = () => {
  const bookmarkModalOpen = useValue(ui$.bookmarkModalOpen)
  const onClose = () => ui$.bookmarkModalOpen.set(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('')
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!bookmarkModalOpen) {
      setStep(0)
      setUrl('')
      setTitle('')
      setLoading(false)
    }
  }, [bookmarkModalOpen])

  if (!bookmarkModalOpen) {
    return null
  }

  const _onSubmit = async () => {
    if (step == 0) {
      setLoading(true)
      const { title, icon } = await getMeta(url)
      setTitle(title || '')
      setIcon(icon || '')
      setStep(1)
      setLoading(false)
      return
    }

    bookmarks$.addBookmark({ url, title, icon })
    onClose()
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="py-6 px-4">
        <NouText className="text-lg font-semibold mb-4">Add bookmark</NouText>
        <NouText className="mb-6">Pin a website to the left side panel</NouText>
        <NouText className="mb-1">URL</NouText>
        <TextInput
          className="border border-gray-600 mb-4 text-white px-2"
          value={url}
          onChangeText={setUrl}
          readOnly={step == 1}
          placeholder="https://example.com"
          placeholderTextColor="#777"
        />
        {nIf(
          step == 1,
          <>
            <NouText className="mb-1">Title</NouText>
            <TextInput className="border border-gray-600 mb-4 text-white px-2" value={title} onChangeText={setTitle} />
            <Image source={icon} style={{ width: 24, height: 24 }} />
          </>,
        )}
        <NouButton className="mt-6" loading={loading} disabled={!url.trim()} onPress={_onSubmit}>
          {step == 0 ? 'Next' : 'Submit'}
        </NouButton>
      </View>
    </BaseCenterModal>
  )
}
