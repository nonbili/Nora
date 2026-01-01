import { Dimensions, View, Text, TouchableOpacity, LayoutChangeEvent } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useCallback, useEffect, useRef, useState } from 'react'
import Drawer from 'expo-router/drawer'
import { useValue, useObserve } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { removeTrackingParams } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { colors } from '@/lib/colors'
import { SettingsModal } from '../modal/SettingsModal'
import { NouMenu } from '../menu/NouMenu'
import { isWeb, nIf } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { MaterialButton } from '../button/IconButtons'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated'
import { EncodingType, StorageAccessFramework } from 'expo-file-system/legacy'
import { File, writeAsStringAsync, Directory } from 'expo-file-system'
import NoraViewModule from '@/modules/nora-view'
import { share } from '@/lib/share'
import { isDownloadable } from '@/content/download'
import { t } from 'i18next'

export const NouHeader: React.FC<{}> = ({}) => {
  const uiState = useValue(ui$)
  const settings = useValue(settings$)
  const { tabs, activeTabIndex } = useValue(tabs$)
  const currentTab = useValue(tabs$.currentTab)
  const webview = ui$.webview.get()
  const marginTop = useSharedValue(0)

  let slugs = [],
    hostname = '',
    canDownload = false

  if (currentTab?.url) {
    const { hostname, pathname } = new URL(currentTab.url)
    const slugs = pathname.split('/')
    canDownload = isDownloadable(currentTab.url)
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    if (Math.abs(uiState.headerHeight - height) < 1) {
      return
    }
    ui$.headerHeight.set(height)
  }

  useEffect(() => {
    marginTop.value = withTiming(settings.autoHideHeader && !uiState.headerShown ? -uiState.headerHeight : 0)
  }, [settings.autoHideHeader, uiState.headerHeight, uiState.headerShown])

  const scrollToTop = () => webview?.executeJavaScript(`window.scrollTo(0, 0, {behavior: 'smooth'})`)

  const Root = isWeb ? View : Animated.View

  return (
    <Root
      className="bg-zinc-800 flex-row lg:flex-col items-center justify-between px-2 py-1 lg:px-1 lg:py-2"
      /* @ts-expect-error */
      style={{ marginTop }}
      onLayout={onLayout}
    >
      <View className="flex-row lg:flex-col items-center gap-1">
        <MaterialButton name="add" onPress={() => ui$.navModalOpen.set(true)} />
        {nIf(
          !isWeb && settings.showBackButtonInHeader,
          <MaterialButton name="arrow-back" onPress={() => webview?.goBack()} />,
        )}
        {nIf(!isWeb && settings.showScrollButtonInHeader, <MaterialButton name="arrow-upward" onPress={scrollToTop} />)}
      </View>
      <View className="flex-row lg:flex-col items-center justify-end gap-1 lg:gap-5 h-full lg:h-[100px]">
        {nIf(canDownload, <MaterialButton name="download" onPress={() => ui$.downloadVideoModalOpen.set(true)} />)}
        {nIf(
          !isWeb,
          <TouchableOpacity className="flex-row items-center px-3" onPress={() => ui$.tabModalOpen.set(true)}>
            <View className="rounded-md px-2 py-1 border border-white">
              <NouText className="text-xs">{tabs.length}</NouText>
            </View>
          </TouchableOpacity>,
        )}
        <NouMenu
          trigger={isWeb ? <MaterialButton name="more-vert" /> : 'filled.MoreVert'}
          items={[
            ...(isWeb
              ? []
              : [
                  {
                    label: t('menus.reload'),
                    handler: () => webview?.executeJavaScript('document.location.reload()'),
                  },
                  {
                    label: t('menus.scroll'),
                    handler: scrollToTop,
                  },
                  {
                    label: `${t('menus.desktop')} |  ${currentTab?.desktopMode ? t('menus.desktopOn') : t('menus.desktopOff')}`,
                    handler: () => {
                      tabs$.tabs[activeTabIndex].desktopMode.toggle()
                      webview?.executeJavaScript('document.location.reload()')
                    },
                  },
                  {
                    label: t('menus.share'),
                    handler: () => (currentTab ? share(currentTab.url) : {}),
                  },
                ]),
            { label: t('settings.label'), handler: () => ui$.settingsModalOpen.set(true) },
          ]}
        />
      </View>
    </Root>
  )
}
