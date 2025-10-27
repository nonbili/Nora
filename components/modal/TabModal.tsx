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

export const TabModal = () => {
  const tabModalOpen = useValue(ui$.tabModalOpen)
  const home = useValue(settings$.home)
  const disabledServices = useValue(settings$.disabledServicesArr)
  const { tabs, activeTabIndex } = useValue(tabs$)

  const setHome = (home: string) => {
    ui$.url.set('')
    ui$.assign({ url: getHomeUrl(home), tabModalOpen: false })
  }

  const onPress = (index: number) => {
    tabs$.activeTabIndex.set(index)
    ui$.assign({ tabModalOpen: false })
  }

  return (
    <BaseModal className={tabModalOpen ? 'block' : 'hidden'} onClose={() => ui$.tabModalOpen.set(false)}>
      <ScrollView className="my-8 pl-4 pr-10">
        {tabs.map((tab, index) => (
          <View className="flex-row items-center justify-between" key={tab.id}>
            <TouchableHighlight className="w-[88%]" onPress={() => onPress(index)}>
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
            <NouMenu
              trigger="filled.MoreVert"
              items={[...(tabs.length > 1 ? [{ label: 'Close', handler: () => tabs$.closeTab(index) }] : [])]}
            />
          </View>
        ))}
      </ScrollView>
    </BaseModal>
  )
}
