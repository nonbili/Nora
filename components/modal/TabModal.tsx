import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { ServiceIcon, services } from '../service/Services'
import { View, Text, Pressable, ScrollView, TouchableHighlight } from 'react-native'
import { clsx, isWeb, isIos, nIf } from '@/lib/utils'
import { getHomeUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { NouMenu } from '../menu/NouMenu'
import { NouButton } from '../button/NouButton'
import { MaterialButton } from '../button/IconButtons'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { t } from 'i18next'
import { NouSwitch } from '../switch/NouSwitch'
import { NouText } from '../NouText'

export const TabModal = () => {
  const tabModalOpen = useValue(ui$.tabModalOpen)
  const disabledServices = useValue(settings$.disabledServicesArr)
  const profiles = useValue(settings$.profiles)
  const oneHandMode = useValue(settings$.oneHandMode)
  const { tabs, activeTabIndex } = useValue(tabs$)

  const onPress = (index: number) => {
    tabs$.activeTabIndex.set(index)
    ui$.assign({ tabModalOpen: false })
  }

  const openNavModal = () => {
    ui$.assign({ navModalOpen: true, tabModalOpen: false })
  }

  const getProfileColor = (profileId?: string) => {
    const profile = profiles.find((p) => p.id === (profileId || 'default'))
    return profile?.color || profiles[0]?.color || '#6366f1'
  }

  return (
    <BaseModal className={tabModalOpen ? 'block' : 'hidden'} onClose={() => ui$.tabModalOpen.set(false)}>
      {nIf(
        !isWeb,
        <View>
          <NouSwitch
            className="mt-1 pl-4 pr-2"
            label={<NouText className="font-medium">{t('settings.oneHandMode')}</NouText>}
            value={oneHandMode}
            onPress={() => settings$.oneHandMode.toggle()}
          />
        </View>,
      )}
      <ScrollView
        className="my-4 pl-4 min-h-full"
        contentContainerClassName={clsx('min-h-full pb-20', oneHandMode && 'justify-end pt-[35vh]')}
      >
        <View className="flex-row items-center justify-between mb-4 pr-4">
          <NouButton
            onPress={() => {
              tabs$.openTab('')
              ui$.tabModalOpen.set(false)
            }}
          >
            <MaterialIcons name="add" size={20} />
          </NouButton>
          {nIf(
            tabs.length,
            <NouButton
              variant="outline"
              size="1"
              onPress={() => {
                tabs$.closeAll()
                ui$.tabModalOpen.set(false)
              }}
            >
              {t('buttons.closeAll')}
            </NouButton>,
          )}
        </View>
        {tabs.map((tab, index) => (
          <View className="flex-row items-center justify-between" key={tab.id}>
            <TouchableHighlight className="w-[80%]" onPress={() => onPress(index)}>
              <View
                className={clsx(
                  'flex-1 flex-row items-center gap-2 rounded-md',
                  'py-2 px-2 my-3',
                  index == activeTabIndex ? 'bg-indigo-200' : 'bg-white',
                )}
                style={{ borderLeftWidth: 5, borderLeftColor: getProfileColor(tab.profile) }}
              >
                <ServiceIcon url={tab.url} icon={tab.icon} />
                <Text className="text-sm" numberOfLines={1}>
                  {tab.title || tab.url || t('tabs.new')}
                </Text>
              </View>
            </TouchableHighlight>
            <NouMenu
              trigger={isIos ? 'ellipsis' : 'filled.MoreVert'}
              items={[{ label: t('menus.close'), handler: () => tabs$.closeTab(index) }]}
            />
          </View>
        ))}
      </ScrollView>
    </BaseModal>
  )
}
