import { Dimensions, View, Text, Share } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useCallback, useEffect, useRef, useState } from 'react'
import Drawer from 'expo-router/drawer'
import { Bookmark, watchlist$ } from '@/states/watchlist'
import { use$, useObserve } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { Button, ContextMenu } from '@expo/ui/jetpack-compose'
import { fixSharingUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { colors } from '@/lib/colors'
import { SettingsModal } from '../modal/SettingsModal'
import { InjectCookieModal } from '../modal/InjectCookieModal'

export const DrawerScreen: React.FC<{ nora: any; headerShown: boolean }> = ({ nora, headerShown }) => {
  const navigation = useNavigation()
  const uiState = use$(ui$)
  const allStarred = use$(watchlist$.urls)
  const [settingsModalShown, setSettingsModalShown] = useState(false)

  const { width, height } = Dimensions.get('window')
  const isPortrait = height > width

  const injectCookie = (cookie: string) => {
    nora?.eval(`document.cookie="${cookie};max-age=31536000"; document.location.reload()`)
  }

  return (
    <>
      <Drawer.Screen
        options={{
          headerShown,
          title: uiState.title,
          headerTitleAlign: isPortrait ? 'left' : 'center',
          headerTitleStyle: {
            fontSize: 14,
          },
          headerTitleContainerStyle: {
            maxWidth: isPortrait ? '60%' : '80%',
          },
          headerStyle: {
            height: 88,
          },
          headerLeft: (props) => (
            <View className="pl-3">
              <MaterialIcons.Button
                color={colors.icon}
                backgroundColor="transparent"
                iconStyle={{ marginRight: 0 }}
                name="web-stories"
                size={24}
                onPress={() => navigation.dispatch(DrawerActions.openDrawer)}
                underlayColor={colors.underlay}
              />
            </View>
          ),
          headerRight: () => (
            <View className="flex flex-row gap-2 pr-2">
              <MaterialIcons.Button
                color={colors.icon}
                backgroundColor="transparent"
                iconStyle={{ marginRight: 0 }}
                name="refresh"
                size={24}
                onPress={() => nora?.eval('document.location.reload()')}
                underlayColor={colors.underlay}
              />
              <ContextMenu color={colors.bg}>
                {/* @ts-expect-error ?? */}
                <ContextMenu.Items>
                  <Button
                    elementColors={{
                      containerColor: colors.bg,
                      contentColor: colors.text,
                    }}
                    onPress={() => Share.share({ message: fixSharingUrl(uiState.pageUrl) })}
                  >
                    Share
                  </Button>
                  <Button
                    elementColors={{
                      containerColor: colors.bg,
                      contentColor: colors.text,
                    }}
                    onPress={() => setSettingsModalShown(true)}
                  >
                    Settings
                  </Button>
                  <Button
                    elementColors={{
                      containerColor: colors.bg,
                      contentColor: colors.text,
                    }}
                    onPress={() => ui$.injectCookieModalOpen.set(true)}
                  >
                    Inject cookie
                  </Button>
                </ContextMenu.Items>
                <ContextMenu.Trigger>
                  <MaterialIcons.Button
                    color={colors.icon}
                    backgroundColor="transparent"
                    iconStyle={{ marginRight: 0 }}
                    name="more-vert"
                    size={24}
                    underlayColor={colors.underlay}
                  />
                </ContextMenu.Trigger>
              </ContextMenu>
            </View>
          ),
        }}
      />
      {settingsModalShown && <SettingsModal onClose={() => setSettingsModalShown(false)} />}
      <InjectCookieModal onSubmit={injectCookie} />
    </>
  )
}
