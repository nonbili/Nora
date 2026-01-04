import { View, Text, BackHandler, Appearance, ColorSchemeName, ScrollView } from 'react-native'
import { NoraView } from '@/modules/nora-view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue, useObserve, useObserveEffect, use } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { getHomeUrl, openSharedUrl } from '@/lib/page'
import { getScriptContent } from '@/lib/script'
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
  const scriptOnStart = use(getScriptContent())
  const { hasShareIntent, shareIntent } = useShareIntent()
  const insets = useSafeAreaInsets()
  const ref = useRef<any>(null)
  const [headerShown, setHeaderShown] = useState(true)
  const linkingUrl = useLinkingURL()

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
