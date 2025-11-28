import { Dimensions, View, Text, Share, TouchableOpacity, LayoutChangeEvent } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useCallback, useEffect, useRef, useState } from 'react'
import Drawer from 'expo-router/drawer'
import { useValue, useObserve } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { fixSharingUrl } from '@/lib/page'
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

export const NouHeader: React.FC<{}> = ({}) => {
  const uiState = useValue(ui$)
  const autoHideHeader = useValue(settings$.autoHideHeader)
  const { tabs, activeTabIndex } = useValue(tabs$)
  const currentUrl = useValue(tabs$.currentUrl)
  const webview = ui$.webview.get()
  const marginTop = useSharedValue(0)

  let slugs = [],
    hostname = '',
    canDownload = false

  if (currentUrl) {
    const { hostname, pathname } = new URL(currentUrl)
    const slugs = pathname.split('/')
    canDownload =
      (hostname == 'www.instagram.com' && (slugs[1] == 'reels' || slugs[2] == 'reel')) ||
      (hostname == 'm.facebook.com' && ['reel', 'stories', 'watch'].includes(slugs[1]))
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    if (Math.abs(uiState.headerHeight - height) < 1) {
      return
    }
    ui$.headerHeight.set(height)
  }

  useEffect(() => {
    marginTop.value = withTiming(autoHideHeader && !uiState.headerShown ? -uiState.headerHeight : 0)
  }, [autoHideHeader, uiState.headerHeight, uiState.headerShown])

  const Root = isWeb ? View : Animated.View

  return (
    <Root
      className="bg-zinc-800 flex-row lg:flex-col items-center justify-between px-2 py-1 lg:px-1 lg:py-2"
      /* @ts-expect-error */
      style={{ marginTop }}
      onLayout={onLayout}
    >
      <View className="items-center">
        <MaterialButton name="add" onPress={() => ui$.navModalOpen.set(true)} />
      </View>
      <View className="flex flex-row lg:flex-col items-center justify-end gap-2 lg:gap-5 h-full lg:h-[100px]">
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
                    label: 'Reload',
                    handler: () => webview?.executeJavaScript('document.location.reload()'),
                  },
                  {
                    label: 'Scroll to top',
                    handler: () => webview?.executeJavaScript(`window.scrollTo(0, 0, {behavior: 'smooth'})`),
                  },
                  {
                    label: 'Share',
                    handler: () => Share.share({ message: fixSharingUrl(tabs[activeTabIndex].url) }),
                  },
                ]),
            { label: 'Settings', handler: () => ui$.settingsModalOpen.set(true) },
          ]}
        />
      </View>
    </Root>
  )
}
