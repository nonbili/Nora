import { ui$ } from '@/states/ui'
import { use$ } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { services } from '../service/Services'
import { View, Text, Pressable, ScrollView, TouchableHighlight } from 'react-native'
import { clsx, nIf } from '@/lib/utils'
import { getHomeUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'

export const NavModal = () => {
  const navModalOpen = use$(ui$.navModalOpen)
  const home = use$(settings$.home)
  const disabledServices = use$(settings$.disabledServices)

  const setHome = (home: string) => {
    ui$.url.set('')
    ui$.assign({ url: getHomeUrl(home), navModalOpen: false })
  }

  return (
    <BaseModal className={navModalOpen ? 'block' : 'hidden'} onClose={() => ui$.navModalOpen.set(false)}>
      <View className="py-8 pl-4 pr-10">
        {services.map(([value, label, icon]) =>
          nIf(
            !disabledServices.has(value),
            <TouchableHighlight key={value} onPress={() => setHome(value)}>
              <View
                className={clsx(
                  'flex-row items-center gap-4 rounded-full py-3 px-5 my-3',
                  home == value ? 'bg-emerald-200' : 'bg-sky-50',
                )}
              >
                {icon}
                <Text className="text-lg">{label}</Text>
              </View>
            </TouchableHighlight>,
          ),
        )}
      </View>
    </BaseModal>
  )
}
