import { ActivityIndicator, Dimensions, View, Text, TouchableOpacity, LayoutChangeEvent, useColorScheme } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import React, { useCallback, useEffect, useRef } from 'react'
import Drawer from 'expo-router/drawer'
import { useValue, useObserve } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { removeTrackingParams } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { colors } from '@/lib/colors'
import { SettingsModal } from '../modal/SettingsModal'
import { NouMenu } from '../menu/NouMenu'
import { isWeb, isIos, isAndroid, nIf, clsx } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { MaterialButton } from '../button/IconButtons'
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
import { executeWebviewJavaScriptQuietly } from '@/lib/webview'
import { openTabForActiveDesktopView } from '@/lib/desktop-view-actions'
import { DesktopTabsSidebar } from '../view/DesktopTabsSidebar'
import { ServiceIcon } from '../service/Services'

const webAnimatedHelpers = {
  AnimatedView: View,
  useSharedValueSafe: (initial: number) => ({ value: initial }) as SharedValue<number>,
  withTimingSafe: (value: number) => value,
}

const nativeAnimatedHelpers = !isWeb
  ? (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Reanimated = require('react-native-reanimated')
      return {
        AnimatedView: Reanimated.default?.View ?? Reanimated.View ?? Reanimated.default,
        useSharedValueSafe: Reanimated.useSharedValue as (initial: number) => SharedValue<number>,
        withTimingSafe: Reanimated.withTiming as (value: number) => number,
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
  const hideToolbarWhenScrolled = useValue(settings$.hideToolbarWhenScrolled)
  const showNewTabButtonInHeader = useValue(settings$.showNewTabButtonInHeader)
  const showBackButtonInHeader = useValue(settings$.showBackButtonInHeader)
  const showForwardButtonInHeader = useValue(settings$.showForwardButtonInHeader)
  const showReloadButtonInHeader = useValue(settings$.showReloadButtonInHeader)
  const showScrollButtonInHeader = useValue(settings$.showScrollButtonInHeader)
  const sidebarCollapsed = isWeb && useValue(settings$.sidebarCollapsed)

  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const headerControlColor = isDark ? colors.icon : colors.iconLightStrong

  const tabsCount = useValue(() => tabs$.tabs.length)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const recentlyClosedTabs = useValue(tabs$.recentlyClosedTabs)
  const currentTab = useValue(tabs$.currentTab)
  const webview = ui$.webview.get()
  const { AnimatedView, useSharedValueSafe, withTimingSafe } = isWeb ? webAnimatedHelpers : nativeAnimatedHelpers!
  const marginTop = useSharedValueSafe(0)
  const flingStart = useSharedValueSafe(0)
  const panStart = useSharedValueSafe(0)
  let hostname = '',
    canDownload = false

  if (currentTab?.url) {
    try {
      const url = new URL(currentTab.url)
      hostname = url.hostname
      canDownload = isDirectlyDownloadable(currentTab.url)
    } catch (e) {}
  }

  const hideDesktopSiteToggle = hostname.endsWith('.facebook.com') || hostname.endsWith('.tiktok.com')

  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    if (Math.abs(ui$.headerHeight.get() - height) < 1) {
      return
    }
    ui$.headerHeight.set(height)
  }

  useEffect(() => {
    if (isWeb) {
      return
    }
    const shouldHide = (autoHideHeader || hideToolbarWhenScrolled) && !headerShown
    marginTop.value = withTimingSafe(shouldHide ? -headerHeight : 0)
  }, [autoHideHeader, hideToolbarWhenScrolled, headerHeight, headerShown, marginTop, withTimingSafe])

  const scrollToTop = () => {
    void executeWebviewJavaScriptQuietly(webview, `window.scrollTo(0, 0, {behavior: 'smooth'})`)
  }
  const reloadPage = () => {
    if (!webview) {
      return
    }
    if (typeof webview.reload === 'function') {
      webview.reload()
      return
    }
    if (typeof webview.executeJavaScript === 'function') {
      void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
      return
    }
    webview.loadUrl?.(currentTab?.url)
  }
  const goForward = () => {
    if (typeof webview?.goForward === 'function') {
      webview.goForward()
      return
    }
    void executeWebviewJavaScriptQuietly(webview, 'history.forward()')
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

  const Root = AnimatedView

  const webMarginTop = (autoHideHeader || hideToolbarWhenScrolled) && !headerShown ? -headerHeight : 0

  const toggleSidebar = () => settings$.sidebarCollapsed.set(!settings$.sidebarCollapsed.get())

  const ret = (
    <Root
      className={clsx(
        'bg-zinc-100 dark:bg-zinc-800 flex-row items-center justify-between pl-2 py-1',
        isWeb && (sidebarCollapsed
          ? 'lg:w-[56px] lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:bg-zinc-100 lg:px-0 lg:py-0 lg:border-r lg:border-zinc-200 dark:lg:bg-zinc-900 dark:lg:border-zinc-800'
          : 'lg:w-[280px] lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:bg-zinc-100 lg:px-0 lg:py-0 lg:border-r lg:border-zinc-200 dark:lg:bg-zinc-900 dark:lg:border-zinc-800'),
      )}
      style={{ marginTop: isWeb ? webMarginTop : marginTop }}
      onLayout={onLayout}
    >
      {nIf(
        !isWeb,
        <View className="flex-row items-center gap-1">
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
          <div title={t('buttons.toggleSidebar')}>
            <MaterialButton name="chevron-left" color={headerControlColor} onPress={toggleSidebar} />
          </div>
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
          <div title={t('buttons.toggleSidebar')}>
            <MaterialButton name="chevron-right" color={headerControlColor} onPress={toggleSidebar} />
          </div>
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
          canDownload,
          <div title={t('modals.downloadVideo')}>
            <MaterialButton name="download" color={headerControlColor} onPress={() => ui$.downloadVideoModalUrl.set(currentTab?.url || '')} />
          </div>,
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
          <div title={t('buttons.restoreTabs')}>
            <NouMenu
              trigger={<MaterialButton name="restore" color={headerControlColor} />}
              items={recentlyClosedTabs.map((tab) => ({
                label: tab.title || tab.url || t('tabs.new'),
                description: tab.title && tab.url && tab.title !== tab.url ? tab.url : undefined,
                icon: <ServiceIcon url={tab.url} icon={tab.icon} />,
                handler: () => tabs$.reopenClosedTab(tab.id),
              }))}
            />
          </div>,
        )}
        <div title={t('menus.more')}>
          <NouMenu
            triggerColor={headerControlColor}
            trigger={
              isWeb
                ? <MaterialButton name="more-vert" color={headerControlColor} />
                : isIos
                  ? 'ellipsis'
                  : 'filled.MoreVert'
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
                              tabs$.tabs[activeTabIndex].desktopMode.toggle()
                              void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
                            },
                          },
                        ]),
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
        </div>
      </View>
    </Root>
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
  const panGesture = Gesture.Pan()
    .runOnJS(true)
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
    <GestureHandlerRootView style={{ minHeight: 0 }}>
      <GestureDetector gesture={composed}>{ret}</GestureDetector>
    </GestureHandlerRootView>
  )
}
