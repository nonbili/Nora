import { Profile } from '@/states/settings'
import { clsx } from '@/lib/utils'
import { Pressable, View } from 'react-native'
import { NouText } from '../NouText'
import { t } from 'i18next'
import { AUTO_PROFILE_ID } from '@/lib/site-profile'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

type ProfileSelectorChipsProps = {
  profiles: Profile[]
  selectedProfileId: string
  onSelectProfile: (profileId: string) => void
  showAuto?: boolean
  disabled?: boolean
  containerClassName?: string
}

export const ProfileSelectorChips: React.FC<ProfileSelectorChipsProps> = ({
  profiles,
  selectedProfileId,
  onSelectProfile,
  showAuto = false,
  disabled = false,
  containerClassName,
}) => {
  const entries = showAuto ? [{ id: AUTO_PROFILE_ID, name: t('profiles.auto'), color: '#0f766e' }, ...profiles] : profiles

  return (
    <View className={clsx('flex-row flex-wrap gap-2', containerClassName)}>
      {entries.map((profile) => {
        const selected = selectedProfileId === profile.id
        const isAuto = profile.id === AUTO_PROFILE_ID
        return (
          <Pressable
            key={profile.id}
            onPress={() => onSelectProfile(profile.id)}
            disabled={disabled}
            className={clsx(disabled && 'opacity-60')}
          >
            <View
              className={clsx(
                'flex-row items-center gap-2 rounded-full px-4 py-2 border',
                selected
                  ? 'bg-indigo-100 dark:bg-indigo-500/20 border-indigo-500 dark:border-indigo-400'
                  : 'bg-white/80 dark:bg-white/5 border-zinc-200 dark:border-zinc-700/60',
              )}
            >
              {isAuto ? (
                <MaterialIcons name="auto-awesome" size={14} color={selected ? '#4338ca' : '#71717a'} />
              ) : (
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: profile.color }} />
              )}
              <NouText
                className={clsx(
                  'text-sm',
                  selected
                    ? 'text-zinc-900 dark:text-indigo-100 font-semibold'
                    : 'text-zinc-500 dark:text-gray-400',
                )}
              >
                {profile.name}
              </NouText>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
