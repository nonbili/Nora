import { NoraView } from '@/modules/nora-view'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { StyleSheet, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb, isIos, nIf } from '@/lib/utils'
import { Tab, tabs$ } from '@/states/tabs'
import { NouMenu } from '../menu/NouMenu'
import { MaterialButton } from '../button/IconButtons'
import { share } from '@/lib/share'
import { ServiceIcon } from '../service/Services'
import { getUserAgent } from '@/lib/useragent'
import { useContentJs } from '@/lib/hooks/useContentJs'
import { parseJson } from '@/content/utils'
import { NavModalContent } from '../modal/NavModal'
import { t } from 'i18next'
import { addBookmark } from '@/lib/bookmark'
import { getProfileColor } from '@/lib/profile'

const getRedirectTo = (str: string) => {
  try {
    const url = new URL(str)
    if (url.hostname.endsWith('.threads.com')) {
      return url.searchParams.get('u') || str
    }
  } catch {}
  return str
}

const forceHttps = (str: string) => {
  const url = getRedirectTo(str)
  if (settings$.allowHttpWebsite.get()) {
    return url
  }
  return url.replace('http://', 'https://')
}

const onScroll = (dy: number) => {
  const headerHeight = ui$.headerHeight.get()
  const headerShown = ui$.headerShown.get()
  if (Math.abs(dy) <= headerHeight / 2) {
    return
  }
  if (dy < 0 && headerShown) {
    ui$.headerShown.set(false)
  } else if (dy > 0 && !headerShown) {
    ui$.headerShown.set(true)
  }
}

export const NoraTab: React.FC<{ tab: Tab; index: number }> = ({ tab, index }) => {
  const autoHideHeader = useValue(settings$.autoHideHeader)
  const inspectable = useValue(settings$.inspectable)
  const nativeRef = useRef<any>(null)
  const webviewRef = useRef<WebviewTag>(null)
  const { activeTabIndex } = useValue(tabs$)
  const pageUrlRef = useRef('')
  const [canGoBack, setCanGoBack] = useState(false)
  const contentJs = useContentJs()
  const profileColor = getProfileColor(tab.profile)
  const isActive = activeTabIndex === index

  useEffect(() => {
    if (!tab.url) {
      return
    }
    if (tab.url !== pageUrlRef.current) {
      const webview = webviewRef.current
      const native = nativeRef.current
      if (webview) {
        webview.src = tab.url
      } else if (native) {
        native.loadUrl(tab.url)
      }
    }
  }, [tab.url])

  const setPageUrl = useCallback(
    (url: string) => {
      if (!url || url === 'about:blank') {
        return
      }
      pageUrlRef.current = url
      tabs$.updateTabUrl(url, index)
    },
    [index],
  )

  const noraViewRef = useCallback(
    (webview: WebviewTag) => {
      webviewRef.current = webview
      if (!webview) {
        return
      }

      webview.addEventListener('dom-ready', () => {
        ui$.webview.set(ObservableHint.opaque(webview))
        webview.executeJavaScript(contentJs)
        setCanGoBack(webview.canGoBack())
      })
      webview.addEventListener('did-navigate', (e) => {
        setPageUrl(e.url)
        setCanGoBack(webview.canGoBack())
      })
      webview.addEventListener('did-navigate-in-page', (e) => {
        setPageUrl(e.url)
        setCanGoBack(webview.canGoBack())
      })
      webview.addEventListener('page-favicon-updated', (e) => {
        tabs$.tabs[index].assign({ title: webview.getTitle(), icon: e.favicons.at(-1) })
      })
      webview.addEventListener('ipc-message', (e) => {})
    },
    [contentJs, index, setPageUrl],
  )

  const setActiveNativeWebview = useCallback(
    (webview: any) => {
      if (webview && isActive) {
        ui$.webview.set(ObservableHint.opaque(webview))
      }
    },
    [isActive],
  )

  const syncNativePage = useCallback(
    async (webview: any) => {
      if (!webview || !tab.url) return
      setActiveNativeWebview(webview)
      try {
        const location = await webview.executeJavaScript('document.location.href')
        const currentLocation = typeof location === 'string' ? location.replace(/^"|"$/g, '') : ''
        if (!currentLocation || currentLocation === 'about:blank') {
          webview.loadUrl(tab.url)
        } else if (!pageUrlRef.current) {
          pageUrlRef.current = currentLocation
        }
      } catch {
        if (!pageUrlRef.current) {
          webview.loadUrl(tab.url)
        }
      }
    },
    [tab.url, setActiveNativeWebview],
  )

  useEffect(() => {
    const webview = nativeRef.current
    if (!webview) {
      return
    }
    setActiveNativeWebview(webview)
    if (!pageUrlRef.current && tab.url) {
      syncNativePage(webview)
    }
  }, [tab.url, setActiveNativeWebview, syncNativePage])

  const onNativeRef = useCallback(
    (ref: any) => {
      nativeRef.current = ref
      if (ref && tab.url) {
        syncNativePage(ref)
      }
    },
    [tab.url, syncNativePage],
  )

  const webview = webviewRef.current || nativeRef.current
  const goBack = () => webview?.goBack?.()
  const reloadPage = () => {
    if (!webview) return
    if (typeof webview.reload === 'function') {
      webview.reload()
    } else {
      webview.executeJavaScript('document.location.reload()')
    }
  }
  const toolbarButtonStyle = { padding: 4, height: 28 }

  const onLoad = async (e: { nativeEvent: any }) => {
    const { url, title, icon } = e.nativeEvent
    if (url) {
      setPageUrl(url)
    }
    if (title || icon) {
      tabs$.tabs[index].assign({ title, icon })
    }
  }

  const onMessage = async (e: { nativeEvent: { payload: string | object } }) => {
    const { payload } = e.nativeEvent
    const { type, data } = typeof payload == 'string' ? JSON.parse(payload) : payload
    switch (type) {
      case '[content]':
      case '[kotlin]':
        console.log(type, data)
        break
      case 'icon':
        const meta = parseJson(await webview?.executeJavaScript('window.Nora?.getMeta()'), {})
        if (meta.title || meta.icon) {
          tabs$.tabs[index].assign({ ...meta })
        }
        break
      case 'new-tab':
        tabs$.openTab(forceHttps(data.url))
        break
      case 'save-file':
        webview?.saveFile(data.content, data.fileName, data.mimeType)
        break
      case 'scroll':
        if (autoHideHeader) {
          onScroll(data.dy)
        }
        break
      default:
        console.log('onMessage', type, data)
        break
    }
  }

  if (isWeb) {
    return (
      <View className="w-[25rem] shrink-0">
        <View
          className="flex-row items-center justify-between bg-zinc-800 pl-2"
          style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36, alignItems: 'center' }}
        >
          <View className="flex-row items-center gap-1">
            <ServiceIcon url={tab.url} icon={tab.icon} />
            {nIf(canGoBack, <MaterialButton name="arrow-back" onPress={goBack} style={toolbarButtonStyle} />)}
          </View>
          <NouMenu
            trigger={<MaterialButton name="more-vert" style={toolbarButtonStyle} />}
            items={[
              {
                label: t('menus.reload'),
                handler: reloadPage,
              },
              {
                label: t('menus.scroll'),
                handler: () => webview?.executeJavaScript(`window.scrollTo(0, 0, {behavior: 'smooth'})`),
              },
              {
                label: t('menus.addBookmark'),
                handler: () => addBookmark(tab),
              },
              { label: t('menus.share'), handler: () => share(pageUrlRef.current) },
              { label: t('menus.close'), handler: () => tabs$.closeTab(index) },
            ]}
          />
        </View>
        <NoraView
          className={clsx('h-full', !tab.url && 'hidden')}
          ref={noraViewRef}
          partition={`persist:${tab.profile || 'default'}`}
          useragent={getUserAgent(window.electron.process.platform, true)}
          inspectable={inspectable}
          allowpopups="true"
          key={tab.id}
        />
        {nIf(!tab.url, <NavModalContent index={index} />)}
      </View>
    )
  }

  return (
    <View
      pointerEvents={isActive ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFillObject, { opacity: isActive ? 1 : 0, zIndex: isActive ? 1 : 0 }]}
    >
      <NoraView
        ref={onNativeRef}
        className={clsx(!tab.url && 'hidden')}
        style={StyleSheet.absoluteFillObject}
        profile={tab.profile || 'default'}
        scriptOnStart={contentJs}
        useragent={getUserAgent(isIos ? 'ios' : 'android', tab.desktopMode)}
        onLoad={onLoad}
        onMessage={onMessage}
        inspectable={inspectable}
      />
      {nIf(!tab.url && isActive, <NavModalContent index={index} />)}
    </View>
  )
}
