import { Pressable, ScrollView, View } from 'react-native'
import { clsx, isWeb, isIos } from '@/lib/utils'
import { confirmDestructiveAction } from '@/lib/confirm'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { settings$, Profile } from '@/states/settings'
import { autoProfiles$ } from '@/states/auto-profiles'
import { NouMenu } from '../menu/NouMenu'
import { t } from 'i18next'
import { MaterialButton } from '../button/IconButtons'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { ui$ } from '@/states/ui'
import { BaseCenterModal } from '../modal/BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { deleteAutoProfilesData } from '@/lib/auto-profile-data'
import { clearProfileData } from '@/lib/profile-data'
import { getDeterministicProfileColor } from '@/lib/profile-color'
import { showToast } from '@/lib/toast'

const formatDate = (value: number) => {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const AUTO_PROFILE_STALE_MS = 14 * 24 * 60 * 60 * 1000

const AutoProfilesModal = () => {
  const open = useValue(ui$.autoProfilesModalOpen)
  const autoProfiles = useValue(autoProfiles$.profiles)
  const staleProfiles = autoProfiles.filter((profile) => Date.now() - profile.lastUsedAt >= AUTO_PROFILE_STALE_MS)

  if (!open) {
    return null
  }

  const onClose = () => ui$.autoProfilesModalOpen.set(false)
  const confirmDelete = (profileIds: string[], message: string) => {
    if (!profileIds.length) {
      return
    }

    confirmDestructiveAction(t('menus.delete'), message, t('menus.delete'), () => deleteAutoProfilesData(profileIds))
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="w-full p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <NouText className="text-lg font-bold">{t('profiles.autoProfiles')}</NouText>
          <View className="flex-row items-center">
            {autoProfiles.length ? (
              <NouMenu
                trigger={
                  isWeb ? (
                    <View className="h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800">
                      <MaterialIcons name="more-vert" size={22} color="#71717a" />
                    </View>
                  ) : isIos ? (
                    'ellipsis'
                  ) : (
                    'filled.MoreVert'
                  )
                }
                items={[
                  {
                    label: t('profiles.deleteStaleAutoProfiles'),
                    disabled: !staleProfiles.length,
                    handler: () =>
                      confirmDelete(
                        staleProfiles.map((profile) => profile.id),
                        t('profiles.deleteStaleAutoProfilesConfirm', { count: staleProfiles.length }),
                      ),
                  },
                  {
                    label: t('profiles.deleteAllAutoProfiles'),
                    handler: () =>
                      confirmDelete(
                        autoProfiles.map((profile) => profile.id),
                        t('profiles.deleteAllAutoProfilesConfirm', { count: autoProfiles.length }),
                      ),
                  },
                ]}
              />
            ) : null}
            <MaterialButton name="close" onPress={onClose} />
          </View>
        </View>
        {autoProfiles.length ? (
          <ScrollView
            className="max-h-[60vh] overflow-hidden rounded-[20px] border border-zinc-300 dark:border-zinc-800"
            showsVerticalScrollIndicator={false}
          >
            {autoProfiles.map((profile, index) => (
              <View
                key={profile.id}
                className={clsx(
                  'flex-row items-center justify-between gap-3 bg-zinc-100/80 dark:bg-zinc-900/70 px-4 py-3',
                  index !== autoProfiles.length - 1 && 'border-b border-zinc-300 dark:border-zinc-800',
                )}
              >
                <View
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: getDeterministicProfileColor(profile.site) }}
                />
                <View className="min-w-0 flex-1">
                  <NouText className="font-medium" numberOfLines={1}>
                    {profile.site}
                  </NouText>
                  <NouText className="mt-1 text-xs text-zinc-500 dark:text-zinc-400" numberOfLines={1}>
                    {t('profiles.autoProfileLastUsedLabel')}: {formatDate(profile.lastUsedAt)}
                  </NouText>
                </View>
                <MaterialButton
                  name="delete-outline"
                  size={20}
                  color="#ef4444"
                  onPress={() =>
                    confirmDelete([profile.id], t('profiles.deleteAutoProfileConfirm', { site: profile.site }))
                  }
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View className="rounded-[20px] border border-zinc-300 dark:border-zinc-800 px-4 py-8">
            <NouText className="text-center text-zinc-500 dark:text-zinc-400">
              {t('profiles.autoProfilesEmpty')}
            </NouText>
          </View>
        )}
      </View>
    </BaseCenterModal>
  )
}

export const ProfileManager = () => {
  const profiles = useValue(settings$.profiles)
  const autoProfiles = useValue(autoProfiles$.profiles)

  const startEdit = (profile: Profile) => {
    ui$.assign({
      profileModalOpen: true,
      editingProfileId: profile.id,
    })
  }

  const confirmClearData = (profile: Profile) => {
    confirmDestructiveAction(
      t('profiles.clearData'),
      t('profiles.clearDataConfirm', { name: profile.name }),
      t('profiles.clearData'),
      () => {
        void clearProfileData(profile.id)
          .then(() => showToast(t('toast.profileDataCleared')))
          .catch(() => showToast(t('toast.profileDataClearFailed')))
      },
    )
  }

  const confirmDeleteProfile = (profile: Profile) => {
    confirmDestructiveAction(
      t('menus.delete'),
      t('profiles.deleteConfirm', { name: profile.name }),
      t('menus.delete'),
      () => settings$.deleteProfile(profile.id),
    )
  }

  return (
    <View className="mb-4">
      <AutoProfilesModal />
      <View className="flex-row items-center justify-between mb-3">
        <NouText className="font-medium">{t('profiles.label')}</NouText>
        <Pressable
          onPress={() =>
            ui$.assign({
              profileModalOpen: true,
            })
          }
        >
          <MaterialIcons name="add-circle-outline" size={22} color="#6366f1" />
        </Pressable>
      </View>

      {profiles.map((profile, index) => (
        <View
          key={profile.id}
          className={clsx(
            'border-x border-zinc-300 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/70 px-4 py-2',
            index === 0 && 'rounded-t-[20px] border-t',
            index !== 0 && 'border-t',
            index === profiles.length - 1 && 'rounded-b-[20px] border-b',
          )}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: profile.color }} />
              <NouText>{profile.name}</NouText>
              {profile.isDefault && <MaterialIcons name="lock-outline" size={14} color="#9ca3af" />}
            </View>
            <NouMenu
              trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
              items={[
                { label: t('common.edit'), handler: () => startEdit(profile) },
                { label: t('profiles.clearData'), handler: () => confirmClearData(profile) },
                ...(profile.isDefault
                  ? []
                  : [{ label: t('menus.delete'), handler: () => confirmDeleteProfile(profile) }]),
              ]}
            />
          </View>
        </View>
      ))}
      <View className="mt-4 flex-row justify-end">
        <NouButton variant="outline" onPress={() => ui$.autoProfilesModalOpen.set(true)}>
          {t('profiles.manageAutoProfiles', { count: autoProfiles.length })}
        </NouButton>
      </View>
    </View>
  )
}
