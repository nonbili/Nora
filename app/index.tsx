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
import { MainPage } from '@/components/page/MainPage'
import { nIf } from '@/lib/utils'

function openSharedUrl(url: string) {
  try {
    const { host } = new URL(fixSharingUrl(url))
    if (Object.keys(hostHomes).includes(host)) {
      ui$.url.set(url.replace('nora://', 'https://'))
    }
  } catch (e) {
    console.error(e)
  }
}

export default function HomeScreen() {
  const navigation = useNavigation()
  const uiState = use$(ui$)
  const [scriptOnStart, setScriptOnStart] = useState('')
  const { hasShareIntent, shareIntent } = useShareIntent()
  const insets = useSafeAreaInsets()
  const ref = useRef<any>(null)
  const linkingUrl = useURL()
  const [headerShown, setHeaderShown] = useState(true)

  useEffect(() => {
    const url = shareIntent.webUrl || shareIntent.text
    if (hasShareIntent && url) {
      openSharedUrl(url)
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

    if (!ui$.url.get()) {
      ui$.url.set(getHomeUrl(settings$.home.get()))
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', function () {
      return true
    })

    /* Appearance.addChangeListener(() => reloadAppAsync()) */
    return () => subscription.remove()
  }, [])

  return nIf(scriptOnStart, <MainPage contentJs={scriptOnStart} />)
}
