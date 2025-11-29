import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { ServiceIcon, services } from '../service/Services'
import { View, Text, Pressable, ScrollView, TouchableHighlight } from 'react-native'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { getHomeUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { NouMenu } from '../menu/NouMenu'
import { NouButton } from '../button/NouButton'
import { MaterialButton } from '../button/IconButtons'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

export const TabModal = () => {
  const tabModalOpen = useValue(ui$.tabModalOpen)
  const disabledServices = useValue(settings$.disabledServicesArr)
  const { tabs, activeTabIndex } = useValue(tabs$)

  const onPress = (index: number) => {
    tabs$.activeTabIndex.set(index)
    ui$.assign({ tabModalOpen: false })
  }

  const openNavModal = () => {
    ui$.assign({ navModalOpen: true, tabModalOpen: false })
  }

  return (
    <BaseModal className={tabModalOpen ? 'block' : 'hidden'} onClose={() => ui$.tabModalOpen.set(false)}>
      <ScrollView className="my-8 pl-4">
        {tabs.map((tab, index) => (
          <View className="flex-row items-center justify-between" key={tab.id}>
            <TouchableHighlight className="w-[80%]" onPress={() => onPress(index)}>
              <View
                className={clsx(
                  'flex-1 flex-row items-center gap-2 rounded-md',
                  'py-2 px-2 my-3',
                  index == activeTabIndex ? 'bg-indigo-200' : 'bg-white',
                )}
              >
                <ServiceIcon url={tab.url} />
                <Text className="" numberOfLines={2}>
                  {tab.url}
                </Text>
              </View>
            </TouchableHighlight>
            <NouMenu trigger="filled.MoreVert" items={[{ label: 'Close', handler: () => tabs$.closeTab(index) }]} />
          </View>
        ))}
        <View className="flex-row items-center justify-between mt-8 pr-4">
          <NouButton variant="soft" onPress={openNavModal}>
            <MaterialIcons name="add" size={20} />
          </NouButton>
          {nIf(
            tabs.length,
            <NouButton
              variant="outline"
              size="1"
              onPress={() => {
                tabs$.tabs.set([])
                openNavModal()
              }}
            >
              Close all
            </NouButton>,
          )}
        </View>
      </ScrollView>
    </BaseModal>
  )
}
