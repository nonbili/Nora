import { BackHandler } from 'react-native'
import { useEffect, useState } from 'react'
import { useValue, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { openSharedUrl } from '@/lib/page'
import { Asset } from 'expo-asset'
import { settings$ } from '@/states/settings'
import { useShareIntent } from 'expo-share-intent'
import { useLinkingURL } from 'expo-linking'
import { MainPage } from '@/components/page/MainPage'
import { nIf } from '@/lib/utils'
import NoraViewModule from '@/modules/nora-view'

export default function HomeScreen() {
  const uiState = useValue(ui$)
  const [scriptOnStart, setScriptOnStart] = useState('')
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
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
      redirectToOldReddit: value?.redirectToOldReddit,
    })
  })

  return nIf(scriptOnStart, <MainPage contentJs={scriptOnStart} />)
}
