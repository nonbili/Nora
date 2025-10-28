import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { services } from '../service/Services'
import { View, Text, Pressable, ScrollView, TouchableHighlight } from 'react-native'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { getHomeUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { NouButton } from '../button/NouButton'
import { MaterialButton } from '../button/IconButtons'
import { bookmarks$ } from '@/states/bookmarks'
import { Image } from 'expo-image'

export const NavModalContent = () => {
  const disabledServices = useValue(settings$.disabledServicesArr)
  const bookmarks = useValue(bookmarks$.bookmarks)

  const onPress = (url: string) => {
    tabs$.openTab(url)
    ui$.assign({ navModalOpen: false })
  }
  return (
    <ScrollView className="my-8 px-4">
      {Object.entries(services).map(([value, [label, icon]]) =>
        nIf(
          !disabledServices.includes(value),
          <TouchableHighlight key={value} onPress={() => onPress(getHomeUrl(value))}>
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
      {bookmarks.map((bookmark, index) => (
        <TouchableHighlight key={index} onPress={() => onPress(bookmark.url)}>
          <View
            className={clsx(
              'flex-row items-center gap-4 rounded-full bg-sky-50',
              isWeb ? 'py-2 px-4 my-2' : 'py-3 px-5 my-3',
            )}
          >
            <Image source={bookmark.icon} style={{ width: 24, height: 24 }} />
            <Text numberOfLines={1}>{bookmark.title}</Text>
          </View>
        </TouchableHighlight>
      ))}
      <View className="flex-row items-center justify-between mt-8">
        <NouButton variant="outline" onPress={() => ui$.bookmarkModalOpen.set(true)}>
          Add bookmark
        </NouButton>
        <MaterialButton name="settings" onPress={() => ui$.settingsModalOpen.set(true)} />
      </View>
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
