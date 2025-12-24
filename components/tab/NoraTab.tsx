import { NoraView } from '@/modules/nora-view'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { NouHeader } from '../header/NouHeader'
import { Text, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb } from '@/lib/utils'
import { Tab, tabs$ } from '@/states/tabs'
import { NouText } from '../NouText'
import { NouMenu } from '../menu/NouMenu'
import { MaterialButton } from '../button/IconButtons'
import { share } from '@/lib/share'
import { ServiceIcon } from '../service/Services'
import { debounce } from 'es-toolkit'
import { showToast } from '@/lib/toast'
import { getUserAgent } from '@/lib/webview'
import { useContentJs } from '@/lib/hooks/useContentJs'

const userAgent = getUserAgent()

const getRedirectTo = (str: string) => {
  try {
    const url = new URL(str)
    if (url.hostname.endsWith('.threads.com')) {
      return url.searchParams.get('u') || str
    }
  } catch (e) {}
  return str
}

const forceHttps = (str: string) => {
  return getRedirectTo(str).replace('http://', 'https://')
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
  const uiState = useValue(ui$)
  const nativeRef = useRef<any>(null)
  const webviewRef = useRef<WebviewTag>(null)
  const { tabs, activeTabIndex } = useValue(tabs$)
  const pageUrlRef = useRef('')
  const contentJs = useContentJs()

  useEffect(() => {
    if (!tab.url) {
      return
    }
    if (tab.url != pageUrlRef.current) {
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
      pageUrlRef.current = url
      tabs$.setTab(index, url)
    },
    [index],
  )

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) {
      return
    }

    webview.addEventListener('dom-ready', () => {
      ui$.webview.set(ObservableHint.opaque(webview))
      webview.executeJavaScript(contentJs)
    })
    webview.addEventListener('did-navigate', (e) => {
      const { host } = new URL(e.url)
      setPageUrl(e.url)
    })
    webview.addEventListener('did-navigate-in-page', (e) => {
      setPageUrl(e.url)
    })
    webview.addEventListener('ipc-message', (e) => {})
  }, [webviewRef])

  useEffect(() => {
    const webview = nativeRef.current
    if (webview && activeTabIndex == index) {
      ui$.webview.set(ObservableHint.opaque(webview))
      ;(async () => {
        try {
          const location = await webview.executeJavaScript('document.location.href')
          if (location == 'about:blank') {
            webview.loadUrl(tab.url)
          }
        } catch (e) {
          webview.loadUrl(tab.url)
        }
      })()
    }
  }, [nativeRef, activeTabIndex, index])

  const webview = webviewRef.current || nativeRef.current

  const onLoad = async (e: { nativeEvent: any }) => {
    const { url, title } = e.nativeEvent
    if (url) {
      setPageUrl(url)
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
        <View className="flex-row items-center justify-between bg-zinc-800 pl-2">
          <ServiceIcon url={tab.url} />
          <NouMenu
            trigger={<MaterialButton name="more-vert" />}
            items={[
              {
                label: 'Scroll to top',
                handler: () => webview?.executeJavaScript(`window.scrollTo(0, 0, {behavior: 'smooth'})`),
              },
              { label: 'Share', handler: () => share(pageUrlRef.current) },
              { label: 'Close', handler: () => tabs$.closeTab(index) },
            ]}
          />
        </View>
        <NoraView
          className="h-full"
          ref={webviewRef}
          partition="persist:webview"
          useragent={userAgent}
          allowpopups="true"
          key={tab.id}
        />
      </View>
    )
  }

  return (
    <NoraView
      ref={nativeRef}
      className={clsx(index != activeTabIndex && 'hidden')}
      style={{ flex: 1, display: index == activeTabIndex ? 'flex' : 'none' }}
      scriptOnStart={contentJs}
      useragent={tab.desktopMode ? getUserAgent('linux') : userAgent}
      onLoad={onLoad}
      onMessage={onMessage}
    />
  )
}
