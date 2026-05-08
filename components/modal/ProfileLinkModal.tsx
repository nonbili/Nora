import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { Pressable, ScrollView, View, useColorScheme } from 'react-native'
import { NouText } from '../NouText'
import { ProfileSelectorChips } from '../profile/ProfileSelectorChips'
import { BaseCenterModal } from './BaseCenterModal'
import { colors } from '@/lib/colors'
import { AUTO_PROFILE_ID } from '@/lib/site-profile'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'

export const ProfileLinkModal: React.FC = () => {
  const profileLinkUrl = useValue(ui$.profileLinkUrl)
  const profiles = useValue(settings$.profiles)
  const oneProfilePerSite = useValue(settings$.oneProfilePerSite)
  const allowHttpWebsite = useValue(settings$.allowHttpWebsite)
  const lastSelectedProfileId = useValue(ui$.lastSelectedProfileId)
  const colorScheme = useColorScheme()
  const iconColor = colorScheme === 'light' ? colors.iconLightStrong : colors.icon

  if (!profileLinkUrl) {
    return null
  }

  const close = () => {
    ui$.profileLinkUrl.set('')
  }

  const openInProfile = (profileId: string) => {
    const targetUrl = allowHttpWebsite ? profileLinkUrl : profileLinkUrl.replace('http://', 'https://')
    if (profileId === AUTO_PROFILE_ID) {
      tabs$.openTab(targetUrl, { profileMode: 'auto', source: 'manual' })
    } else {
      ui$.lastSelectedProfileId.set(profileId)
      tabs$.openTab(targetUrl, { profile: profileId, profileMode: 'manual', source: 'manual' })
    }
    close()
  }

  return (
    <BaseCenterModal onClose={close} containerClassName="w-[28rem] max-w-[90vw]">
      <View className="gap-4 p-4">
        <View className="flex-row items-center justify-between gap-3">
          <NouText className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {t('profiles.openLinkInProfile')}
          </NouText>
          <Pressable
            onPress={close}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-zinc-200 dark:active:bg-zinc-800"
          >
            <MaterialIcons name="close" size={18} color={iconColor} />
          </Pressable>
        </View>
        <NouText className="text-xs text-zinc-500 dark:text-zinc-400" numberOfLines={2}>
          {profileLinkUrl}
        </NouText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="py-1">
          <ProfileSelectorChips
            profiles={profiles}
            selectedProfileId={oneProfilePerSite ? AUTO_PROFILE_ID : lastSelectedProfileId}
            onSelectProfile={openInProfile}
            showAuto={oneProfilePerSite}
            containerClassName="flex-row flex-nowrap gap-2"
          />
        </ScrollView>
      </View>
    </BaseCenterModal>
  )
}
