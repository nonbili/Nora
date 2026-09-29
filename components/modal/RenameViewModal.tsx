import { useEffect, useState } from 'react'
import { TextInput, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { t } from 'i18next'
import { savedViews$ } from '@/states/saved-views'
import { ui$ } from '@/states/ui'
import { useTwColor } from '@/lib/theme'

export const RenameViewModal = () => {
  const tw = useTwColor()
  const targetViewId = useValue(ui$.renameViewModalTargetViewId)
  const savedViews = useValue(savedViews$.savedViews)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    if (!targetViewId) {
      setDraftName('')
      return
    }
    const view = savedViews.find((v) => v.id === targetViewId)
    setDraftName(view?.name || '')
  }, [targetViewId, savedViews])

  const onClose = () => {
    ui$.renameViewModalTargetViewId.set(null)
  }

  if (!targetViewId) {
    return null
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-4 w-full">
        <NouText className="text-lg font-bold mb-4">{t('views.rename')}</NouText>
        <TextInput
          className="border border-zinc-700 text-white px-3 py-2 rounded-md mb-2 bg-zinc-900"
          value={draftName}
          onChangeText={setDraftName}
          placeholder={t('views.namePlaceholder')}
          placeholderTextColor={tw('#9ca3af')}
          autoFocus
        />
        <View className="flex-row justify-end gap-3 mt-6">
          <NouButton size="1" variant="outline" onPress={onClose}>
            {t('buttons.cancel')}
          </NouButton>
          <NouButton
            size="1"
            disabled={!draftName.trim()}
            onPress={() => {
              savedViews$.renameView(targetViewId, draftName)
              onClose()
            }}
          >
            {t('buttons.save')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
