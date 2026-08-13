import { ActivityIndicator, Dimensions, View, Text, TouchableOpacity, LayoutChangeEvent, useColorScheme } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons'
import React, { useCallback, useEffect, useRef } from 'react'
import Drawer from 'expo-router/drawer'
import { useValue, useObserve } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { removeTrackingParams } from '@/lib/page'
import { settings$, resolveZoom } from '@/states/settings'
import { colors } from '@/lib/colors'
import { SettingsModal } from '../modal/SettingsModal'
import { NouMenu } from '../menu/NouMenu'
import { isWeb, isIos, isAndroid, nIf, clsx } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { MaterialButton, MaterialCommunityButton } from '../button/IconButtons'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import type { SharedValue } from 'react-native-reanimated'
import NoraViewModule from '@/modules/nora-view'
import { share } from '@/lib/share'
import { isDirectlyDownloadable } from '@/content/download'
import { t } from 'i18next'
import { bookmarks$ } from '@/states/bookmarks'
import { showToast } from '@/lib/toast'
import { Directions, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { executeWebviewJavaScriptQuietly, getTabWebview, reloadWebview, scrollWebviewToTop } from '@/lib/webview'
import { openTabForActiveDesktopView } from '@/lib/desktop-view-actions'
import { DesktopTabsSidebar } from '../view/DesktopTabsSidebar'
import { ServiceIcon } from '../service/Services'
import { Tooltip } from '../tooltip/Tooltip'
import { userStyles$ } from '@/states/user-styles'
import { buildUserScriptExecutionSource, matchesAnyHostGlob, type CustomUserScript } from '@/lib/user-styles'
import { useHeaderAnimation } from './header-animation'

const webAnimatedHelpers = {
  useSharedValueSafe: (initial: number) => ({ value: initial }) as SharedValue<number>,
}

const nativeAnimatedHelpers = !isWeb
  ? (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Reanimated = require('react-native-reanimated')
      return {
        useSharedValueSafe: Reanimated.useSharedValue as (initial: number) => SharedValue<number>,
      }
    })()
  : null

function prevTab() {
  const activeIndex = tabs$.activeTabIndex.get()
  const newIndex = activeIndex > 0 ? activeIndex - 1 : tabs$.tabs.length - 1
  tabs$.setActiveTabIndex(newIndex, 'user')
}

function nextTab() {
  const activeIndex = tabs$.activeTabIndex.get()
  const newIndex = activeIndex < tabs$.tabs.length - 1 ? activeIndex + 1 : 0
  tabs$.setActiveTabIndex(newIndex, 'user')
}

export const NouHeader: React.FC<{}> = ({}) => {
  const headerShown = useValue(ui$.headerShown)
  const headerHeight = useValue(ui$.headerHeight)
  const urlModalOpen = useValue(ui$.urlModalOpen)
  const downloadVideoModalUrl = useValue(ui$.downloadVideoModalUrl)
  const tabModalOpen = useValue(ui$.tabModalOpen)
  const toolsModalOpen = useValue(ui$.toolsModalOpen)
  const settingsModalOpen = useValue(ui$.settingsModalOpen)

  const autoHideHeader = useValue(settings$.autoHideHeader)
  const doubleTapToToggleHeader = useValue(settings$.doubleTapToToggleHeader)
  const hideToolbarWhenScrolled = useValue(settings$.hideToolbarWhenScrolled)
  const headerPosition = useValue(settings$.headerPosition)
  const showNewTabButtonInHeader = useValue(settings$.showNewTabButtonInHeader)
  const showBackButtonInHeader = useValue(settings$.showBackButtonInHeader)
  const showForwardButtonInHeader = useValue(settings$.showForwardButtonInHeader)
  const showReloadButtonInHeader = useValue(settings$.showReloadButtonInHeader)
  const showScrollButtonInHeader = useValue(settings$.showScrollButtonInHeader)
  const sidebarCollapsedValue = useValue(settings$.sidebarCollapsed)
  const sidebarCollapsed = isWeb && sidebarCollapsedValue

  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const headerControlColor = isDark ? colors.icon : colors.iconLightStrong

  const tabsCount = useValue(() => tabs$.tabs.length)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const recentlyClosedTabs = useValue(tabs$.recentlyClosedTabs)
  const currentTab = useValue(tabs$.currentTab)
  const customScripts = useValue(userStyles$.customScripts).filter((script): script is CustomUserScript => Boolean(script))
  const webview = useValue(ui$.webview)
  const { useSharedValueSafe } = isWeb ? webAnimatedHelpers : nativeAnimatedHelpers!
  const flingStart = useSharedValueSafe(0)
  const panStart = useSharedValueSafe(0)
  let hostname = '',
    host = '',
    pathname = '',
    canDownload = false

  const defaultZoom = useValue(settings$.defaultZoom)
  const siteZoom = useValue(settings$.siteZoom)

  if (currentTab?.url) {
    try {
      const url = new URL(currentTab.url)
      hostname = url.hostname
      host = url.host
      pathname = url.pathname
      canDownload = isDirectlyDownloadable(currentTab.url)
    } catch (e) {}
  }

  const isFacebookMessenger = hostname.endsWith('.facebook.com') && (pathname === '/messages' || pathname.startsWith('/messages/'))
  const hideDesktopSiteToggle = isFacebookMessenger || hostname.endsWith('.tiktok.com')

  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    if (Math.abs(ui$.headerHeight.get() - height) < 1) {
      return
    }
    ui$.headerHeight.set(height)
  }

  // Resolve when the handler runs, not when the header renders. On a tab switch the
  // header re-renders for the new activeTabIndex *before* NoraTab's effect assigns
  // ui$.webview, so a render-time value is one tab behind for that commit. The per-tab
  // registry is keyed by tab id and is already correct at that point.
  const activeWebview = () => getTabWebview(tabs$.currentTab()?.id || '') || webview

  const scrollToTop = () => {
    void scrollWebviewToTop(activeWebview())
  }
  const reloadPage = () => {
    reloadWebview(activeWebview(), currentTab?.url)
  }
  const goForward = () => {
    const target = activeWebview()
    if (typeof target?.goForward === 'function') {
      target.goForward()
      return
    }
    void executeWebviewJavaScriptQuietly(target, 'history.forward()')
  }

  const addBookmark = () => {
    if (currentTab?.url) {
      bookmarks$.addBookmark({
        url: currentTab.url,
        title: currentTab.title || '',
        icon: currentTab.icon || '',
      })
      showToast(t('toast.pinned'))
    }
  }

  const editTabUrl = () => {
    ui$.assign({
      urlModalOpen: true,
      urlModalMode: 'editTab',
      urlModalTargetTabId: currentTab?.id || null,
    })
  }
  const handleBack = () => {
    tabs$.handleBackPress()
  }

  const { Root, style: animatedHeaderStyle } = useHeaderAnimation({
    autoHideHeader,
    doubleTapToToggleHeader: isAndroid && doubleTapToToggleHeader,
    headerHeight,
    headerPosition,
    headerShown,
    hideToolbarWhenScrolled,
  })

  const hideableHeader = autoHideHeader || hideToolbarWhenScrolled || (isAndroid && doubleTapToToggleHeader)
  // On native the hide animation belongs to the absolute overlay below, not to the header
  // itself: the overlay keeps its frame over the top of the page while the header slides
  // out from under it, and the gesture root swallows every touch that lands in that frame
  // regardless of pointerEvents. Move the whole overlay instead so nothing is left behind.
  const HeaderRoot = isWeb ? Root : View

  const toggleSidebar = () => settings$.sidebarCollapsed.set(!settings$.sidebarCollapsed.get())
  const pinnedScripts = customScripts
    .filter((script) => script.enabled && script.pinToHeader && script.js.trim())
    .filter((script) => hostname && matchesAnyHostGlob(hostname, script.hostGlobs))
    .map((script) => ({ ...script, js: script.js.trim() }))

  const runPinnedScript = (script: (typeof pinnedScripts)[number]) => {
    void executeWebviewJavaScriptQuietly(activeWebview(), buildUserScriptExecutionSource(script))
  }

  const ret = (
    <HeaderRoot
      pointerEvents={isWeb ? 'auto' : (headerShown ? 'auto' : 'none')}
      className={clsx(
        'bg-zinc-100 dark:bg-zinc-800 flex-row items-center justify-between py-1',
        isWeb ? 'px-2' : 'px-3',
        isWeb && (sidebarCollapsed
          ? 'lg:w-[56px] lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:bg-zinc-100 lg:px-0 lg:py-0 lg:border-r lg:border-zinc-200 dark:lg:bg-zinc-900 dark:lg:border-zinc-800'
          : 'lg:w-[280px] lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:bg-zinc-100 lg:px-0 lg:py-0 lg:border-r lg:border-zinc-200 dark:lg:bg-zinc-900 dark:lg:border-zinc-800'),
      )}
      style={isWeb ? animatedHeaderStyle : undefined}
      onLayout={onLayout}
    >
      {nIf(
        !isWeb,
        <View className="flex-row items-center gap-3">
          {nIf(showNewTabButtonInHeader, <MaterialButton name="add" size={22} color={headerControlColor} onPress={() => tabs$.openTab('')} />)}
          {nIf(showBackButtonInHeader, <MaterialButton name="arrow-back" size={22} color={headerControlColor} onPress={handleBack} />)}
          {nIf(showForwardButtonInHeader, <MaterialButton name="arrow-forward" size={22} color={headerControlColor} onPress={goForward} />)}
          {nIf(showReloadButtonInHeader, <MaterialButton name="refresh" size={22} color={headerControlColor} onPress={reloadPage} />)}
          {nIf(showScrollButtonInHeader, <MaterialButton name="arrow-upward" color={headerControlColor} onPress={scrollToTop} />)}
        </View>,
      )}
      {nIf(
        isWeb && !sidebarCollapsed,
        <View className="lg:flex-row lg:items-center lg:justify-end lg:px-1 lg:pt-1">
          <Tooltip title={t('buttons.toggleSidebar')}>
            <MaterialButton name="chevron-left" color={headerControlColor} onPress={toggleSidebar} />
          </Tooltip>
        </View>,
      )}
      {nIf(
        isWeb && !sidebarCollapsed,
        <View className="min-w-0 lg:w-full lg:flex-1 lg:min-h-0">
          <DesktopTabsSidebar />
        </View>,
      )}
      {nIf(
        sidebarCollapsed,
        <View className="lg:flex-row lg:items-center lg:justify-center lg:pt-2">
          <Tooltip title={t('buttons.toggleSidebar')}>
            <MaterialButton name="chevron-right" color={headerControlColor} onPress={toggleSidebar} />
          </Tooltip>
        </View>,
      )}
      {nIf(
        sidebarCollapsed,
        <View className="min-w-0 lg:w-full lg:flex-1 lg:min-h-0">
          <DesktopTabsSidebar collapsed />
        </View>,
      )}
      <View
        className={clsx(
          'flex-row items-center justify-end gap-1',
          isWeb && !sidebarCollapsed && 'lg:w-full lg:flex-row lg:items-center lg:justify-center lg:border-t lg:border-zinc-200 lg:bg-zinc-100 lg:p-2 dark:lg:border-zinc-800 dark:lg:bg-zinc-900',
          isWeb && sidebarCollapsed && 'lg:w-full lg:flex-col lg:items-center lg:justify-center lg:gap-1 lg:border-t lg:border-zinc-200 lg:bg-zinc-100 lg:p-2 dark:lg:border-zinc-800 dark:lg:bg-zinc-900',
        )}
      >
        {nIf(
          pinnedScripts.length === 1,
          (() => {
            const script = pinnedScripts[0]
            return (
              <Tooltip title={script?.name}>
                <MaterialCommunityButton name="puzzle-outline" color={headerControlColor} onPress={() => runPinnedScript(script)} />
              </Tooltip>
            )
          })(),
        )}
        {nIf(
          pinnedScripts.length > 1,
          <Tooltip title={t('settings.userStyles.scripts.pinnedScripts')}>
            <NouMenu
              triggerColor={headerControlColor}
              trigger={
                <View className="p-[10px]">
                  <MaterialCommunityIcons name="puzzle-outline" size={24} color={headerControlColor} />
                </View>
              }
              items={pinnedScripts.map((script) => ({
                label: script.name,
                icon: <MaterialIcons name="code" size={18} color={headerControlColor} />,
                systemImage: 'chevron.left.forwardslash.chevron.right',
                handler: () => runPinnedScript(script),
              }))}
            />
          </Tooltip>,
        )}
        {nIf(
          !isIos && canDownload,
          (() => {
            const downloadButton = <MaterialButton name="download" color={headerControlColor} onPress={() => ui$.downloadVideoModalUrl.set(currentTab?.url || '')} />
            return <Tooltip title={t('modals.downloadVideo')}>{downloadButton}</Tooltip>
          })(),
        )}
        {nIf(
          !isWeb && currentTab?.isLoading,
          <ActivityIndicator size="small" color={headerControlColor} style={{ marginRight: 4 }} />,
        )}
        {nIf(
          !isWeb,
          <TouchableOpacity className="flex-row items-center p-3" onPress={() => ui$.tabModalOpen.set(true)}>
            <View
              className="rounded-md px-2 py-1 border"
              style={{ borderColor: headerControlColor, borderWidth: isDark ? 1 : 1.25 }}
            >
              <NouText className="text-xs font-semibold" style={{ color: headerControlColor }}>{tabsCount}</NouText>
            </View>
          </TouchableOpacity>,
        )}
        {nIf(
          isWeb && recentlyClosedTabs.length > 0,
          <Tooltip title={t('buttons.restoreTabs')}>
            <NouMenu
              trigger={<MaterialButton name="restore" color={headerControlColor} />}
              items={[
                ...recentlyClosedTabs.map((tab) => ({
                  label: tab.title || tab.url || t('tabs.new'),
                  description: tab.title && tab.url && tab.title !== tab.url ? tab.url : undefined,
                  icon: <ServiceIcon url={tab.url} icon={tab.icon} />,
                  trailing: (
                    <TouchableOpacity
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('tabs.removeFromHistory')}
                      onPress={(e) => {
                        e?.stopPropagation?.()
                        tabs$.removeClosedTab(tab.id)
                      }}
                    >
                      <MaterialIcons name="close" size={16} color={colors.iconSubtle} />
                    </TouchableOpacity>
                  ),
                  handler: () => tabs$.reopenClosedTab(tab.id),
                })),
                { label: '', handler: () => {}, kind: 'separator' as const },
                {
                  label: t('tabs.clearRecentlyClosed'),
                  icon: <MaterialIcons name="delete-outline" size={18} color={colors.iconSubtle} />,
                  handler: () => tabs$.clearRecentlyClosedTabs(),
                },
              ]}
            />
          </Tooltip>,
        )}
        {(() => {
          const moreMenu = (
          <NouMenu
            triggerColor={headerControlColor}
            trigger={
              isIos
                ? 'ellipsis'
                : <MaterialButton name="more-vert" color={headerControlColor} />
            }
            items={[
              ...(isWeb
                ? []
                : [
                    {
                      label: t('menus.reload'),
                      icon: <MaterialIcons name="refresh" size={18} color={headerControlColor} />,
                      systemImage: 'arrow.clockwise',
                      handler: reloadPage,
                    },
                    {
                      label: t('menus.scroll'),
                      icon: <MaterialIcons name="vertical-align-top" size={18} color={headerControlColor} />,
                      systemImage: 'arrow.up.to.line',
                      handler: scrollToTop,
                    },
                    {
                      label: t('menus.editUrl'),
                      icon: <MaterialIcons name="edit" size={18} color={headerControlColor} />,
                      systemImage: 'pencil',
                      handler: editTabUrl,
                    },
                    ...(hideDesktopSiteToggle
                      ? []
                      : [
                          {
                            label: t('menus.desktop'),
                            icon: <MaterialIcons name="desktop-windows" size={18} color={headerControlColor} />,
                            systemImage: 'desktopcomputer',
                            metaLabel: currentTab?.desktopMode ? t('common.on') : t('common.off'),
                            meta: (
                              <View
                                className={clsx(
                                  'rounded-full px-2 py-1',
                                  currentTab?.desktopMode
                                    ? 'bg-indigo-100 border border-indigo-300 dark:bg-indigo-500/20 dark:border-indigo-400/40'
                                    : 'bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700',
                                )}
                              >
                                <Text
                                  className={clsx(
                                    'text-[11px] font-medium',
                                    currentTab?.desktopMode ? 'text-indigo-700 dark:text-indigo-200' : 'text-zinc-600 dark:text-zinc-400',
                                  )}
                                >
                                  {currentTab?.desktopMode ? t('common.on') : t('common.off')}
                                </Text>
                              </View>
                            ),
                            handler: () => {
                              const desktopMode = !currentTab?.desktopMode
                              tabs$.tabs[activeTabIndex].desktopMode.toggle()
                              setTimeout(() => {
                                const target = activeWebview()
                                if (currentTab?.url) {
                                  const url = new URL(currentTab.url)
                                  if (url.hostname === 'm.facebook.com' && desktopMode) {
                                    url.hostname = 'www.facebook.com'
                                    target?.loadUrl?.(url.toString())
                                    return
                                  }
                                  if (url.hostname === 'www.facebook.com' && !desktopMode) {
                                    url.hostname = 'm.facebook.com'
                                    target?.loadUrl?.(url.toString())
                                    return
                                  }
                                }
                                reloadWebview(target, currentTab?.url)
                              }, 0)
                            },
                          },
                        ]),
                    {
                      label: t('menus.zoom') || 'Zoom',
                      icon: <MaterialIcons name="zoom-in" size={18} color={headerControlColor} />,
                      systemImage: 'plus.magnifyingglass',
                      metaLabel: `${resolveZoom(host, siteZoom, defaultZoom)}%`,
                      handler: () => ui$.zoomModalOpen.set(true),
                    },
                    {
                      label: t('menus.addBookmark'),
                      icon: <MaterialIcons name="bookmark-add" size={18} color={headerControlColor} />,
                      systemImage: 'bookmark',
                      handler: addBookmark,
                    },
                    {
                      label: t('menus.share'),
                      icon: <MaterialIcons name="share" size={18} color={headerControlColor} />,
                      systemImage: 'square.and.arrow.up',
                      handler: () => (currentTab ? share(currentTab.url) : {}),
                    },
                  ]),
              ...(isWeb
                ? []
                : [{ label: '', handler: () => {}, kind: 'separator' as const }]),
              {
                label: t('menus.tools'),
                icon: <MaterialIcons name="build" size={18} color={headerControlColor} />,
                systemImage: 'wrench.and.screwdriver',
                handler: () => ui$.toolsModalOpen.set(true),
              },
              {
                label: t('settings.label'),
                icon: <MaterialIcons name="settings" size={18} color={headerControlColor} />,
                systemImage: 'gearshape',
                handler: () => ui$.settingsModalOpen.set(true),
              },
            ]}
          />
          )
          return <Tooltip title={t('menus.more')}>{moreMenu}</Tooltip>
        })()}
      </View>
    </HeaderRoot>
  )

  if (isWeb) {
    return ret
  }

  const flingGesture = Gesture.Fling()
    .runOnJS(true)
    .direction(Directions.RIGHT | Directions.LEFT)
    .onBegin((e) => {
      flingStart.value = e.absoluteX
    })
    .onEnd((e) => {
      if (e.absoluteX > flingStart.value) {
        prevTab()
      } else {
        nextTab()
      }
    })
  // This pan covers the whole header, buttons included. Without activation thresholds it
  // claims the touch after a few pixels of movement, which cancels the pressable
  // underneath before onPress fires — so a tap with the slightest finger drift did
  // nothing at all, since onEnd below also ignores movement under 50px. Require a
  // clearly horizontal drag before taking over, and fail outright on vertical movement.
  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onBegin((e) => {
      panStart.value = e.absoluteX
    })
    .onEnd((e) => {
      if (Math.abs(e.absoluteX - panStart.value) < 50) {
        return
      }
      if (e.absoluteX > panStart.value) {
        prevTab()
      } else {
        nextTab()
      }
    })

  const composed = Gesture.Race(flingGesture, panGesture)
  return (
    <Root
      pointerEvents="box-none"
      style={
        hideableHeader
          ? [
              { position: 'absolute', left: 0, right: 0, zIndex: 10, ...(headerPosition === 'bottom' ? { bottom: 0 } : { top: 0 }) },
              animatedHeaderStyle,
            ]
          : { minHeight: 0 }
      }
    >
      <GestureHandlerRootView pointerEvents="box-none" style={{ minHeight: 0 }}>
        <GestureDetector gesture={composed}>{ret}</GestureDetector>
      </GestureHandlerRootView>
    </Root>
  )
}
