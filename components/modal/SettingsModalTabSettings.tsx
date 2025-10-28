import { View } from 'react-native'
import { NouButton } from '../button/NouButton'
import { ui$ } from '@/states/ui'
import { ServiceManager } from '../service/Services'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { settings$ } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { bookmarks$ } from '@/states/bookmarks'
import { Image } from 'expo-image'
import { NouMenu } from '../menu/NouMenu'

const themes = [null, 'dark', 'light'] as const

export const SettingsModalTabSettings = () => {
  const settings = useValue(settings$)
  const bookmarks = useValue(bookmarks$.bookmarks)

  return (
    <>
      {nIf(
        !isWeb,
        <View className="my-8">
          <View className="items-center flex-row justify-between">
            <NouText className="font-medium">Theme</NouText>
            <Segemented
              options={['System', 'Dark', 'Light']}
              selectedIndex={themes.indexOf(settings.theme)}
              size={1}
              onChange={(index) => settings$.theme.set(themes[index])}
            />
          </View>
          <NouText className="mt-2 text-sm text-gray-400 text-right">
            Restart manually if change not reflected in webview.
          </NouText>
        </View>,
      )}
      {nIf(
        !isWeb,
        <View className="flex-row justify-center mb-8">
          <NouButton variant="outline" onPress={() => ui$.cookieModalOpen.set(true)}>
            Inject cookie
          </NouButton>
        </View>,
      )}
      <ServiceManager />
      {nIf(bookmarks.length, <NouText className="mt-5 mb-1 font-medium">Bookmarks</NouText>)}
      {bookmarks.map((bookmark, index) => (
        <View className="flex-row items-center justify-between gap-5" key={index}>
          <View className="flex-row items-center gap-2 w-[70%]">
            <Image source={bookmark.icon} style={{ width: 24, height: 24 }} />
            <NouText numberOfLines={1}>{bookmark.title}</NouText>
          </View>
          <NouMenu
            trigger="filled.MoreVert"
            items={[{ label: 'Delete', handler: () => bookmarks$.deleteBookmark(index) }]}
          />
        </View>
      ))}
      <View className="flex-row justify-center mt-8">
        <NouButton variant="outline" onPress={() => ui$.bookmarkModalOpen.set(true)}>
          Add bookmark
        </NouButton>
      </View>
    </>
  )
}
