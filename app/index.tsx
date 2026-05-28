import { BackHandler } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { useObserveEffect } from '@legendapp/state/react'
import { homeUrls, openSharedUrl } from '@/lib/page'
import { Asset } from 'expo-asset'
import { settings$ } from '@/states/settings'
import { useIncomingShare } from 'expo-sharing'
import { parseSharedUrl } from '@/lib/share-intent'
import { useLinkingURL } from 'expo-linking'
import { MainPage } from '@/components/page/MainPage'
import { nIf } from '@/lib/utils'
import NoraViewModule from '@/modules/nora-view'
import { bookmarks$ } from '@/states/bookmarks'
import { tabs$ } from '@/states/tabs'
import { blocklist$ } from '@/states/blocklist'
import { applyBlocklist, refreshBlocklistIfDue, supportsRuntimeBlocklist, waitForBlocklistPersist } from '@/lib/blocklist'
import { showToast } from '@/lib/toast'
import { t } from 'i18next'

let Notifications: typeof import('expo-notifications') | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications')
} catch {
  // ignore
}

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

const EXIT_DOUBLE_BACK_WINDOW_MS = 2000

export default function HomeScreen() {
  const [scriptOnStart, setScriptOnStart] = useState('')
  const { resolvedSharedPayloads, clearSharedPayloads, isResolving } = useIncomingShare()
  const handledPayloadKeyRef = useRef<string | null>(null)
  const linkingUrl = useLinkingURL()

  useEffect(() => {
    if (isResolving) {
      return
    }
    if (resolvedSharedPayloads.length === 0) {
      handledPayloadKeyRef.current = null
      return
    }

    const payload = resolvedSharedPayloads[0]
    const key = `${payload.contentType ?? 'text'}:${payload.contentUri ?? ''}:${payload.value}`
    if (handledPayloadKeyRef.current === key) {
      return
    }
    handledPayloadKeyRef.current = key

    let url: string | null = null
    if (payload.contentType === 'website' && payload.contentUri) {
      url = payload.contentUri
    } else {
      url = parseSharedUrl({ webUrl: payload.contentUri ?? undefined, text: payload.value ?? undefined })
    }

    if (url) {
      openSharedUrl(url)
    }

    clearSharedPayloads()
  }, [resolvedSharedPayloads, isResolving, clearSharedPayloads])

  useEffect(() => {
    if (linkingUrl) {
      openSharedUrl(linkingUrl)
    }
  }, [linkingUrl])

  useEffect(() => {
    if (!Notifications) return

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const url = response?.notification?.request?.content?.data?.url
      if (typeof url === 'string') openSharedUrl(url)
    })
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response?.notification?.request?.content?.data?.url
      if (typeof url === 'string') openSharedUrl(url)
    })
    return () => sub.remove()
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

    // @ts-expect-error
    NoraViewModule.addListener('log', (evt) => {
      console.log('[kotlin]', evt.msg)
    })

    let lastBackPressAt = 0
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tabs$.handleBackPress()) {
        lastBackPressAt = 0
        return true
      }
      if (settings$.doubleBackToExitApp.get()) {
        const now = Date.now()
        if (lastBackPressAt && now - lastBackPressAt < EXIT_DOUBLE_BACK_WINDOW_MS) {
          BackHandler.exitApp()
          return true
        }
        lastBackPressAt = now
        showToast(t('toast.pressBackAgainToExit'))
        return true
      }
      lastBackPressAt = 0
      BackHandler.exitApp()
      return true
    })

    /* Appearance.addChangeListener(() => reloadAppAsync()) */
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    let active = true

    const init = async () => {
      if (!supportsRuntimeBlocklist()) {
        return
      }
      await waitForBlocklistPersist()
      if (!active) {
        return
      }
      await applyBlocklist()
      await refreshBlocklistIfDue()
    }

    void init()

    if (!supportsRuntimeBlocklist()) {
      return () => {
        active = false
      }
    }

    return () => {
      active = false
    }
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

  useObserveEffect(() => {
    const { enabled, hasSnapshot, revision } = blocklist$.get()
    void applyBlocklist()
  })

  useObserveEffect(settings$.profiles, () => {
    void applyBlocklist()
  })

  return nIf(scriptOnStart, <MainPage contentJs={scriptOnStart} />)
}
