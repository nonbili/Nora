import { use$ } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { BaseCenterModal } from './BaseCenterModal'
import { NouText } from '../NouText'
import { TextInput, View } from 'react-native'
import { useEffect, useState } from 'react'
import { gray } from '@radix-ui/colors'
import { NouButton } from '../button/NouButton'
import { openSharedUrl } from '@/lib/page'
import { t } from 'i18next'

export const UrlModal = () => {
  const urlModalOpen = use$(ui$.urlModalOpen)
  const [url, setUrl] = useState('')
  const onClose = () => ui$.urlModalOpen.set(false)

  useEffect(() => {
    setUrl('')
  }, [urlModalOpen])

  const onSubmit = () => {
    if (!url.trim()) {
      return
    }
    const _url = url.includes('://') ? url : `https://${url}`
    openSharedUrl(_url, true)
    onClose()
    ui$.settingsModalOpen.set(false)
  }

  if (!urlModalOpen) {
    return null
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-5">
        <NouText className="text-lg font-semibold mb-4">{t('buttons.openUrl')}</NouText>
        <NouText className="mb-1 font-semibold text-gray-300">URL</NouText>
        <TextInput
          className="border border-gray-600 rounded mb-3 text-white p-2 text-sm"
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={() => onSubmit()}
          placeholder="https://example.com"
          placeholderTextColor={gray.gray11}
          autoFocus
        />
        <View className="flex-row items-center justify-between mt-6">
          <NouButton variant="outline" size="1" onPress={onClose}>
            {t('buttons.cancel')}
          </NouButton>
          <NouButton onPress={onSubmit}>{t('buttons.open')}</NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
