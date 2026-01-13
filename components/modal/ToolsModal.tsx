import { use$ } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useEffect, useState } from 'react'
import { BaseModal } from './BaseModal'
import { NouText } from '../NouText'
import { TextInput, View } from 'react-native'
import { gray } from '@radix-ui/colors'
import { NouButton } from '../button/NouButton'
import { t } from 'i18next'
import { isDownloadable } from '@/content/download'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { isWeb } from '@/lib/utils'

const canDownload = (url: string) => {
  let hostname, pathname
  try {
    ;({ hostname, pathname } = new URL(url))
  } catch (e) {
    return false
  }

  if (isDownloadable(url)) {
    return true
  }

  const slugs = pathname.split('/')
  switch (hostname) {
    case 'www.instagram.com':
      return slugs[1] == 'p'
    case 'x.com':
      return slugs[2] == 'status'
  }
  return false
}

export const ToolsModal = () => {
  const toolsModalOpen = use$(ui$.toolsModalOpen)
  const [url, setUrl] = useState('')
  const onClose = () => ui$.toolsModalOpen.set(false)

  useEffect(() => {
    setUrl('')
  }, [toolsModalOpen])

  const onDownload = () => {
    if (url.trim()) {
      if (isWeb) {
        mainClient.downloadVideo(url)
      } else {
        ui$.downloadVideoModalUrl.set(url)
      }
    }
  }

  if (!toolsModalOpen) {
    return null
  }

  return (
    <BaseModal onClose={onClose}>
      <View className="p-5">
        <NouText className="text-lg font-semibold mb-4">{t('modals.downloadVideo')}</NouText>
        <NouText className="mb-4 text-sm text-gray-200">Support Facebook, Instagram and X</NouText>
        <NouText className="mb-1 font-semibold text-gray-300">URL</NouText>
        <TextInput
          className="border border-gray-600 rounded mb-3 text-white p-2 text-sm"
          value={url}
          onChangeText={setUrl}
          placeholder="https://www.instagram.com/:user/reel/:id"
          placeholderTextColor={gray.gray11}
          autoFocus
        />
        <View className="flex-row items-center justify-end mt-6">
          <NouButton disabled={!canDownload(url.trim())} onPress={onDownload}>
            Download
          </NouButton>
        </View>
      </View>
    </BaseModal>
  )
}
