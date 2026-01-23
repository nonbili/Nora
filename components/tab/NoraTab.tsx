import { NoraView } from '@/modules/nora-view'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { NouHeader } from '../header/NouHeader'
import { Text, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { Tab, tabs$ } from '@/states/tabs'
import { NouText } from '../NouText'
import { NouMenu } from '../menu/NouMenu'
import { MaterialButton } from '../button/IconButtons'
import { share } from '@/lib/share'
import { ServiceIcon } from '../service/Services'
import { debounce } from 'es-toolkit'
import { showToast } from '@/lib/toast'
import { getUserAgent } from '@/lib/useragent'
import { useContentJs } from '@/lib/hooks/useContentJs'
import { parseJson } from '@/content/utils'
import { NavModalContent } from '../modal/NavModal'
import { t } from 'i18next'
import { addBookmark } from '@/lib/bookmark'

const userAgent = getUserAgent(isWeb ? window.electron.process.platform : 'android')

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
      tabs$.updateTabUrl(url, index)
    },
    [index],
  )

  const noraViewRef = useCallback((webview: WebviewTag) => {
    webviewRef.current = webview
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
    webview.addEventListener('page-favicon-updated', (e) => {
      tabs$.tabs[index].assign({ title: webview.getTitle(), icon: e.favicons[0] })
    })
    webview.addEventListener('ipc-message', (e) => {})
  }, [])

  useEffect(() => {
    const webview = nativeRef.current
    if (webview && activeTabIndex == index && tab.url) {
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
  }, [nativeRef, activeTabIndex, index, tab.url])

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
        <View className="flex-row items-center justify-between bg-zinc-800 pl-2">
          <ServiceIcon url={tab.url} />
          <NouMenu
            trigger={<MaterialButton name="more-vert" />}
            items={[
              {
                label: t('menus.reload'),
                handler: () => webview?.executeJavaScript('document.location.reload()'),
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
          partition="persist:webview"
          useragent={userAgent}
          allowpopups="true"
          key={tab.id}
        />
        {nIf(!tab.url, <NavModalContent index={index} />)}
      </View>
    )
  }

  return (
    <>
      <NoraView
        ref={nativeRef}
        className={clsx(!tab.url || (index != activeTabIndex && 'hidden'))}
        style={{ flex: 1, display: index == activeTabIndex ? 'flex' : 'none' }}
        scriptOnStart={contentJs}
        useragent={tab.desktopMode ? getUserAgent('linux') : userAgent}
        onLoad={onLoad}
        onMessage={onMessage}
      />
      {nIf(!tab.url && index == activeTabIndex, <NavModalContent index={index} />)}
    </>
  )
}
