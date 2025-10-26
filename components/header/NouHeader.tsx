import { Dimensions, View, Text, Share } from 'react-native'
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
import { isWeb } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { MaterialButton } from '../button/IconButtons'
import { NouButton } from '../button/NouButton'

export const NouHeader: React.FC<{}> = ({}) => {
  const uiState = useValue(ui$)
  const { tabs, activeTabIndex } = useValue(tabs$)
  const webview = ui$.webview.get()

  return (
    <View className="bg-zinc-800 flex-row lg:flex-col items-center justify-between px-2 py-1 lg:px-1 lg:py-2">
      <View className="items-center">
        <MaterialIcons.Button
          color={colors.icon}
          backgroundColor="transparent"
          iconStyle={{ marginRight: 0 }}
          name="web-stories"
          size={24}
          onPress={() => ui$.navModalOpen.set(true)}
          underlayColor={colors.underlay}
        />
      </View>
      <View className="flex flex-row lg:flex-col items-center gap-2">
        <NouButton
          className="rounded-md border-white px-[8px]"
          textClassName="text-xs"
          variant="outline"
          size="1"
          onPress={() => ui$.tabModalOpen.set(true)}
        >
          {tabs.length}
        </NouButton>
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
    </View>
  )
}
