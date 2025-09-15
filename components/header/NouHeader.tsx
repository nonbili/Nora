import { Dimensions, View, Text, Share } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useCallback, useEffect, useRef, useState } from 'react'
import Drawer from 'expo-router/drawer'
import { use$, useObserve } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { fixSharingUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { colors } from '@/lib/colors'
import { SettingsModal } from '../modal/SettingsModal'
import { NouMenu } from '../menu/NouMenu'
import { isWeb } from '@/lib/utils'

export const NouHeader: React.FC<{ nora: any }> = ({ nora }) => {
  const uiState = use$(ui$)

  return (
    <View className="bg-zinc-800 flex-row lg:flex-col justify-between px-2 py-1 lg:px-1 lg:py-2">
      <View className="">
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
      <View className="flex flex-row lg:flex-col gap-2">
        <MaterialIcons.Button
          color={colors.icon}
          backgroundColor="transparent"
          iconStyle={{ marginRight: 0 }}
          name="refresh"
          size={24}
          onPress={() => nora?.eval('document.location.reload()')}
          underlayColor={colors.underlay}
        />
        <NouMenu
          trigger={
            <MaterialIcons.Button
              color={colors.icon}
              backgroundColor="transparent"
              iconStyle={{ marginRight: 0 }}
              name="more-vert"
              size={24}
              underlayColor={colors.underlay}
            />
          }
          items={[
            ...(isWeb
              ? []
              : [
                  { label: 'Scroll to top', handler: () => nora?.eval(`window.scrollTo(0, 0, {behavior: 'smooth'})`) },
                  { label: 'Share', handler: () => Share.share({ message: fixSharingUrl(uiState.pageUrl) }) },
                ]),
            { label: 'Settings', handler: () => ui$.settingsModalOpen.set(true) },
          ]}
        />
      </View>
    </View>
  )
}
