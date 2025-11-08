import { View, Text, BackHandler, Appearance, ColorSchemeName, ScrollView, PanResponder } from 'react-native'
import { NoraView } from '@/modules/nora-view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { fixSharingUrl, getHomeUrl, hostHomes, openSharedUrl } from '@/lib/page'
import { Asset } from 'expo-asset'
import { settings$ } from '@/states/settings'
import { useShareIntent } from 'expo-share-intent'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Linking from 'expo-linking'
import { reloadAppAsync } from 'expo'
import { MainPage } from '@/components/page/MainPage'
import { nIf } from '@/lib/utils'

export default function HomeScreen() {
  const navigation = useNavigation()
  const webview = useValue(ui$.webview)
  const [scriptOnStart, setScriptOnStart] = useState('')
  const { hasShareIntent, shareIntent } = useShareIntent()
  const insets = useSafeAreaInsets()
  const ref = useRef<any>(null)
  /* const [headerShown, setHeaderShown] = useState(true) */
  /* const headerHeight = useValue(ui$.headerHeight)
   * const headerShown = useValue(ui$.headerShown) */

  useEffect(() => {
    const url = shareIntent.webUrl || shareIntent.text
    if (hasShareIntent && url) {
      openSharedUrl(url)
    }
  }, [hasShareIntent, shareIntent])

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (e) => {
      openSharedUrl(e.url)
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    ;(async () => {
      const [{ localUri }] = await Asset.loadAsync(require('../assets/scripts/main.bjs'))
      if (localUri) {
        const res = await fetch(localUri)
        const content = await res.text()
        setScriptOnStart(content)
      }
    })()

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      webview?.goBack()
      return true
    })

    /* Appearance.addChangeListener(() => reloadAppAsync()) */
    return () => subscription.remove()
  }, [])

  /* console.log('- index', { headerHeight }) */
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const isModalOpen = ui$.isModalOpen.get()
        const headerHeight = ui$.headerHeight.get()
        const headerShown = ui$.headerShown.get()
        const { dy } = gestureState
        console.log({ isModalOpen, dy, headerShown, headerHeight })
        return !isModalOpen && Math.abs(dy) > headerHeight / 2 && ((dy < 0 && headerShown) || (dy > 0 && !headerShown))
      },

      onPanResponderMove: (evt, gestureState) => {
        const { dy } = gestureState
        const headerShown = ui$.headerShown.get()
        if (headerShown) {
          if (dy < 0) {
            ui$.headerShown.set(false)
          }
        } else if (dy > 0) {
          ui$.headerShown.set(true)
        }
      },
      onShouldBlockNativeResponder: (evt, gestureState) => {
        return false
      },
    }),
  )

  return nIf(
    scriptOnStart,
    <View className="h-full" {...panResponder.current.panHandlers}>
      <MainPage contentJs={scriptOnStart} />
    </View>,
  )
}
