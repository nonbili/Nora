import { useEffect, useState } from 'react'
import { TextInput, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { tabGroups$ } from '@/states/tab-groups'
import { ui$ } from '@/states/ui'

export const RenameGroupModal = () => {
  const targetGroupId = useValue(ui$.renameGroupModalTargetGroupId)
  const groups = useValue(tabGroups$.groups)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    if (!targetGroupId) {
      setDraftName('')
      return
    }
    const group = groups.find((currentGroup) => currentGroup.id === targetGroupId)
    setDraftName(group?.name || '')
  }, [targetGroupId, groups])

  const onClose = () => {
    ui$.renameGroupModalTargetGroupId.set(null)
  }

  if (!targetGroupId) {
    return null
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-4 w-full">
        <NouText className="text-lg font-bold mb-4">{t('views.desktop.renameGroup')}</NouText>
        <TextInput
          className="border border-zinc-700 text-white px-3 py-2 rounded-md mb-2 bg-zinc-900"
          value={draftName}
          onChangeText={setDraftName}
          placeholder={t('views.desktop.groupNamePlaceholder')}
          placeholderTextColor="#9ca3af"
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
              tabGroups$.renameGroup(targetGroupId, draftName)
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
