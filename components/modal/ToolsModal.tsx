import { use$ } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useEffect, useState } from 'react'
import { BaseModal } from './BaseModal'
import { NouText } from '../NouText'
import { TextInput, View, useColorScheme } from 'react-native'
import { gray } from '@radix-ui/colors'
import { NouButton } from '../button/NouButton'
import { t } from 'i18next'
import { isDownloadable, normalizeDownloadUrl } from '@/content/download'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { isIos, isWeb, nIf } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'

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
    case 'm.facebook.com':
    case 'www.facebook.com':
      return slugs[1] == 'share'
    case 'www.instagram.com':
      return slugs[1] == 'p'
    case 'x.com':
      return slugs[2] == 'status'
  }
  return false
}

export const ToolsModal = () => {
  const toolsModalOpen = use$(ui$.toolsModalOpen)
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  const [url, setUrl] = useState('')
  const [cobaltUrl, setCobaltUrl] = useState('')
  const onClose = () => ui$.toolsModalOpen.set(false)

  useEffect(() => {
    setUrl('')
    setCobaltUrl('')
  }, [toolsModalOpen])

  const onDownload = () => {
    const normalizedUrl = normalizeDownloadUrl(url.trim())
    if (!normalizedUrl) {
      return
    }
    if (isWeb) {
      mainClient.downloadVideo(normalizedUrl)
      return
    }
    ui$.downloadVideoModalUrl.set(normalizedUrl)
  }

  const onOpenCobalt = () => {
    const trimmed = cobaltUrl.trim()
    const target = trimmed
      ? `https://cobalt.tools/?u=${encodeURIComponent(trimmed)}`
      : 'https://cobalt.tools/'
    tabs$.openTab(target)
    onClose()
  }

  if (isIos || !toolsModalOpen) {
    return null
  }

  return (
    <BaseModal onClose={onClose} useNativeModal={false}>
      <View className="p-5">
        {nIf(
          !isIos,
          <>
            <NouText className="text-lg font-semibold mb-4">{t('modals.downloadVideo')}</NouText>
            <NouText className="mb-4 text-sm text-zinc-600 dark:text-gray-200">Support Facebook, Instagram, TikTok and X</NouText>
            <NouText className="mb-1 font-semibold text-zinc-700 dark:text-gray-300">URL</NouText>
            <TextInput
              className="border border-zinc-300 dark:border-gray-600 rounded mb-3 text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-900 p-2 text-sm"
              value={url}
              onChangeText={setUrl}
              placeholder="https://www.instagram.com/:user/reel/:id"
              placeholderTextColor={isDark ? gray.gray11 : '#52525b'}
              autoFocus
            />
            <View className="flex-row items-center justify-end mt-6">
              <NouButton disabled={!canDownload(url.trim())} onPress={onDownload}>
                Download
              </NouButton>
            </View>
          </>,
        )}

        <View className={isIos ? '' : 'border-t border-zinc-200 dark:border-gray-700 mt-6 pt-5'}>
          <NouText className="text-lg font-semibold mb-4">{t('modals.downloadOnCobalt')}</NouText>
          <NouText className="mb-1 font-semibold text-zinc-700 dark:text-gray-300">URL</NouText>
          <TextInput
            className="border border-zinc-300 dark:border-gray-600 rounded mb-3 text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-900 p-2 text-sm"
            value={cobaltUrl}
            onChangeText={setCobaltUrl}
            placeholder="post or reel url"
            placeholderTextColor={isDark ? gray.gray11 : '#52525b'}
          />
          <View className="flex-row items-center justify-end mt-6">
            <NouButton onPress={onOpenCobalt}>Open</NouButton>
          </View>
        </View>
      </View>
    </BaseModal>
  )
}
