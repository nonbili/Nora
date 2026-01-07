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
import { t } from 'i18next'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

const cls = clsx('flex-row items-center gap-2 rounded-full bg-sky-50 w-40 py-2 px-3')

export const NavModalContent: React.FC<{ index?: number }> = ({ index = 0 }) => {
  const disabledServices = useValue(settings$.disabledServicesArr)
  const bookmarks = useValue(bookmarks$.bookmarks)
  const oneHandMode = useValue(settings$.oneHandMode)

  const onPress = (url: string) => {
    tabs$.updateTabUrl(url, index)
    ui$.assign({ navModalOpen: false })
  }

  return (
    <ScrollView
      className="p-4 bg-gray-950"
      contentContainerClassName={clsx('pb-6 min-h-full', oneHandMode ? 'pt-[40vh] justify-end' : 'justify-center')}
    >
      <View className="flex-row flex-wrap justify-center gap-x-6 gap-y-7">
        {Object.entries(services).map(([value, [label, icon]]) =>
          nIf(
            !disabledServices.includes(value),
            <TouchableHighlight key={value} onPress={() => onPress(getHomeUrl(value))}>
              <View className={cls}>
                {icon}
                <Text className="text-sm" numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </TouchableHighlight>,
          ),
        )}
        {bookmarks.map((bookmark, index) => (
          <TouchableHighlight key={index} onPress={() => onPress(bookmark.url)}>
            <View className={cls}>
              <Image source={bookmark.icon} style={{ width: 24, height: 24 }} />
              <Text className="text-sm" numberOfLines={1}>
                {bookmark.title}
              </Text>
            </View>
          </TouchableHighlight>
        ))}
        <TouchableHighlight onPress={() => ui$.urlModalOpen.set(true)}>
          <View className={clsx(cls, 'bg-transparent border border-indigo-200 justify-center')}>
            <Text className="text-white h-6">{t('buttons.openUrl')}</Text>
          </View>
        </TouchableHighlight>
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
