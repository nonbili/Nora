import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { BaseCenterModal } from './BaseCenterModal'
import { NouText } from '../NouText'
import { TextInput, View } from 'react-native'
import { useEffect, useState } from 'react'
import { gray } from '@radix-ui/colors'
import { NouButton } from '../button/NouButton'
import { openSharedUrl } from '@/lib/page'
import { t } from 'i18next'
import { tabs$ } from '@/states/tabs'
import { resolveUrlInput } from '@/lib/search'

export const UrlModal = () => {
  const urlModalOpen = useValue(ui$.urlModalOpen)
  const urlModalMode = useValue(ui$.urlModalMode)
  const urlModalTargetTabId = useValue(ui$.urlModalTargetTabId)
  const tabs = useValue(tabs$.tabs)
  const [url, setUrl] = useState('')
  const targetTabIndex = tabs.findIndex((tab) => tab.id === urlModalTargetTabId)
  const targetTab = targetTabIndex === -1 ? null : tabs[targetTabIndex]
  const isEditingTab = urlModalMode === 'editTab' && targetTab != null
  const onClose = () => {
    ui$.assign({
      urlModalOpen: false,
      urlModalMode: 'open',
      urlModalTargetTabId: null,
    })
  }

  useEffect(() => {
    if (!urlModalOpen) {
      setUrl('')
      return
    }

    setUrl(isEditingTab ? targetTab.url || '' : '')
  }, [isEditingTab, targetTab?.url, urlModalOpen])

  const onSubmit = () => {
    const nextUrl = resolveUrlInput(url)
    if (!nextUrl) {
      return
    }

    if (isEditingTab && targetTabIndex !== -1) {
      tabs$.updateTabUrl(nextUrl, targetTabIndex)
    } else {
      openSharedUrl(nextUrl, true)
      ui$.settingsModalOpen.set(false)
    }

    onClose()
  }

  if (!urlModalOpen) {
    return null
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-5">
        <NouText className="text-lg font-semibold mb-4">{t(isEditingTab ? 'menus.editUrl' : 'buttons.openUrl')}</NouText>
        <NouText className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">URL</NouText>
        <TextInput
          className="border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded mb-3 text-zinc-900 dark:text-zinc-100 p-2 text-sm"
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
          <NouButton onPress={onSubmit}>{t(isEditingTab ? 'buttons.save' : 'buttons.open')}</NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
