import { Pressable, TextInput, View } from 'react-native'
import { NouButton } from '../button/NouButton'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { settings$ } from '@/states/settings'
import { t } from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { BaseCenterModal } from './BaseCenterModal'
import { ui$ } from '@/states/ui'
import MaterialIcons from '@react-native-vector-icons/material-icons'

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
  const savingRef = useRef(false)

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
    const trimmedName = name.trim()
    if (!trimmedName || savingRef.current) {
      return
    }

    savingRef.current = true
    if (editingProfileId) {
      settings$.updateProfile(editingProfileId, trimmedName, color)
    } else {
      settings$.addProfile(trimmedName, color)
    }
    onClose()
  }

  const onClose = () => {
    savingRef.current = false
    ui$.assign({
      profileModalOpen: false,
      editingProfileId: null,
    })
  }

  const ColorPicker: React.FC<{ selected: string; onSelect: (c: string) => void }> = ({ selected, onSelect }) => (
    <View className="flex-row flex-wrap gap-2 mt-1">
      {profileColors.map((color) => (
        <Pressable key={color} onPress={() => onSelect(color)} className="relative">
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: color,
              borderWidth: selected === color ? 3 : 1,
              borderColor: selected === color ? '#111827' : '#a1a1aa',
            }}
          />
          {selected === color ? (
            <View className="absolute inset-0 items-center justify-center">
              <MaterialIcons name="check" size={14} color="#ffffff" />
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  )

  if (!profileModalOpen) return null

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="p-4 w-full">
        <NouText className="text-lg font-bold mb-4">
          {editingProfileId ? t('common.edit') : t('profiles.add')}
        </NouText>
        <TextInput
          className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white px-3 py-2 rounded-md mb-2"
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
          <NouButton className="flex-1" textClassName="text-white" onPress={handleSave}>
            {editingProfileId ? t('common.save') : t('profiles.add')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
