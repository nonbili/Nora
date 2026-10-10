import { use$ } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useEffect, useState } from 'react'
import { BaseModal } from './BaseModal'
import { NouText } from '../NouText'
import { Keyboard, Pressable, TextInput, View, useColorScheme } from 'react-native'
import { gray } from '@radix-ui/colors'
import { NouButton } from '../button/NouButton'
import { t } from 'i18next'
import { isDownloadable, normalizeDownloadUrl } from '@/content/download'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { clsx, isIos, isWeb } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { settings$ } from '@/states/settings'
import { publicSearchServiceIds, resolvePublicSearchUrl } from '@/lib/public-search'
import { services } from '../service/Services'
import { NouMenu } from '../menu/NouMenu'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { exportCookiesTxt } from '@/lib/cookie-export'
import { showToast } from '@/lib/toast'
import { Segemented } from '../picker/Segmented'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { clearHostData } from '@/lib/profile-data'
import { confirmDestructiveAction } from '@/lib/confirm'
import { executeWebviewJavaScriptQuietly, reloadWebview } from '@/lib/webview'
import { useTwColor } from '@/lib/theme'

type ToolsTab = 'download' | 'search' | 'cookies'

// Downloading is not offered on iOS.
const toolsTabs: ToolsTab[] = isIos ? ['search', 'cookies'] : ['download', 'search', 'cookies']
const toolsTabLabelKeys: Record<ToolsTab, string> = {
  download: 'modals.downloadTab',
  search: 'modals.searchTab',
  cookies: 'modals.cookiesTab',
}

const canDownload = (url: string) => {
  let hostname, pathname
  try {
    ;({ hostname, pathname } = new URL(url))
  } catch (e) {
    return false
  }

  if (isDownloadable(url)) {
    return true
  }

  const slugs = pathname.split('/')
  switch (hostname) {
    case 'm.facebook.com':
    case 'www.facebook.com':
      return slugs[1] == 'share'
    case 'www.instagram.com':
      return slugs[1] == 'p'
    case 'x.com':
      return slugs[2] == 'status'
  }
  return false
}

export const ToolsModal = () => {
  const tw = useTwColor()
  const toolsModalOpen = use$(ui$.toolsModalOpen)
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  const [url, setUrl] = useState('')
  const [cobaltUrl, setCobaltUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [exportingCookies, setExportingCookies] = useState(false)
  const disabledServices = use$(settings$.disabledServicesArr)
  const selectedSearchServiceId = use$(settings$.selectedPublicSearchServiceId)
  const [selectedTab, setSelectedTab] = useState<ToolsTab>(isIos ? 'cookies' : 'download')
  const tabs = use$(tabs$.tabs)
  const activeTabIndex = use$(tabs$.activeTabIndex)
  const currentTab = tabs[activeTabIndex]
  const onClose = () => {
    // While the field is still there: the keyboard of a focused field outlives it otherwise.
    Keyboard.dismiss()
    ui$.toolsModalOpen.set(false)
  }

  useEffect(() => {
    if (!toolsModalOpen) {
      // Also for a close that does not go through `onClose`.
      Keyboard.dismiss()
    }
    setUrl('')
    setCobaltUrl('')
    setSearchQuery('')
    setExportingCookies(false)
    setSelectedTab(isIos ? 'cookies' : 'download')
  }, [toolsModalOpen])

  const onDownload = () => {
    const normalizedUrl = normalizeDownloadUrl(url.trim())
    if (!normalizedUrl) {
      return
    }
    if (isWeb) {
      mainClient.downloadVideo(normalizedUrl)
      return
    }
    ui$.downloadVideoModalUrl.set(normalizedUrl)
  }

  const onOpenCobalt = () => {
    const trimmed = cobaltUrl.trim()
    const target = trimmed
      ? `https://cobalt.tools/?u=${encodeURIComponent(trimmed)}`
      : 'https://cobalt.tools/'
    tabs$.openTab(target)
    onClose()
  }

  // Services that are turned off are not offered here either.
  const enabledSearchServiceIds = publicSearchServiceIds.filter((serviceId) => !disabledServices.includes(serviceId))
  const searchServiceIds = enabledSearchServiceIds.length ? enabledSearchServiceIds : publicSearchServiceIds
  const searchServiceId = searchServiceIds.includes(selectedSearchServiceId) ? selectedSearchServiceId : searchServiceIds[0]
  const searchUrl = resolvePublicSearchUrl(searchServiceId, searchQuery)

  const onSearch = () => {
    if (!searchUrl) {
      return
    }
    // Read without an account, so in the Anonymous profile whichever one the current tab is in.
    tabs$.openTab(searchUrl, { profile: settings$.ensureAnonymousProfile(), profileMode: 'manual' })
    onClose()
  }

  const onExportCookies = async () => {
    if (!currentTab?.url) {
      showToast(t('toast.cookieExportOpenPage'))
      return
    }

    setExportingCookies(true)
    try {
      const exported = await exportCookiesTxt(currentTab.profile || 'default', currentTab.url)
      showToast(t(exported ? 'toast.cookieExported' : 'toast.cookieExportEmpty'))
    } catch {
      showToast(t('toast.cookieExportFailed'))
    } finally {
      setExportingCookies(false)
    }
  }

  const onInjectCookies = () => {
    ui$.assign({
      toolsModalOpen: false,
      cookieModalOpen: true,
    })
  }

  const onClearSiteData = () => {
    if (!currentTab?.url) return

    let host = ''
    try {
      host = new URL(currentTab.url).hostname
    } catch {
      return
    }

    confirmDestructiveAction(
      t('menus.clearSiteData'),
      t('menus.clearSiteDataConfirm', { host }),
      t('menus.clearSiteData'),
      () => {
        void clearHostData(host, currentTab.profile || 'default')
          .then(() => {
            showToast(t('toast.siteDataCleared'))
            reloadWebview(ui$.webview.get())
          })
          .catch(() => showToast(t('toast.siteDataClearFailed')))
      },
    )
  }

  if (!toolsModalOpen) {
    return null
  }

  return (
    <BaseModal onClose={onClose} useNativeModal={false}>
      <View className="px-5 pb-5 pt-2" style={!isWeb ? { marginTop: -insets.top } : undefined}>
        <View className="mb-6 items-start">
          <Segemented
            options={toolsTabs.map((tab) => t(toolsTabLabelKeys[tab]))}
            selectedIndex={toolsTabs.indexOf(selectedTab)}
            onChange={(index) => setSelectedTab(toolsTabs[index])}
          />
        </View>

        {selectedTab === 'search' ? (
          <View>
            <NouText className="text-lg font-semibold mb-2">{t('modals.publicSearch')}</NouText>
            <NouText className="mb-4 text-sm text-zinc-600 dark:text-gray-400">{t('modals.publicSearchHint')}</NouText>
            <View className="flex-row items-center overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900">
              <NouMenu
                // The iOS menu takes a symbol for its trigger; the placeholder names the chosen service there.
                trigger={
                  isIos ? (
                    'chevron.down'
                  ) : (
                    <View className="h-11 flex-row items-center gap-0.5 border-r border-zinc-300 dark:border-zinc-700 pl-3 pr-1.5">
                      {services[searchServiceId]?.[1]()}
                      <MaterialIcons name="arrow-drop-down" size={18} color={isDark ? gray.gray11 : tw('#52525b')} />
                    </View>
                  )
                }
                items={searchServiceIds.map((serviceId) => ({
                  label: services[serviceId]?.[0] ?? serviceId,
                  icon: services[serviceId]?.[1](),
                  handler: () => settings$.setSelectedPublicSearchService(serviceId),
                }))}
              />
              <TextInput
                className="h-11 flex-1 px-3 py-0 text-sm text-zinc-900 dark:text-white"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={onSearch}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('modals.publicSearchPlaceholder', { service: services[searchServiceId]?.[0] })}
                placeholderTextColor={isDark ? gray.gray11 : tw('#52525b')}
              />
              <Pressable
                onPress={onSearch}
                disabled={!searchUrl}
                accessibilityRole="button"
                accessibilityLabel={t('modals.searchTab')}
                className={clsx(
                  'h-11 w-11 items-center justify-center border-l border-zinc-300 dark:border-zinc-700 active:bg-zinc-200 dark:active:bg-zinc-800',
                  !searchUrl && 'opacity-40',
                )}
              >
                <MaterialIcons name="search" size={18} color={isDark ? gray.gray11 : tw('#52525b')} />
              </Pressable>
            </View>
          </View>
        ) : selectedTab === 'download' ? (
          <View>
            <NouText className="text-lg font-semibold mb-4">{t('modals.downloadVideo')}</NouText>
            <NouText className="mb-4 text-sm text-zinc-600 dark:text-gray-200">Support Facebook, Instagram, TikTok and X</NouText>
            <NouText className="mb-1 font-semibold text-zinc-700 dark:text-gray-300">URL</NouText>
            <TextInput
              className="border border-zinc-300 dark:border-gray-600 rounded mb-3 text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-900 p-2 text-sm"
              value={url}
              onChangeText={setUrl}
              placeholder="https://www.instagram.com/:user/reel/:id"
              placeholderTextColor={isDark ? gray.gray11 : tw('#52525b')}
              autoFocus
            />
            <View className="flex-row items-center justify-end mt-6">
              <NouButton disabled={!canDownload(url.trim())} onPress={onDownload}>
                Download
              </NouButton>
            </View>
            <View className="border-t border-zinc-200 dark:border-gray-700 mt-6 pt-5">
              <NouText className="text-lg font-semibold mb-4">{t('modals.downloadOnCobalt')}</NouText>
              <NouText className="mb-1 font-semibold text-zinc-700 dark:text-gray-300">URL</NouText>
              <TextInput
                className="border border-zinc-300 dark:border-gray-600 rounded mb-3 text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-900 p-2 text-sm"
                value={cobaltUrl}
                onChangeText={setCobaltUrl}
                placeholder="post or reel url"
                placeholderTextColor={isDark ? gray.gray11 : tw('#52525b')}
              />
              <View className="flex-row items-center justify-end mt-6">
                <NouButton variant="outline" onPress={onOpenCobalt}>
                  Open
                </NouButton>
              </View>
            </View>

          </View>
        ) : (
          <View>
            <NouText className="text-lg font-semibold mb-2">{t('modals.exportCookies')}</NouText>
            <NouText className="text-sm text-zinc-600 dark:text-gray-400">
              {t('modals.exportCookiesHint')}
            </NouText>
            <View className="flex-row items-center justify-end mt-5">
              <NouButton
                variant="outline"
                disabled={!currentTab?.url || exportingCookies}
                loading={exportingCookies}
                onPress={onExportCookies}
              >
                {t('modals.exportCookiesButton')}
              </NouButton>
            </View>

            <View className="border-t border-zinc-200 dark:border-gray-700 mt-6 pt-5">
              <NouText className="text-lg font-semibold mb-2">{t('settings.profiles.injectCookie')}</NouText>
              <NouText className="text-sm text-zinc-600 dark:text-gray-400">
                {t('settings.profiles.injectCookieHint')}
              </NouText>
              <View className="flex-row items-center justify-end mt-5">
                <NouButton variant="outline" onPress={onInjectCookies}>
                  {t('settings.injectCookie')}
                </NouButton>
              </View>
            </View>

            <View className="border-t border-zinc-200 dark:border-gray-700 mt-6 pt-5">
              <NouText className="text-lg font-semibold mb-2">{t('menus.clearSiteData')}</NouText>
              <NouText className="text-sm text-zinc-600 dark:text-gray-400">
                {t('modals.clearSiteDataHint')}
              </NouText>
              <View className="flex-row items-center justify-end mt-5">
                <NouButton
                  variant="outline"
                  disabled={!currentTab?.url}
                  onPress={onClearSiteData}
                  textClassName="text-red-600 dark:text-red-400"
                >
                  {t('menus.clearSiteData')}
                </NouButton>
              </View>
            </View>
          </View>
        )}
      </View>
    </BaseModal>
  )
}
