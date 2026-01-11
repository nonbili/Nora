import { View, Text, BackHandler, Appearance, ColorSchemeName, ScrollView } from 'react-native'
import { NoraView } from '@/modules/nora-view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { getHomeUrl, openSharedUrl } from '@/lib/page'
import { Asset } from 'expo-asset'
import { settings$ } from '@/states/settings'
import { useShareIntent } from 'expo-share-intent'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLinkingURL } from 'expo-linking'
import { reloadAppAsync } from 'expo'
import { MainPage } from '@/components/page/MainPage'
import { nIf } from '@/lib/utils'
import NoraViewModule from '@/modules/nora-view'

export default function HomeScreen() {
  const navigation = useNavigation()
  const uiState = useValue(ui$)
  const [scriptOnStart, setScriptOnStart] = useState('')
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
  const insets = useSafeAreaInsets()
  const ref = useRef<any>(null)
  const [headerShown, setHeaderShown] = useState(true)
  const linkingUrl = useLinkingURL()

  useEffect(() => {
    const url = shareIntent.webUrl || shareIntent.text
    if (hasShareIntent && url) {
      openSharedUrl(url)
      resetShareIntent()
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

    // @ts-expect-error
    NoraViewModule.addListener('log', (evt) => {
      console.log('[kotlin]', evt.msg)
    })

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      uiState.webview?.goBack()
      return true
    })

    /* Appearance.addChangeListener(() => reloadAppAsync()) */
    return () => subscription.remove()
  }, [])

  useObserveEffect(settings$, ({ value }) => {
    NoraViewModule.setSettings({
      openExternalLinkInSystemBrowser: value?.openExternalLinkInSystemBrowser,
    })
  })

  return nIf(scriptOnStart, <MainPage contentJs={scriptOnStart} />)
}
