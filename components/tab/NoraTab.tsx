import { NoraView } from '@/modules/nora-view'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { settings$ } from '@/states/settings'
import { ActivityIndicator, Appearance, StyleSheet, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb, isIos, nIf } from '@/lib/utils'
import { Tab, tabs$ } from '@/states/tabs'
import { NouMenu } from '../menu/NouMenu'
import { MaterialButton } from '../button/IconButtons'
import { NouText } from '../NouText'
import { share } from '@/lib/share'
import { ServiceIcon } from '../service/Services'
import { getUserAgent } from '@/lib/useragent'
import { useContentJs } from '@/lib/hooks/useContentJs'
import { parseJson } from '@/content/utils'
import { NavModalContent } from '../modal/NavModal'
import { t } from 'i18next'
import { addBookmark } from '@/lib/bookmark'
import { getProfileColor } from '@/lib/profile'
import { getProfileViewKey } from '@/lib/profile-view'
import { executeWebviewJavaScript, executeWebviewJavaScriptQuietly } from '@/lib/webview'
import { getUserStylesSnapshot, userStyles$ } from '@/states/user-styles'

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

const buildImageViewerUrl = (imageUrl: string, theme: null | 'dark' | 'light') => {
  const escapedImageUrl = imageUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const resolvedTheme =
    theme ||
    (isWeb
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : Appearance.getColorScheme()) ||
    'dark'
  const colorScheme = resolvedTheme === 'light' ? 'light' : 'dark'
  const backgroundColor = resolvedTheme === 'light' ? '#f4f4f5' : '#09090b'
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Image</title>
    <style>
      :root { color-scheme: ${colorScheme}; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: 100%;
        min-height: 100vh;
        background: ${backgroundColor};
      }
      body {
        display: grid;
        place-items: center;
        padding: 16px;
      }
      img {
        display: block;
        max-width: 100%;
        max-height: calc(100vh - 32px);
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <img src="${escapedImageUrl}" alt="" />
  </body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

const isExternalAppUrl = (str: string) => {
  try {
    const scheme = new URL(str).protocol.replace(':', '').toLowerCase()
    return !['about', 'blob', 'data', 'file', 'http', 'https', 'javascript', 'nora'].includes(scheme)
  } catch {
    return false
  }
}

const onScroll = ({
  dy,
  y,
  autoHideHeader,
  hideToolbarWhenScrolled,
}: {
  dy?: number
  y?: number
  autoHideHeader: boolean
  hideToolbarWhenScrolled: boolean
}) => {
  if (hideToolbarWhenScrolled && typeof y === 'number') {
    ui$.headerShown.set(y <= 0)
    return
  }

  if (!autoHideHeader || typeof dy !== 'number') {
    return
  }

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

const parseWebviewMeta = (value?: string | null) => {
  const parsed = parseJson(value ?? null, {})
  if (typeof parsed === 'string') {
    return parseJson(parsed, {})
  }
  return parsed
}

const getTabLabel = (tab?: Pick<Tab, 'title' | 'url'> | null) => tab?.title || tab?.url || t('tabs.new')

export const NoraTab: React.FC<{
  tab: Tab
  index: number
  desktopVariant?: 'deck' | 'saved-view'
  slotSwitcher?: ReactNode
}> = ({ tab, index, desktopVariant = 'deck', slotSwitcher }) => {
  const autoHideHeader = useValue(settings$.autoHideHeader)
  const hideToolbarWhenScrolled = useValue(settings$.hideToolbarWhenScrolled)
  const inspectable = useValue(settings$.inspectable)
  const videoEdgeLongPressTo2x = useValue(settings$.videoEdgeLongPressTo2x)
  const xDefaultHomeTimeline = useValue(settings$.xDefaultHomeTimeline)
  const theme = useValue(settings$.theme)
  const userStyles = useValue(userStyles$)
  const nativeRef = useRef<any>(null)
  const webviewRef = useRef<WebviewTag>(null)
  const { activeTabIndex } = useValue(tabs$)
  const pageUrlRef = useRef('')
  const [canGoBack, setCanGoBack] = useState(false)
  const contentJs = useContentJs()
  const profileColor = getProfileColor(tab.profile)
  const isActive = activeTabIndex === index
  const viewKey = getProfileViewKey(tab)
  const viewInstanceKey = `${viewKey}:${tab.url ? 'page' : 'blank'}`
  const refreshCanGoBack = useCallback(
    async (target?: any) => {
      const webview = target || webviewRef.current || nativeRef.current
      if (!webview || typeof webview.canGoBack !== 'function') {
        return
      }

      let nextCanGoBack
      try {
        nextCanGoBack = await Promise.resolve(webview.canGoBack())
      } catch (err) {
        return
      }
      if (typeof nextCanGoBack !== 'boolean') {
        return
      }

      setCanGoBack(nextCanGoBack)
      if (isActive) {
        ui$.activeCanGoBack.set(nextCanGoBack)
      }
    },
    [isActive],
  )

  const setPageUrl = useCallback(
    (url: string) => {
      if (!url || url === 'about:blank') {
        return
      }
      pageUrlRef.current = url
      const tab$ = tabs$.tabs[index]
      if (tab$.get()) {
        tab$.url.set(url)
      }
    },
    [index],
  )

  const applyContentState = useCallback(
    (target?: WebviewTag | any | null) => {
      const webview = target || webviewRef.current || nativeRef.current
      const settingsScript = `window.Nora?.setSettings?.(${JSON.stringify({
        videoEdgeLongPressTo2x,
        xDefaultHomeTimeline,
      })})`
      const userStylesScript = `window.Nora?.setUserStyles?.(${JSON.stringify(getUserStylesSnapshot(userStyles))})`
      void executeWebviewJavaScriptQuietly(webview, settingsScript)
      void executeWebviewJavaScriptQuietly(webview, userStylesScript)
    },
    [userStyles, videoEdgeLongPressTo2x, xDefaultHomeTimeline],
  )

  const noraViewRef = useCallback(
    (webview: WebviewTag) => {
      webviewRef.current = webview
      if (!webview) {
        return
      }

      webview.addEventListener('dom-ready', () => {
        if (isActive || !ui$.webview.get()) {
          ui$.webview.set(ObservableHint.opaque(webview))
        }
        void executeWebviewJavaScript(webview, contentJs)
          .catch(() => {})
          .finally(() => applyContentState(webview))
        void refreshCanGoBack(webview)
      })
      webview.addEventListener('did-start-loading', () => {
        tabs$.setTabLoading(true, index)
      })
      webview.addEventListener('did-stop-loading', () => {
        tabs$.setTabLoading(false, index)
      })
      webview.addEventListener('did-fail-load', () => {
        tabs$.setTabLoading(false, index)
      })
      webview.addEventListener('did-fail-provisional-load', () => {
        tabs$.setTabLoading(false, index)
      })
      webview.addEventListener('did-navigate', (e) => {
        setPageUrl(e.url)
        void refreshCanGoBack(webview)
      })
      webview.addEventListener('did-navigate-in-page', (e) => {
        setPageUrl(e.url)
        void refreshCanGoBack(webview)
      })
      webview.addEventListener('page-favicon-updated', (e) => {
        tabs$.tabs[index].assign({ title: webview.getTitle(), icon: e.favicons.at(-1) })
      })
      webview.addEventListener('ipc-message', (e) => {})
    },
    [applyContentState, contentJs, index, refreshCanGoBack, setPageUrl],
  )

  const setActiveNativeWebview = useCallback(
    (webview: any) => {
      if (webview && nativeRef.current === webview && isActive) {
        ui$.webview.set(ObservableHint.opaque(webview))
        void refreshCanGoBack(webview)
      }
    },
    [isActive, refreshCanGoBack],
  )

  const clearActiveNativeWebview = useCallback((webview: any) => {
    if (ui$.webview.get() === webview) {
      ui$.webview.set(undefined)
    }
  }, [])

  useEffect(() => {
    const webview = webviewRef.current
    if (webview && tab.url && tab.url !== pageUrlRef.current) {
      webview.src = tab.url
      return
    }

    if (!tab.url) {
      return
    }

    const native = nativeRef.current
    if (!native || tab.url === pageUrlRef.current) {
      return
    }

    const timer = setTimeout(() => {
      if (nativeRef.current !== native || tab.url === pageUrlRef.current) {
        return
      }
      void Promise.resolve(native.loadUrl(tab.url)).catch((error) => {
        if (nativeRef.current !== native) {
          return
        }
        console.warn('[NoraTab] loadUrl failed', error)
      })
    }, 0)

    return () => clearTimeout(timer)
  }, [tab.url])

  useEffect(() => {
    pageUrlRef.current = ''
    setCanGoBack(false)
  }, [viewInstanceKey])

  useEffect(() => {
    const webview = nativeRef.current
    if (!webview) {
      return
    }
    setActiveNativeWebview(webview)
  }, [setActiveNativeWebview])

  useEffect(() => {
    if (!isWeb || !isActive || !webviewRef.current) {
      return
    }
    ui$.webview.set(ObservableHint.opaque(webviewRef.current))
    void refreshCanGoBack(webviewRef.current)
  }, [isActive, refreshCanGoBack])

  useEffect(() => {
    if (!isWeb) {
      return
    }

    const webview = webviewRef.current as any
    if (!webview || typeof webview.toggleHidden !== 'function') {
      return
    }

    webview.toggleHidden(!isActive || !tab.url)
  }, [isActive, tab.url, viewInstanceKey])

  useEffect(() => {
    if (!isActive) {
      return
    }
    ui$.activeCanGoBack.set(canGoBack)
  }, [canGoBack, isActive])

  useEffect(() => {
    applyContentState()
  }, [applyContentState])

  useEffect(() => {
    return () => {
      const webview = webviewRef.current as any
      if (webview && typeof webview.toggleHidden === 'function') {
        webview.toggleHidden(true)
      }

      const native = nativeRef.current
      clearActiveNativeWebview(native)
      if (isActive && ui$.webview.get() === native) {
        ui$.activeCanGoBack.set(false)
      }
    }
  }, [clearActiveNativeWebview, isActive])

  const onNativeRef = useCallback(
    (ref: any) => {
      const prevRef = nativeRef.current
      nativeRef.current = ref
      if (!ref) {
        clearActiveNativeWebview(prevRef)
        return
      }
      setActiveNativeWebview(ref)
    },
    [clearActiveNativeWebview, setActiveNativeWebview],
  )

  const webview = webviewRef.current || nativeRef.current
  const goBack = () => webview?.goBack?.()
  const reloadPage = () => {
    if (!webview) return
    if (typeof webview.reload === 'function') {
      webview.reload()
    } else {
      void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
    }
  }
  const toolbarButtonStyle = { padding: 4, height: 28 }

  const onLoad = async (e: { nativeEvent: any }) => {
    const { url, title, icon, canGoBack: nextCanGoBack } = e.nativeEvent
    const hasLoadedUrl = typeof url === 'string' && url !== '' && url !== 'about:blank'
    if (hasLoadedUrl) {
      tabs$.setTabLoading(false, index)
      setPageUrl(url)
    }
    if (typeof title === 'string' || typeof icon === 'string') {
      const nextMeta: Partial<Pick<Tab, 'title' | 'icon'>> = {}
      if (typeof title === 'string') {
        nextMeta.title = title
      }
      if (typeof icon === 'string') {
        nextMeta.icon = icon
      }
      tabs$.tabs[index].assign(nextMeta)
    }
    if (typeof nextCanGoBack === 'boolean') {
      setCanGoBack(nextCanGoBack)
      if (isActive) {
        ui$.activeCanGoBack.set(nextCanGoBack)
      }
    }
    applyContentState()
  }

  const onMessage = async (e: { nativeEvent: { payload: string | object } }) => {
    const { payload } = e.nativeEvent
    const { type, data } = typeof payload == 'string' ? JSON.parse(payload) : payload
    switch (type) {
      case '[content]':
      case '[kotlin]':
        console.log(type, data)
        break
      case 'icon': {
        const currentWebview = webviewRef.current || nativeRef.current
        const meta = parseWebviewMeta(
          (await executeWebviewJavaScript(currentWebview, 'window.Nora?.getMeta()')) as string | null | undefined,
        )
        if (meta.title || meta.icon) {
          tabs$.tabs[index].assign({ ...meta })
        }
        break
      }
      case 'new-tab':
        if (!isExternalAppUrl(data.url)) {
          const nextUrl = data.kind === 'image' ? buildImageViewerUrl(data.url, theme) : forceHttps(data.url)
          tabs$.openTab(nextUrl, { parentTabId: tab.id, source: 'child' })
        }
        break
      case 'save-file':
        webview?.saveFile(data.content, data.fileName, data.mimeType)
        break
      case 'scroll':
        onScroll({ dy: data.dy, y: data.y, autoHideHeader, hideToolbarWhenScrolled })
        break
      default:
        console.log('onMessage', type, data)
        break
    }
  }

  const deckTabWidth = useValue(settings$.deckTabWidth)

  if (isWeb) {
    return (
      <View
        className={clsx('flex h-full min-h-0 min-w-0 flex-col', desktopVariant === 'deck' ? 'shrink-0' : 'w-full')}
        style={desktopVariant === 'deck' ? { width: deckTabWidth } : undefined}
      >
        <View
          className="flex-row items-center justify-between gap-2 bg-zinc-800 pl-2 pr-1"
          style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36 }}
        >
          <View className="flex-row items-center gap-2 shrink-0">
            <ServiceIcon url={tab.url} icon={tab.icon} />
            {nIf(tab.isLoading, <ActivityIndicator size="small" color="#a1a1aa" />)}
            {nIf(canGoBack, <MaterialButton name="arrow-back" onPress={goBack} style={toolbarButtonStyle} />)}
          </View>
          <View className="flex-1 min-w-0 flex-row items-center justify-center">
            {slotSwitcher || (
              <NouText
                className="text-[11px] font-bold text-zinc-500 tracking-wider text-center px-2"
                numberOfLines={1}
              >
                {getTabLabel(tab)}
              </NouText>
            )}
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
                handler: () => {
                  void executeWebviewJavaScriptQuietly(webview, `window.scrollTo(0, 0, {behavior: 'smooth'})`)
                },
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
          className={clsx('flex-1', !tab.url && 'hidden')}
          ref={noraViewRef}
          partition={`persist:${tab.profile || 'default'}`}
          useragent={getUserAgent(window.electron.process.platform, true)}
          inspectable={inspectable}
          allowpopups="true"
          key={viewInstanceKey}
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
        key={viewInstanceKey}
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
