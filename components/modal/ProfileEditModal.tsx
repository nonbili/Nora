import { Pressable, TextInput, View } from 'react-native'
import { NouButton } from '../button/NouButton'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { settings$ } from '@/states/settings'
import { t } from 'i18next'
import { useEffect, useState } from 'react'
import { BaseCenterModal } from './BaseCenterModal'
import { ui$ } from '@/states/ui'

const profileColors = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
]

export const ProfileEditModal = () => {
  const profileModalOpen = useValue(ui$.profileModalOpen)
  const editingProfileId = useValue(ui$.editingProfileId)
  const profiles = useValue(settings$.profiles)

  const [name, setName] = useState('')
  const [color, setColor] = useState(profileColors[0])

  useEffect(() => {
    if (profileModalOpen) {
      if (editingProfileId) {
        const profile = profiles.find((p) => p.id === editingProfileId)
        if (profile) {
          setName(profile.name)
          setColor(profile.color)
        }
      } else {
        setName('')
        setColor(profileColors[0])
      }
    }
  }, [profileModalOpen, editingProfileId])

  const handleSave = () => {
    if (name.trim()) {
      if (editingProfileId) {
        settings$.updateProfile(editingProfileId, name.trim(), color)
      } else {
        settings$.addProfile(name.trim(), color)
      }
      onClose()
    }
  }

  const onClose = () => {
    ui$.assign({ profileModalOpen: false, editingProfileId: null })
  }

  const ColorPicker: React.FC<{ selected: string; onSelect: (c: string) => void }> = ({ selected, onSelect }) => (
    <View className="flex-row flex-wrap gap-2 mt-1">
      {profileColors.map((color) => (
        <Pressable key={color} onPress={() => onSelect(color)}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: color,
              borderWidth: selected === color ? 3 : 0,
              borderColor: 'white',
            }}
          />
        </Pressable>
      ))}
    </View>
  )

  if (!profileModalOpen) return null

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-4 w-full">
        <NouText className="text-lg font-bold mb-4">
          {editingProfileId ? t('profiles.edit') : t('profiles.add')}
        </NouText>
        <TextInput
          className="border border-gray-600 text-white px-3 py-2 rounded-md mb-2"
          value={name}
          onChangeText={setName}
          placeholder={t('profiles.namePlaceholder')}
          placeholderTextColor="#9ca3af"
          autoFocus
        />
        <ColorPicker selected={color} onSelect={setColor} />
        <View className="flex-row gap-4 mt-6">
          <NouButton className="flex-1" variant="outline" onPress={onClose}>
            {t('buttons.cancel')}
          </NouButton>
          <NouButton className="flex-1" onPress={handleSave}>
            {editingProfileId ? t('profiles.save') : t('profiles.add')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
