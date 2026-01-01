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
import { NouSwitch } from '../switch/NouSwitch'
import { useTranslation } from 'react-i18next'
import { t } from 'i18next'

const headerPositions = ['top', 'bottom'] as const
const themes = [null, 'dark', 'light'] as const

export const SettingsModalTabSettings = () => {
  const settings = useValue(settings$)
  const bookmarks = useValue(bookmarks$.bookmarks)

  return (
    <>
      {nIf(
        !isWeb,
        <View className="my-8">
          <NouSwitch
            className="mb-6"
            label={<NouText className="font-medium">{t('settings.openExternalLink')}</NouText>}
            value={settings.openExternalLinkInSystemBrowser}
            onPress={() => settings$.openExternalLinkInSystemBrowser.toggle()}
          />
          <NouSwitch
            className="mb-6"
            label={<NouText className="font-medium">{t('settings.hideHeader')}</NouText>}
            value={settings.autoHideHeader}
            onPress={() => settings$.autoHideHeader.toggle()}
          />
          <View className="items-center flex-row justify-between mb-6">
            <NouText className="font-medium">{t('settings.headerPosition.label')}</NouText>
            <Segemented
              options={[t('settings.headerPosition.top'), t('settings.headerPosition.bottom')]}
              selectedIndex={headerPositions.indexOf(settings.headerPosition)}
              size={1}
              onChange={(index) => settings$.headerPosition.set(headerPositions[index])}
            />
          </View>
          <NouSwitch
            className="mb-6"
            label={<NouText className="font-medium">{t('settings.showBackButton')}</NouText>}
            value={settings.showBackButtonInHeader}
            onPress={() => settings$.showBackButtonInHeader.toggle()}
          />
          <NouSwitch
            className="mb-6"
            label={<NouText className="font-medium">{t('settings.showScrollButton')}</NouText>}
            value={settings.showScrollButtonInHeader}
            onPress={() => settings$.showScrollButtonInHeader.toggle()}
          />

          <View className="items-center flex-row justify-between">
            <NouText className="font-medium">{t('settings.theme.label')}</NouText>
            <Segemented
              options={[t('settings.theme.system'), t('settings.theme.dark'), t('settings.theme.light')]}
              selectedIndex={themes.indexOf(settings.theme)}
              size={1}
              onChange={(index) => settings$.theme.set(themes[index])}
            />
          </View>
          <NouText className="mt-2 text-sm text-gray-400 text-right">{t('settings.theme.hint')}</NouText>
        </View>,
      )}

      {nIf(
        !isWeb,
        <View className="flex-row justify-center mb-8">
          <NouButton variant="outline" onPress={() => ui$.cookieModalOpen.set(true)}>
            {t('settings.injectCookie')}
          </NouButton>
        </View>,
      )}

      <ServiceManager />
      {nIf(bookmarks.length, <NouText className="mt-5 mb-1 font-medium">{t('bookmarks.label')}</NouText>)}
      {bookmarks.map((bookmark, index) => (
        <View className="flex-row items-center justify-between gap-5" key={index}>
          <View className="flex-row items-center gap-2 w-[70%]">
            <Image source={bookmark.icon} style={{ width: 24, height: 24 }} />
            <NouText numberOfLines={1}>{bookmark.title}</NouText>
          </View>
          <NouMenu
            trigger="filled.MoreVert"
            items={[{ label: t('menus.delete'), handler: () => bookmarks$.deleteBookmark(index) }]}
          />
        </View>
      ))}
      <View className="flex-row justify-center mt-8">
        <NouButton variant="outline" onPress={() => ui$.bookmarkModalOpen.set(true)}>
          {t('bookmarks.addButton')}
        </NouButton>
      </View>
    </>
  )
}
