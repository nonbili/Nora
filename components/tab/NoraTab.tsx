import { NoraView } from '@/modules/nora-view'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { fixSharingUrl, getHomeUrl, hostHomes } from '@/lib/page'
import { NouHeader } from '../header/NouHeader'
import { Text, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { NouText } from '../NouText'
import { NouMenu } from '../menu/NouMenu'
import { MaterialButton } from '../button/IconButtons'
import { share } from '@/lib/share'
import { ServiceIcon } from '../service/Services'
import { debounce } from 'es-toolkit'
import { showToast } from '@/lib/toast'

const userAgent =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.52 Mobile Safari/537.36'

let _scrollY = 0

const onScroll = debounce(
  (scrollY) => {
    if (scrollY == 0) {
      ui$.headerMarginTop.set(0)
      return
    }

    let shouldReset = !!_scrollY
    if (!_scrollY) {
      _scrollY = scrollY
      return
    }
    const deltaY = scrollY - _scrollY
    if (!deltaY) {
      return
    }
    const height = ui$.headerHeight.get()
    const top = ui$.headerMarginTop.get()
    let newTop
    if (deltaY > 0) {
      newTop = Math.max(-height, top - deltaY)
    } else {
      newTop = Math.max(0, top + deltaY)
    }
    ui$.headerMarginTop.set(newTop)

    _scrollY = scrollY
  },
  100,
  { edges: ['leading', 'trailing'] },
)

export const NoraTab: React.FC<{ url: string; contentJs: string; index: number }> = ({ url, contentJs, index }) => {
  const uiState = useValue(ui$)
  const nativeRef = useRef<any>(null)
  const webviewRef = useRef<WebviewTag>(null)
  const { tabs, activeTabIndex } = useValue(tabs$)
  const pageUrlRef = useRef('')

  useEffect(() => {
    if (!url) {
      return
    }
    if (url != pageUrlRef.current) {
      const webview = webviewRef.current
      const native = nativeRef.current
      if (webview) {
        webview.src = url
      } else if (native) {
        native.loadUrl(url)
      }
    }
  }, [url])

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
      webview.setActive()
      ui$.webview.set(ObservableHint.opaque(webview))
      ;(async () => {
        try {
          const location = await webview.executeJavaScript('document.location.href')
          if (location == 'about:blank') {
            webview.loadUrl(url)
          }
        } catch (e) {
          webview.loadUrl(url)
        }
      })()
    }
  }, [nativeRef, activeTabIndex, index])

  const onLoad = async (e: { nativeEvent: any }) => {
    const { url, title } = e.nativeEvent
    if (url) {
      setPageUrl(url)
    }
  }

  const onMessage = async (e: { nativeEvent: { payload: string } }) => {
    const { type, payload } = JSON.parse(e.nativeEvent.payload)
    switch (type) {
      case 'scroll':
        onScroll(payload.scrollY)
        break
    }
  }

  const webview = webviewRef.current || nativeRef.current

  if (isWeb) {
    return (
      <View className="w-[25rem] shrink-0">
        <View className="flex-row items-center justify-between bg-zinc-800 pl-2">
          <ServiceIcon url={url} />
          <NouMenu
            trigger={<MaterialButton name="more-vert" />}
            items={[
              {
                label: 'Scroll to top',
                handler: () => webview?.executeJavaScript(`window.scrollTo(0, 0, {behavior: 'smooth'})`),
              },
              { label: 'Share', handler: () => share(pageUrlRef.current) },
              ...(tabs.length > 1 ? [{ label: 'Close', handler: () => tabs$.closeTab(index) }] : []),
            ]}
          />
        </View>
        {/*  @ts-expect-error ?? */}
        <NoraView className="h-full" ref={webviewRef} partition="persist:webview" useragent={userAgent} />
      </View>
    )
  }

  return (
    <NoraView
      // @ts-expect-error ??
      ref={nativeRef}
      className={clsx(index != activeTabIndex && 'hidden')}
      style={{ flex: 1, display: index == activeTabIndex ? 'flex' : 'none' }}
      scriptOnStart={contentJs}
      onLoad={onLoad}
      onMessage={onMessage}
    />
  )
}
