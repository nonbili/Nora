import { View, Text, BackHandler, Appearance, ColorSchemeName, ScrollView } from 'react-native'
import { NoraView } from '@/modules/nora-view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { use$, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { fixSharingUrl, getHomeUrl, hostHomes } from '@/lib/page'
import { Asset } from 'expo-asset'
import { settings$ } from '@/states/settings'
import { useShareIntent } from 'expo-share-intent'
import { DrawerScreen } from '@/components/drawer/DrawerScreen'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useURL } from 'expo-linking'
import { reloadAppAsync } from 'expo'
import { DrawerContent } from '@/components/drawer/DrawerContent'

function openSharedUrl(url: string) {
  try {
    const { host } = new URL(fixSharingUrl(url))
    if (Object.keys(hostHomes).includes(host)) {
      ui$.url.set(url)
    }
  } catch (e) {
    console.error(e)
  }
}

export default function HomeScreen() {
  const navigation = useNavigation()
  const uiState = use$(ui$)
  const hideShorts = use$(settings$.hideShorts)
  const [scriptOnStart, setScriptOnStart] = useState('')
  const { hasShareIntent, shareIntent } = useShareIntent()
  const insets = useSafeAreaInsets()
  const ref = useRef<any>(null)
  const linkingUrl = useURL()
  const [headerShown, setHeaderShown] = useState(true)

  useEffect(() => {
    if (hasShareIntent && shareIntent.webUrl) {
      openSharedUrl(shareIntent.webUrl)
    }
  }, [hasShareIntent, shareIntent])

  useEffect(() => {
    if (linkingUrl) {
      openSharedUrl(linkingUrl)
    }
  }, [linkingUrl])

  useEffect(() => {
    ;(async () => {
      const [{ localUri }] = await Asset.loadAsync(require('../assets/scripts/main.bjs'))
      if (localUri) {
        const res = await fetch(localUri)
        const content = await res.text()
        setScriptOnStart(content)
      }
    })()

    ui$.url.set(getHomeUrl(settings$.home.get()))

    const subscription = BackHandler.addEventListener('hardwareBackPress', function () {
      return true
    })

    Appearance.addChangeListener(() => reloadAppAsync())
    return () => subscription.remove()
  }, [])

  useObserveEffect(settings$.theme, ({ value }) => Appearance.setColorScheme(value))

  const onLoad = async (e: { nativeEvent: any }) => {
    const { url, title } = e.nativeEvent
    if (url) {
      ui$.pageUrl.set(url)
      const { host } = new URL(url)
      settings$.home.set((hostHomes[host] || 'x') as any)
    }
    if (title) {
      ui$.title.set(title)
    }
    const webview = ref.current
    ref.current.eval("document.querySelector('video')?.muted=false")
    navigation.dispatch(DrawerActions.closeDrawer)
  }

  const onMessage = async (e: { nativeEvent: { payload: string } }) => {
    const { type, payload } = JSON.parse(e.nativeEvent.payload)
    switch (type) {
      case 'scroll':
        setHeaderShown(payload)
        break
    }
  }

  return (
    <>
      <DrawerScreen nora={ref.current} headerShown={headerShown} />

      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {scriptOnStart && (
          <NoraView
            // @ts-expect-error ??
            ref={ref}
            style={{ flex: 1 }}
            url={uiState.url}
            scriptOnStart={scriptOnStart}
            onLoad={onLoad}
            onMessage={onMessage}
          />
        )}
      </View>
    </>
  )
}
