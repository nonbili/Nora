import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { services } from '../service/Services'
import { View, Text, Pressable, ScrollView, TouchableHighlight } from 'react-native'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { getHomeUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'

export const NavModalContent = () => {
  const disabledServices = useValue(settings$.disabledServicesArr)

  const onPress = (home: string) => {
    const url = getHomeUrl(home)
    tabs$.openTab(url)
    ui$.assign({ navModalOpen: false })
  }
  return (
    <ScrollView className="my-8 pl-4 pr-10">
      {Object.entries(services).map(([value, [label, icon]]) =>
        nIf(
          !disabledServices.includes(value),
          <TouchableHighlight key={value} onPress={() => onPress(value)}>
            <View
              className={clsx(
                'flex-row items-center gap-4 rounded-full bg-sky-50',
                isWeb ? 'py-2 px-4 my-2' : 'py-3 px-5 my-3',
              )}
            >
              {icon}
              <Text className={clsx(!isWeb && 'text-lg')}>{label}</Text>
            </View>
          </TouchableHighlight>,
        ),
      )}
    </ScrollView>
  )
}

export const NavModal = () => {
  const navModalOpen = useValue(ui$.navModalOpen)

  return (
    <BaseModal className={navModalOpen ? 'block' : 'hidden'} onClose={() => ui$.navModalOpen.set(false)}>
      <NavModalContent />
    </BaseModal>
  )
}
