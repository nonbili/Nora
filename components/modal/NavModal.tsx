import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { services } from '../service/Services'
import { View, Text, Pressable, ScrollView, TouchableHighlight } from 'react-native'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { getHomeUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'

export const NavModal = () => {
  const navModalOpen = useValue(ui$.navModalOpen)
  const home = useValue(settings$.home)
  const disabledServices = useValue(settings$.disabledServicesArr)

  const setHome = (home: string) => {
    ui$.url.set('')
    ui$.assign({ url: getHomeUrl(home), navModalOpen: false })
  }

  const onPress = (home: string) => {
    const url = getHomeUrl(home)
    if (isWeb) {
      tabs$.openTab(url)
    } else {
      tabs$.setTab(0, url)
    }
    ui$.assign({ navModalOpen: false })
  }

  return (
    <BaseModal className={navModalOpen ? 'block' : 'hidden'} onClose={() => ui$.navModalOpen.set(false)}>
      <ScrollView className="my-8 pl-4 pr-10">
        {Object.entries(services).map(([value, [label, icon]]) =>
          nIf(
            !disabledServices.includes(value),
            <TouchableHighlight key={value} onPress={() => onPress(value)}>
              <View
                className={clsx(
                  'flex-row items-center gap-4 rounded-full bg-sky-50',
                  isWeb ? 'py-2 px-4 my-2' : 'py-3 px-5 my-3',
                  // home == value ? 'bg-emerald-200' : 'bg-sky-50',
                )}
              >
                {icon}
                <Text className={clsx(!isWeb && 'text-lg')}>{label}</Text>
              </View>
            </TouchableHighlight>,
          ),
        )}
      </ScrollView>
    </BaseModal>
  )
}
