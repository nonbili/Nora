import { BackHandler } from 'react-native'
import { useEffect, useState } from 'react'
import { useValue, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { homeUrls, openSharedUrl } from '@/lib/page'
import { Asset } from 'expo-asset'
import { settings$ } from '@/states/settings'
import { useShareIntent } from 'expo-share-intent'
import { useLinkingURL } from 'expo-linking'
import { MainPage } from '@/components/page/MainPage'
import { nIf } from '@/lib/utils'
import NoraViewModule from '@/modules/nora-view'
import { bookmarks$ } from '@/states/bookmarks'
import { tabs$ } from '@/states/tabs'

const getHost = (url: string | undefined) => {
  if (!url) return ''
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

const getInternalHosts = () => {
  const hosts = new Set<string>()

  Object.values(homeUrls).forEach((url) => {
    const host = getHost(url)
    if (host) hosts.add(host)
  })

  bookmarks$.bookmarks.get().forEach((bookmark) => {
    const host = getHost(bookmark?.url)
    if (host) hosts.add(host)
  })

  tabs$.tabs.get().forEach((tab) => {
    const host = getHost(tab?.url)
    if (host) hosts.add(host)
  })

  return Array.from(hosts)
}

const syncNativeSettings = () => {
  const value = settings$.get()
  NoraViewModule.setSettings({
    openExternalLinkInSystemBrowser: value?.openExternalLinkInSystemBrowser,
    redirectToOldReddit: value?.redirectToOldReddit,
    allowHttpWebsite: value?.allowHttpWebsite,
    internalHosts: getInternalHosts(),
  })
}

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

  useObserveEffect(settings$, () => {
    syncNativeSettings()
  })

  useObserveEffect(bookmarks$.bookmarks, () => {
    syncNativeSettings()
  })

  useObserveEffect(tabs$.tabs, () => {
    syncNativeSettings()
  })

  return nIf(scriptOnStart, <MainPage contentJs={scriptOnStart} />)
}
