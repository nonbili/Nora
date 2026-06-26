import { useTabContextMenuItems } from '@/lib/hooks/useTabContextMenuItems'
import { NoraView } from '@/modules/nora-view'
import { useObserveEffect, useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { settings$, resolveZoom } from '@/states/settings'
import { ActivityIndicator, Appearance, Pressable, StyleSheet, View, useColorScheme } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb, isIos, nIf, getHostFromUrl } from '@/lib/utils'
import { Tab, tabs$ } from '@/states/tabs'
import { NouContextMenu } from '../menu/NouContextMenu'
import { MaterialButton } from '../button/IconButtons'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { NouText } from '../NouText'
import { ServiceIcon } from '../service/Services'
import { getUserAgent } from '@/lib/useragent'
import { useContentJs } from '@/lib/hooks/useContentJs'
import { parseJson } from '@/content/utils'
import { NavModalContent } from '../modal/NavModal'
import { handleShortcuts } from '@/desktop/src/renderer/lib/shortcuts'
import { t } from 'i18next'
import { getProfileColor } from '@/lib/profile'
import { getProfileViewKey } from '@/lib/profile-view'
import { executeWebviewJavaScript, executeWebviewJavaScriptQuietly, registerTabWebview } from '@/lib/webview'
import { getUserStylesSnapshot, userStyles$ } from '@/states/user-styles'
import { getEnabledUserScripts } from '@/lib/user-styles'
import { DECK_VIEW_ID, savedViews$ } from '@/states/saved-views'
import { tabGroups$ } from '@/states/tab-groups'
import { blocklistMatcherRevision$, getCosmeticCssForHost, loadCosmeticFilters } from '@/lib/blocklist'
import { blocklist$ } from '@/states/blocklist'

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

const buildUserScriptRunner = (host: string) => {
  const scripts = getEnabledUserScripts(host, getUserStylesSnapshot())
  if (!scripts.length) {
    return ''
  }

  const calls = scripts
    .map(
      (script) => `
        run(${JSON.stringify(script.id)}, ${JSON.stringify(script.name)}, function() {
          ${script.js}
        });
      `,
    )
    .join('\n')

  return `
    (() => {
      window.__noraRanUserScriptIds = window.__noraRanUserScriptIds || new Set();
      const run = (id, name, fn) => {
        if (window.__noraRanUserScriptIds.has(id)) return;
        window.__noraRanUserScriptIds.add(id);
        try {
          fn.call(window);
        } catch (error) {
          console.error('[Nora user script] ' + name, error);
        }
      };
      ${calls}
    })();
  `
}

export const NoraTab: React.FC<{
  tab: Tab
  index: number
  isActive?: boolean
  desktopVariant?: 'deck' | 'saved-view' | 'single'
  slotSwitcher?: ReactNode
}> = ({ tab, index, isActive = false, desktopVariant = 'deck', slotSwitcher }) => {
  const autoHideHeader = useValue(settings$.autoHideHeader)
  const hideToolbarWhenScrolled = useValue(settings$.hideToolbarWhenScrolled)
  const inspectable = useValue(settings$.inspectable)
  const videoEdgeLongPressTo2x = useValue(settings$.videoEdgeLongPressTo2x)
  const xDefaultHomeTimeline = useValue(settings$.xDefaultHomeTimeline)
  const theme = useValue(settings$.theme)
  const colorScheme = useColorScheme()
  const host = tab.url ? getHostFromUrl(tab.url) : ''
  const defaultZoom = useValue(settings$.defaultZoom)
  const siteZoom = useValue(settings$.siteZoom)
  const resolvedZoom = resolveZoom(host, siteZoom, defaultZoom)
  const nativeRef = useRef<any>(null)
  const webviewRef = useRef<WebviewTag | null>(null)
  const attachedWebviewsRef = useRef<WeakSet<WebviewTag>>(new WeakSet())
  const webviewListenersRef = useRef<AbortController | null>(null)
  const pageUrlRef = useRef('')
  const loadingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const contentJs = useContentJs()
  const contentJsRef = useRef(contentJs)
  const isActiveRef = useRef(isActive)
  const profileColor = getProfileColor(tab.profile)
  const viewKey = getProfileViewKey(tab)
  const viewInstanceKey = `${viewKey}:${tab.url ? 'page' : 'blank'}`

  useEffect(() => {
    contentJsRef.current = contentJs
  }, [contentJs])

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

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
      if (isActiveRef.current) {
        ui$.activeCanGoBack.set(nextCanGoBack)
      }
    },
    [],
  )

  const setPageUrl = useCallback(
    (url: string) => {
      if (!url || url === 'about:blank') {
        return
      }
      pageUrlRef.current = url
      const currentIndex = tabs$.tabs.get().findIndex((currentTab) => currentTab?.id === tab.id)
      const tab$ = currentIndex === -1 ? undefined : tabs$.tabs[currentIndex]
      if (tab$?.get()) {
        tab$.url.set(url)
      }
    },
    [tab.id],
  )

  const setTabLoading = useCallback(
    (loading: boolean) => {
      if (!loading && loadingWatchdogRef.current) {
        clearTimeout(loadingWatchdogRef.current)
        loadingWatchdogRef.current = null
      }
      const currentIndex = tabs$.tabs.get().findIndex((currentTab) => currentTab?.id === tab.id)
      if (currentIndex !== -1) {
        tabs$.setTabLoading(loading, currentIndex)
      }
    },
    [tab.id],
  )

  const applyContentState = useCallback(
    async (target?: WebviewTag | any | null, url?: string) => {
      const webview = target || webviewRef.current || nativeRef.current
      const currentUrl = url || pageUrlRef.current || tab.url
      const currentHost = getHostFromUrl(currentUrl)
      await loadCosmeticFilters()
      const settingsScript = `window.Nora?.setSettings?.(${JSON.stringify({
        videoEdgeLongPressTo2x,
        xDefaultHomeTimeline,
        cosmeticCss: getCosmeticCssForHost(currentHost),
      })})`
      const userStylesScript = `window.Nora?.setUserStyles?.(${JSON.stringify(getUserStylesSnapshot())})`
      void executeWebviewJavaScriptQuietly(webview, settingsScript)
      void executeWebviewJavaScriptQuietly(webview, userStylesScript)
      const userScriptRunner = buildUserScriptRunner(currentHost)
      if (userScriptRunner) {
        void executeWebviewJavaScriptQuietly(webview, userScriptRunner)
      }
    },
    [tab.url, videoEdgeLongPressTo2x, xDefaultHomeTimeline],
  )
  const applyContentStateRef = useRef(applyContentState)

  useEffect(() => {
    applyContentStateRef.current = applyContentState
  }, [applyContentState])

  const noraViewRef = useCallback(
    (webview: WebviewTag | null) => {
      const prevWebview = webviewRef.current
      registerTabWebview(tab.id, webview)
      webviewRef.current = webview
      if (!webview) {
        // The webview is detaching (unmount, or profile switch remount via key change).
        // Tear down its listeners so they don't accumulate on the next mount, and drop
        // the active-webview reference if it pointed at this element — otherwise toolbar
        // and script actions would target a destroyed webview.
        webviewListenersRef.current?.abort()
        webviewListenersRef.current = null
        if (prevWebview) {
          attachedWebviewsRef.current.delete(prevWebview)
          if (ui$.webview.get() === prevWebview) {
            ui$.webview.set(undefined)
            ui$.activeCanGoBack.set(false)
          }
        }
        return
      }

      // Load the URL as soon as the webview mounts. This also covers resuming a paused
      // tab: pausing unmounts the webview, so on resume a fresh element mounts here and
      // must reload. Read the URL from the store (not the captured prop) so a resume
      // after a navigation still loads the right page, and seed pageUrlRef so the
      // tab.url effect below doesn't double-load.
      const currentUrl = tabs$.tabs.get().find((currentTab) => currentTab?.id === tab.id)?.url
      if (currentUrl && currentUrl !== pageUrlRef.current) {
        webview.src = currentUrl
        pageUrlRef.current = currentUrl
      }

      if (attachedWebviewsRef.current.has(webview)) {
        return
      }
      attachedWebviewsRef.current.add(webview)

      const controller = new AbortController()
      webviewListenersRef.current = controller
      // The Electron WebviewTag typings only expose `useCapture`, but the underlying DOM
      // addEventListener supports the options object (incl. `signal`) at runtime. Route
      // through a typed helper so aborting the controller removes every listener at once,
      // preventing them from piling up across remounts (e.g. profile switches).
      const on = <E extends Event = Event>(event: string, handler: (e: E) => void) => {
        ;(webview as HTMLElement).addEventListener(event, handler as EventListener, {
          signal: controller.signal,
        })
      }

      on('dom-ready', () => {
        if (isActiveRef.current || !ui$.webview.get()) {
          ui$.webview.set(ObservableHint.opaque(webview))
        }
        void executeWebviewJavaScript(webview, contentJsRef.current)
          .catch(() => {})
          .finally(() => applyContentStateRef.current(webview))
        void refreshCanGoBack(webview)
      })
      on('did-start-loading', () => {
        setTabLoading(true)
        if (loadingWatchdogRef.current) {
          clearTimeout(loadingWatchdogRef.current)
        }
        loadingWatchdogRef.current = setTimeout(() => {
          if (typeof webview.isLoading === 'function' && !webview.isLoading()) {
            setTabLoading(false)
          }
        }, 3000)
      })
      on('did-stop-loading', () => {
        setTabLoading(false)
      })
      on('did-finish-load', () => {
        setTabLoading(false)
      })
      on('did-fail-load', () => {
        setTabLoading(false)
      })
      on('did-fail-provisional-load', () => {
        setTabLoading(false)
      })
      on<Electron.DidNavigateEvent>('did-navigate', (e) => {
        setPageUrl(e.url)
        applyContentStateRef.current(webview, e.url)
        void refreshCanGoBack(webview)
      })
      on<Electron.DidNavigateInPageEvent>('did-navigate-in-page', (e) => {
        setPageUrl(e.url)
        applyContentStateRef.current(webview, e.url)
        setTabLoading(false)
        void refreshCanGoBack(webview)
      })
      on<Electron.PageFaviconUpdatedEvent>('page-favicon-updated', (e) => {
        const currentIndex = tabs$.tabs.get().findIndex((currentTab) => currentTab?.id === tab.id)
        if (currentIndex !== -1) {
          tabs$.tabs[currentIndex].assign({ title: webview.getTitle(), icon: e.favicons.at(-1) })
        }
      })
      on('before-input-event', (rawEvent) => {
        const e = rawEvent as unknown as { input: Electron.Input }
        if (e.input.type === 'keyDown') {
          if ((e.input.meta || e.input.control) && e.input.key.toLowerCase() === 'r') {
            if (typeof webview.reload === 'function') {
              webview.reload()
            } else {
              void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
            }
          } else {
            handleShortcuts(e.input)
          }
        }
      })
      on('ipc-message', () => {})
      on<Electron.UpdateTargetUrlEvent>('update-target-url', (e) => {
        ui$.hoverLinkUrl.set(e.url || '')
      })
    },
    [refreshCanGoBack, setPageUrl, setTabLoading, tab.id],
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
    if (!isActive) {
      return
    }
    ui$.activeCanGoBack.set(canGoBack)
  }, [canGoBack, isActive])

  useEffect(() => {
    applyContentState()
  }, [applyContentState])

  useObserveEffect(userStyles$, () => applyContentState())
  useObserveEffect(blocklist$, () => applyContentState())
  useObserveEffect(blocklistMatcherRevision$, () => applyContentState())

  useEffect(() => {
    return () => {
      if (loadingWatchdogRef.current) {
        clearTimeout(loadingWatchdogRef.current)
        loadingWatchdogRef.current = null
      }
      registerTabWebview(tab.id, null)
      const native = nativeRef.current
      clearActiveNativeWebview(native)
      if (isActive && ui$.webview.get() === native) {
        ui$.activeCanGoBack.set(false)
      }
    }
  }, [clearActiveNativeWebview, isActive, tab.id])

  const onNativeRef = useCallback(
    (ref: any) => {
      const prevRef = nativeRef.current
      nativeRef.current = ref
      if (!ref) {
        clearActiveNativeWebview(prevRef)
        registerTabWebview(tab.id, null)
        return
      }
      registerTabWebview(tab.id, ref)
      setActiveNativeWebview(ref)
    },
    [clearActiveNativeWebview, setActiveNativeWebview, tab.id],
  )

  const getCurrentWebview = () => webviewRef.current || nativeRef.current
  const goBack = () => getCurrentWebview()?.goBack?.()
  const toolbarButtonStyle = { padding: 4, height: 28 }

  const onLoad = async (e: { nativeEvent: any }) => {
    const { url, title, icon, canGoBack: nextCanGoBack } = e.nativeEvent
    const hasLoadedUrl = typeof url === 'string' && url !== '' && url !== 'about:blank'
    if (hasLoadedUrl) {
      setTabLoading(false)
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
    applyContentState(undefined, hasLoadedUrl ? url : undefined)
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
      case 'open-in-profile':
        if (!isExternalAppUrl(data.url)) {
          ui$.profileLinkUrl.set(forceHttps(data.url))
        }
        break
      case 'save-file':
        getCurrentWebview()?.saveFile(data.content, data.fileName, data.mimeType)
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
  const activeViewId = useValue(savedViews$.activeViewId)
  const savedViews = useValue(savedViews$.savedViews)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)
  const activeViewLayout =
    activeViewId === DECK_VIEW_ID ? 'deck' : savedViews.find((view) => view.id === activeViewId)?.layout
  const activeGroupLayout = activeGroupId ? groups.find((group) => group.id === activeGroupId)?.layout : undefined
  const canDuplicate = (activeGroupLayout || activeViewLayout) !== 'grid-4'

  const menuItems = useTabContextMenuItems(tab, {
    runWebviewAction: (action) => {
      const webview = webviewRef.current || nativeRef.current
      if (webview) action(webview)
    },
    canDuplicate,
  })

  if (isWeb) {
    return (
      <View
        className={clsx(
          'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-md shadow-zinc-900/10 dark:bg-zinc-900',
          isActive
            ? 'border-indigo-400/60 ring-2 ring-indigo-500/10 dark:border-indigo-400/50'
            : 'border-zinc-300 dark:border-zinc-800',
          desktopVariant === 'deck' ? 'shrink-0' : 'w-full',
        )}
        style={desktopVariant === 'deck' ? { width: deckTabWidth } : undefined}
      >
        <NouContextMenu items={menuItems}>
          <View
            className={clsx(
              'flex-row items-center justify-between gap-2 pl-2 pr-1 border-b',
              isActive
                ? 'bg-indigo-100 border-indigo-200 dark:bg-indigo-400/30 dark:border-indigo-300/50'
                : 'bg-zinc-50 border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700/50',
            )}
            style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36 }}
          >
            <View className="flex-row items-center gap-2 shrink-0">
              {nIf(canGoBack, <MaterialButton name="arrow-back" onPress={goBack} style={toolbarButtonStyle} />)}
            </View>
            <View className="flex-1 min-w-0 flex-row items-center justify-center">
              {slotSwitcher || (
                <div title={tab.url || undefined} style={{ display: 'flex', minWidth: 0, maxWidth: '100%' }}>
                  <View className="min-w-0 max-w-full flex-row items-center justify-center gap-2 px-2">
                    <View
                      className="shrink-0"
                      style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                    >
                      {tab.isPaused ? (
                        <MaterialIcons name="pause-circle-filled" size={16} color="#a1a1aa" />
                      ) : tab.isLoading ? (
                        <ActivityIndicator size="small" color="#a1a1aa" />
                      ) : (
                        <ServiceIcon url={tab.url} icon={tab.icon} />
                      )}
                    </View>
                    <NouText
                      className={clsx(
                        'min-w-0 flex-1 text-[11px] font-bold tracking-wider text-center',
                        isActive ? 'text-zinc-600 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400',
                      )}
                      numberOfLines={1}
                    >
                      {getTabLabel(tab)}
                    </NouText>
                  </View>
                </div>
              )}
            </View>
            <View className="rounded hover:bg-zinc-300/70 dark:hover:bg-zinc-700/70">
              <MaterialButton name="close" onPress={() => tabs$.closeTab(index)} style={toolbarButtonStyle} size={16} />
            </View>
          </View>
        </NouContextMenu>
        {tab.isPaused ? (
          <View className="flex-1 min-h-0 items-center justify-center gap-3 px-6">
            <MaterialIcons name="pause-circle-outline" size={40} color="#a1a1aa" />
            <NouText className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {t('tabs.paused')}
            </NouText>
            <NouText className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              {t('tabs.pausedHint')}
            </NouText>
            <Pressable
              className="mt-2 flex-row items-center gap-1 rounded-full bg-indigo-500 px-4 py-2 hover:bg-indigo-600 active:bg-indigo-600"
              onPress={() => tabs$.setTabPaused(false, index)}
            >
              <MaterialIcons name="play-arrow" size={16} color="#ffffff" />
              <NouText className="text-xs font-semibold" style={{ color: '#ffffff' }}>
                {t('tabs.resume')}
              </NouText>
            </Pressable>
          </View>
        ) : (
          <NoraView
            className={clsx('flex-1', !tab.url && 'hidden')}
            ref={noraViewRef}
            partition={`persist:${tab.profile || 'default'}`}
            useragent={getUserAgent(window.electron.process.platform, true)}
            inspectable={inspectable}
            allowpopups="true"
            key={viewInstanceKey}
            textZoom={resolvedZoom}
          />
        )}
        {nIf(
          !tab.url,
          <View className="flex-1 min-h-0">
            <NavModalContent index={index} />
          </View>,
        )}
      </View>
    )
  }

  return (
    <View
      pointerEvents={isActive ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        opacity: isActive ? 1 : 0,
        zIndex: isActive ? 1 : 0,
      }}
    >
      <NoraView
        key={viewInstanceKey}
        ref={onNativeRef}
        className={clsx(!tab.url && 'hidden')}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
        profile={tab.profile || 'default'}
        scriptOnStart={contentJs}
        useragent={getUserAgent(isIos ? 'ios' : 'android', tab.desktopMode)}
        onLoad={onLoad}
        onMessage={onMessage}
        inspectable={inspectable}
        textZoom={resolvedZoom}
      />
      {nIf(!tab.url && isActive, <NavModalContent index={index} />)}
    </View>
  )
}
