import { Pressable, TextInput, View } from 'react-native'
import { NouButton } from '../button/NouButton'
import { isWeb, isIos } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { settings$, Profile } from '@/states/settings'
import { NouMenu } from '../menu/NouMenu'
import { t } from 'i18next'
import { MaterialButton } from '../button/IconButtons'
import { useState } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

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

export const ProfileManager = () => {
  const profiles = useValue(settings$.profiles)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(profileColors[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const handleAdd = () => {
    if (newName.trim()) {
      settings$.addProfile(newName.trim(), newColor)
      setNewName('')
      setNewColor(profileColors[0])
      setAddingNew(false)
    }
  }

  const startEdit = (profile: Profile) => {
    setEditingId(profile.id)
    setEditName(profile.name)
    setEditColor(profile.color)
  }

  const handleEdit = () => {
    if (editingId && editName.trim()) {
      settings$.updateProfile(editingId, editName.trim(), editColor)
      setEditingId(null)
    }
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

  return (
    <View className="mt-5 mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <NouText className="font-medium">{t('profiles.label')}</NouText>
        {!addingNew && (
          <Pressable onPress={() => setAddingNew(true)}>
            <MaterialIcons name="add-circle-outline" size={22} color="#6366f1" />
          </Pressable>
        )}
      </View>

      {profiles.map((profile) => (
        <View key={profile.id} className="mb-3">
          {editingId === profile.id ? (
            <View className="bg-white/10 rounded-lg p-3">
              <TextInput
                className="border border-gray-600 text-white px-3 py-2 rounded-md mb-2"
                value={editName}
                onChangeText={setEditName}
                placeholder={t('profiles.namePlaceholder')}
                placeholderTextColor="#9ca3af"
              />
              <ColorPicker selected={editColor} onSelect={setEditColor} />
              <View className="flex-row gap-2 mt-3">
                <NouButton size="1" onPress={handleEdit}>
                  {t('profiles.save')}
                </NouButton>
                <NouButton size="1" variant="outline" onPress={() => setEditingId(null)}>
                  {t('buttons.cancel')}
                </NouButton>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: profile.color }} />
                <NouText>{profile.name}</NouText>
                {profile.isDefault && <MaterialIcons name="lock-outline" size={14} color="#9ca3af" />}
              </View>
              <NouMenu
                trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
                items={[
                  { label: t('profiles.edit'), handler: () => startEdit(profile) },
                  ...(profile.isDefault
                    ? []
                    : [{ label: t('menus.delete'), handler: () => settings$.deleteProfile(profile.id) }]),
                ]}
              />
            </View>
          )}
        </View>
      ))}

      {addingNew && (
        <View className="bg-white/10 rounded-lg p-3 mt-2">
          <TextInput
            className="border border-gray-600 text-white px-3 py-2 rounded-md mb-2"
            value={newName}
            onChangeText={setNewName}
            placeholder={t('profiles.namePlaceholder')}
            placeholderTextColor="#9ca3af"
            autoFocus
          />
          <ColorPicker selected={newColor} onSelect={setNewColor} />
          <View className="flex-row gap-2 mt-3">
            <NouButton size="1" onPress={handleAdd}>
              {t('profiles.add')}
            </NouButton>
            <NouButton size="1" variant="outline" onPress={() => setAddingNew(false)}>
              {t('buttons.cancel')}
            </NouButton>
          </View>
        </View>
      )}
    </View>
  )
}
