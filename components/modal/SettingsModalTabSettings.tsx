import { useState, useEffect } from 'react'
import { Alert, Pressable, ScrollView, View, TextInput, useColorScheme } from 'react-native'
import { NouButton } from '../button/NouButton'
import { ui$ } from '@/states/ui'
import { services } from '../service/Services'
import { clsx, isWeb, isIos, isAndroid, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { settings$, ZOOM_PRESETS } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { bookmarks$ } from '@/states/bookmarks'
import { Image } from 'expo-image'
import { NouMenu } from '../menu/NouMenu'
import { NouSwitch } from '../switch/NouSwitch'
import { t } from 'i18next'
import { MaterialButton } from '../button/IconButtons'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { ProfileManager } from '../profile/ProfileManager'
import { BlocklistSection } from '../blocklist/BlocklistSection'
import { xHomeTimelineValues } from '@/lib/settings/twitter'
import {
  searchSettingsProviderIds,
  getResolvedSearchProvider,
  isValidSearchTemplate,
} from '@/lib/search'
import { SearchProviderIcon } from '../service/SearchProviderIcon'
import { showToast } from '@/lib/toast'
import {
  enableMentionNotifications,
  disableMentionNotifications,
  isMentionNotificationsAvailable,
} from '@/lib/mention-notifications'
import { BaseCenterModal } from './BaseCenterModal'
import { builtinUserStyleDefinitions } from '@/lib/user-styles'
import { userStyles$ } from '@/states/user-styles'
import { settingsUi, SettingsSurface, SettingsRow } from './SettingsPrimitives'
import { useLocales } from 'expo-localization'
import { resolveI18nLanguageFromExpoLocale, supportedI18nLanguages } from '@/lib/i18n'
import { colors } from '@/lib/colors'

const headerPositions = ['top', 'bottom'] as const
const themes = [null, 'dark', 'light'] as const
const subheaderCls = settingsUi.subheaderCls
const surfaceCls = settingsUi.surfaceCls
const rowCls = settingsUi.rowCls
const rowBorderCls = settingsUi.rowBorderCls
const iconWrapCls = settingsUi.iconWrapCls
const textInputCls = settingsUi.textInputCls
const xTimelineLabels: Record<(typeof xHomeTimelineValues)[number], string> = {
  'for-you': 'settings.xHomeTimeline.forYou',
  following: 'settings.xHomeTimeline.following',
}
const serviceHosts: Record<string, string> = {
  bluesky: 'bsky.app',
  facebook: 'facebook.com',
  'facebook-messenger': 'messenger.com',
  instagram: 'instagram.com',
  linkedin: 'linkedin.com',
  reddit: 'reddit.com',
  threads: 'threads.net',
  tiktok: 'tiktok.com',
  tumblr: 'tumblr.com',
  vk: 'vk.com',
  x: 'x.com',
}

const normalizeHost = (host: string) => host.replace(/^\*\./, '').replace(/^www\./, '').toLowerCase()
const isDesktop = isWeb && typeof window !== 'undefined' && !!(window as any).electron
const languageNativeNames: Record<string, string> = {
  ar: 'العربية',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  et: 'Eesti',
  fr: 'Français',
  it: 'Italiano',
  ko: '한국어',
  lv: 'Latviešu',
  pl: 'Polski',
  pt: 'Português',
  pt_BR: 'Português (Brasil)',
  ru: 'Русский',
  sv: 'Svenska',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
  zh_Hans: '简体中文',
  zh_Hant: '繁體中文',
}

export const SettingsBrowsingContent: React.FC<{ onFocusInput?: () => void }> = ({ onFocusInput }) => {
  const settings = useValue(settings$)
  const builtinScripts = useValue(userStyles$.builtinScripts)

  return (
    <View className="pb-4">
      {!isWeb || isDesktop ? (
        <>
          <NouText className={subheaderCls}>{t('settings.browsing.features')}</NouText>
          <SettingsSurface>
            <SettingsRow>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.openExternalLink')}</NouText>}
                value={settings.openExternalLinkInSystemBrowser}
                onPress={() => settings$.openExternalLinkInSystemBrowser.toggle()}
              />
            </SettingsRow>
            {nIf(
              !isWeb,
              <SettingsRow>
                <NouSwitch
                  label={<NouText className="font-medium">{t('settings.oneTabPerSite')}</NouText>}
                  value={settings.oneTabPerSite}
                  onPress={() => settings$.oneTabPerSite.toggle()}
                />
              </SettingsRow>,
            )}
            {nIf(
              isAndroid,
              <SettingsRow>
                <NouSwitch
                  label={<NouText className="font-medium">{t('settings.doubleBackToExitApp')}</NouText>}
                  value={settings.doubleBackToExitApp}
                  onPress={() => settings$.doubleBackToExitApp.toggle()}
                />
              </SettingsRow>,
            )}
            {nIf(
              !isWeb,
              <SettingsRow>
                <NouSwitch
                  label={<NouText className="font-medium">{t('settings.videoEdgeLongPressTo2x')}</NouText>}
                  value={settings.videoEdgeLongPressTo2x}
                  onPress={() => settings$.videoEdgeLongPressTo2x.toggle()}
                />
              </SettingsRow>,
            )}
            <SettingsRow isLast>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.enterInsertsNewline')}</NouText>}
                value={builtinScripts['enter-as-shift-enter']?.enabled ?? false}
                onPress={() => userStyles$.toggleBuiltinScript('enter-as-shift-enter')}
              />
            </SettingsRow>
          </SettingsSurface>
        </>
      ) : null}

      {nIf(
        !isWeb && isMentionNotificationsAvailable,
        <View className="mt-10">
          <NouText className={subheaderCls}>{t('settings.sections.notifications')}</NouText>
          <SettingsSurface>
            <SettingsRow isLast>
              <NouSwitch
                label={
                  <View>
                    <NouText className="font-medium">{t('settings.mentionNotifications')}</NouText>
                    <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">X and Facebook</NouText>
                  </View>
                }
                value={settings.mentionNotificationsEnabled}
                onPress={async () => {
                  const next = !settings.mentionNotificationsEnabled
                  if (next) {
                    const r = await enableMentionNotifications()
                    if (!r.ok) {
                      showToast(r.reason || 'Failed to enable')
                      return
                    }
                    settings$.mentionNotificationsEnabled.set(true)
                  } else {
                    await disableMentionNotifications()
                    settings$.mentionNotificationsEnabled.set(false)
                  }
                }}
              />
            </SettingsRow>
          </SettingsSurface>
          <NouText className="mt-2 px-4 text-sm text-zinc-600 dark:text-zinc-400">
            {t('settings.mentionNotificationsHint')}
          </NouText>
        </View>,
      )}

      <View className="mt-10">
        <NouText className={subheaderCls}>{t('blocklist.label')}</NouText>
        <View className={surfaceCls}>
          <View className={rowCls}>
            <BlocklistSection hideTitle />
          </View>
        </View>
      </View>

      {!isWeb ? (
        <View className="mt-10">
          <NouText className={subheaderCls}>{t('settings.sections.advanced')}</NouText>
          <View className={surfaceCls}>
            {nIf(
              isAndroid,
              <View className={clsx(rowCls, rowBorderCls)}>
                <NouSwitch
                  label={<NouText className="font-medium">{t('settings.allowHttpWebsite')}</NouText>}
                  value={settings.allowHttpWebsite}
                  onPress={() => settings$.allowHttpWebsite.toggle()}
                />
              </View>,
            )}
            <View className={rowCls}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.inspectable')}</NouText>}
                value={settings.inspectable}
                onPress={() => settings$.inspectable.toggle()}
              />
            </View>
          </View>
        </View>
      ) : null}

      {nIf(
        !isWeb,
        <View className="mt-10">
          <NouText className={subheaderCls}>{t('settings.proxy.label')}</NouText>
          <View className={surfaceCls}>
            <View className={clsx(rowCls, settings.proxyEnabled && rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.proxy.enabled')}</NouText>}
                value={settings.proxyEnabled}
                onPress={() => settings$.proxyEnabled.toggle()}
              />
            </View>
            {settings.proxyEnabled && (
              <>
                <View className={clsx(rowCls, rowBorderCls, 'flex-row items-center justify-between gap-3')}>
                  <NouText className="font-medium">{t('settings.proxy.type')}</NouText>
                  <Segemented
                    options={['HTTP', 'SOCKS']}
                    selectedIndex={settings.proxyType === 'socks' ? 1 : 0}
                    size={1}
                    onChange={(index) => settings$.proxyType.set(index === 1 ? 'socks' : 'http')}
                  />
                </View>
                <View className={clsx(rowCls, rowBorderCls, 'flex-row items-center justify-between gap-3')}>
                  <NouText className="font-medium w-24">{t('settings.proxy.host')}</NouText>
                  <TextInput
                    className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white text-right"
                    value={settings.proxyHost}
                    onChangeText={(text) => settings$.proxyHost.set(text)}
                    placeholder={t('settings.proxy.hostPlaceholder')}
                    placeholderTextColor="#71717a"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={onFocusInput}
                  />
                </View>
                <View className={clsx(rowCls, 'flex-row items-center justify-between gap-3')}>
                  <NouText className="font-medium w-24">{t('settings.proxy.port')}</NouText>
                  <TextInput
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white w-32 text-right"
                    value={settings.proxyPort}
                    onChangeText={(text) => settings$.proxyPort.set(text)}
                    placeholder={t('settings.proxy.portPlaceholder')}
                    placeholderTextColor="#71717a"
                    keyboardType="numeric"
                    returnKeyType="done"
                    onFocus={onFocusInput}
                  />
                </View>
              </>
            )}
          </View>
        </View>,
      )}
    </View>
  )
}

export const SettingsAppearanceContent = () => {
  const settings = useValue(settings$)
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  const locales = useLocales()
  const [deckTabWidthInput, setDeckTabWidthInput] = useState(settings.deckTabWidth.toString())
  const systemLanguage = resolveI18nLanguageFromExpoLocale(locales[0]) || 'en'
  const effectiveLanguage = settings.language || systemLanguage
  const isSystemLanguageSelected = settings.language == null
  const toLanguageLabel = (code: string) => languageNativeNames[code] || code
  const currentLanguageLabel = settings.language
    ? toLanguageLabel(settings.language)
    : `${t('settings.language.system')} (${toLanguageLabel(effectiveLanguage)})`
  const languageMenuItems = [
    {
      label: `${t('settings.language.system')} (${toLanguageLabel(systemLanguage)})`,
      handler: () => settings$.setLanguage(null),
      metaLabel: isSystemLanguageSelected ? '✓' : undefined,
    },
    ...supportedI18nLanguages.map((language) => ({
      label: toLanguageLabel(language),
      handler: () => settings$.setLanguage(language),
      metaLabel: settings.language === language ? '✓' : undefined,
    })),
  ]

  useEffect(() => {
    setDeckTabWidthInput(settings.deckTabWidth.toString())
  }, [settings.deckTabWidth])

  const submitDeckTabWidth = () => {
    const parsed = parseInt(deckTabWidthInput, 10)
    if (!isNaN(parsed) && parsed > 0) {
      settings$.deckTabWidth.set(parsed)
      setDeckTabWidthInput(parsed.toString())
    } else {
      setDeckTabWidthInput(settings.deckTabWidth.toString())
    }
  }

  return (
    <View className="pb-4">
      {nIf(
        isWeb,
        <>
          <NouText className={subheaderCls}>{t('settings.appearance.toolbar')}</NouText>
          <View className={surfaceCls}>
            <View className={clsx('items-center flex-row justify-between', rowCls)}>
              <View>
                <NouText className="font-medium">{t('settings.appearance.deckTabWidth')}</NouText>
                <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                  {t('settings.appearance.deckTabWidthHint', { value: settings.deckTabWidth })}
                </NouText>
              </View>
              <View className="flex-row items-center gap-2">
                <TextInput
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white w-24 text-center"
                  value={deckTabWidthInput}
                  onChangeText={setDeckTabWidthInput}
                  onEndEditing={submitDeckTabWidth}
                  onSubmitEditing={submitDeckTabWidth}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <NouMenu
                  trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
                  items={[
                    {
                      label: t('common.reset'),
                      handler: () => {
                        settings$.deckTabWidth.set(400)
                      },
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </>,
      )}

      {nIf(
        !isWeb,
        <>
          <NouText className={subheaderCls}>{t('settings.appearance.toolbar')}</NouText>
          <View className={surfaceCls}>
            <View className={clsx('items-center flex-row justify-between', rowCls, rowBorderCls)}>
              <NouText className="font-medium">{t('settings.headerPosition.label')}</NouText>
              <Segemented
                options={[t('settings.headerPosition.top'), t('settings.headerPosition.bottom')]}
                selectedIndex={headerPositions.indexOf(settings.headerPosition)}
                size={1}
                onChange={(index) => settings$.headerPosition.set(headerPositions[index])}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.hideHeader')}</NouText>}
                value={settings.autoHideHeader}
                onPress={() => settings$.autoHideHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.hideToolbarWhenScrolled')}</NouText>}
                value={settings.hideToolbarWhenScrolled}
                onPress={() => settings$.hideToolbarWhenScrolled.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showNewTabButton')}</NouText>}
                value={settings.showNewTabButtonInHeader}
                onPress={() => settings$.showNewTabButtonInHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showBackButton')}</NouText>}
                value={settings.showBackButtonInHeader}
                onPress={() => settings$.showBackButtonInHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showForwardButton')}</NouText>}
                value={settings.showForwardButtonInHeader}
                onPress={() => settings$.showForwardButtonInHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showReloadButton')}</NouText>}
                value={settings.showReloadButtonInHeader}
                onPress={() => settings$.showReloadButtonInHeader.toggle()}
              />
            </View>
            <View className={rowCls}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showScrollButton')}</NouText>}
                value={settings.showScrollButtonInHeader}
                onPress={() => settings$.showScrollButtonInHeader.toggle()}
              />
            </View>
          </View>
        </>,
      )}

      <NouText className="mt-8 mb-3 text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500">
        {t('settings.language.label')}
      </NouText>
      <View className={surfaceCls}>
        <View className={clsx('items-center flex-row justify-between', rowCls)}>
          <View className="flex-1 pr-3">
            <NouText className="font-medium">{t('settings.language.label')}</NouText>
            <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
              {t('settings.language.hint')}
            </NouText>
          </View>
              <NouMenu
                trigger={
                  isWeb ? (
                    <NouButton size="1" variant="outline" onPress={() => {}}>
                      {currentLanguageLabel}
                    </NouButton>
                  ) : isIos ? (
                    'ellipsis'
                  ) : (
                'filled.MoreVert'
              )
            }
            items={languageMenuItems}
          />
        </View>
      </View>

      <NouText className="mt-8 mb-3 text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500">
        {t('settings.theme.label')}
      </NouText>
      <View className={surfaceCls}>
        <View className="px-4 py-4">
          <View className="flex-row items-start gap-3">
            <View className={iconWrapCls}>
              <MaterialIcons name="palette" color={isDark ? colors.icon : colors.iconLightStrong} size={18} />
            </View>
            <View className="flex-1">
              <NouText className="font-medium">{t('settings.theme.label')}</NouText>
              <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                {t('settings.theme.hint')}
              </NouText>
            </View>
          </View>
        </View>
        <View className="border-t border-zinc-300 dark:border-zinc-800 px-4 py-4">
          <View className="items-end">
            <Segemented
              options={[t('settings.theme.system'), t('settings.theme.dark'), t('settings.theme.light')]}
              selectedIndex={themes.indexOf(settings.theme)}
              size={1}
              onChange={(index) => settings$.theme.set(themes[index])}
            />
          </View>
        </View>
      </View>

      <NouText className="mt-8 mb-3 text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500">
        {t('settings.zoom.label') || 'Page Zoom'}
      </NouText>
      <View className={surfaceCls}>
        <View className={clsx('items-center flex-row justify-between', rowCls)}>
          <View className="flex-1 pr-3">
            <NouText className="font-medium">{t('settings.zoom.defaultLabel') || 'Default zoom'}</NouText>
            <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
              {t('settings.zoom.defaultHint') || 'Set the default zoom level for all web pages.'}
            </NouText>
          </View>
          <NouMenu
            trigger={
              <NouButton size="1" variant="outline" onPress={() => {}}>
                {settings.defaultZoom}%
              </NouButton>
            }
            items={ZOOM_PRESETS.map((zoom) => ({
              label: `${zoom}%`,
              handler: () => settings$.setDefaultZoom(zoom),
              metaLabel: settings.defaultZoom === zoom ? '✓' : undefined,
            }))}
          />
        </View>
      </View>

      {Object.keys(settings.siteZoom || {}).length > 0 ? (
        <>
          <NouText className="mt-8 mb-3 text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500">
            {t('settings.zoom.siteZoomLabel') || 'Per-site zoom'}
          </NouText>
          <View className={surfaceCls}>
            {Object.entries(settings.siteZoom || {}).map(([site, zoom], index, arr) => (
              <View
                key={site}
                className={clsx(
                  'items-center flex-row justify-between',
                  rowCls,
                  index < arr.length - 1 && rowBorderCls,
                )}
              >
                <View className="flex-1 pr-3">
                  <NouText className="font-medium">{site}</NouText>
                  <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {zoom}%
                  </NouText>
                </View>
                <MaterialButton
                  name="close"
                  color={isDark ? colors.icon : colors.iconLightStrong}
                  onPress={() => settings$.setSiteZoom(site, null)}
                />
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}

export const SettingsProfilesContent = () => {
  const settings = useValue(settings$)

  return (
    <View className="pb-4">
      <NouText className={subheaderCls}>{t('settings.profiles.sessionMode')}</NouText>
      <SettingsSurface className="mb-10">
        <SettingsRow isLast>
          <NouSwitch
            label={
              <View>
                <NouText className="font-medium">{t('settings.oneProfilePerSite')}</NouText>
                <NouText className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('settings.oneProfilePerSiteHint')}
                </NouText>
              </View>
            }
            value={settings.oneProfilePerSite}
            onPress={() => settings$.oneProfilePerSite.toggle()}
          />
        </SettingsRow>
      </SettingsSurface>
      <ProfileManager />
      <View className="mt-10">
        <NouText className={subheaderCls}>{t('settings.profiles.injectCookie')}</NouText>
        <View className={surfaceCls}>
          <View className="px-4 py-4">
            <NouText className="text-sm leading-6 text-zinc-600 dark:text-gray-400">
              {t('settings.profiles.injectCookieHint')}
            </NouText>
            <View className="mt-5 flex-row justify-end">
              <NouButton
                variant="outline"
                onPress={() =>
                  ui$.assign({
                    cookieModalOpen: true,
                  })
                }
              >
                {t('settings.injectCookie')}
              </NouButton>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

export const SettingsServicesContent = () => {
  const settings = useValue(settings$)
  const builtinStyles = useValue(userStyles$.builtins)
  const xTimelineIndex = xHomeTimelineValues.indexOf(settings.xDefaultHomeTimeline)
  const entries = Object.entries(services)
    .map(([serviceId, [serviceName, serviceIcon]]) => {
      const host = serviceHosts[serviceId] || `${serviceId}.com`
      const hostKey = normalizeHost(host)
      const matchingBuiltins = builtinUserStyleDefinitions.filter((definition) =>
        definition.hostGlobs.some((glob) => normalizeHost(glob) === hostKey),
      )
      return {
        serviceId,
        serviceName,
        serviceIcon,
        host,
        matchingBuiltins,
      }
    })
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName))

  return (
    <View>
      <View className="gap-5">
        {entries.map((entry) => {
          const serviceEnabled = !settings.disabledServicesArr.includes(entry.serviceId)
          const hasRedditSettings = !isWeb && entry.serviceId === 'reddit'
          const hasXSettings = entry.serviceId === 'x'
          const rowCount = serviceEnabled
            ? 1 + entry.matchingBuiltins.length + (hasRedditSettings ? 1 : 0) + (hasXSettings ? 1 : 0)
            : 1
          let rowIndex = 0
          const nextRowBorderClass = () => {
            const borderCls = rowIndex !== rowCount - 1 ? rowBorderCls : ''
            rowIndex += 1
            return borderCls
          }

          return (
            <View key={entry.serviceId}>
              <View className={surfaceCls}>
                <View className={clsx(rowCls, nextRowBorderClass())}>
                  <NouSwitch
                    label={
                      <View className="flex-row items-center gap-2">
                        {entry.serviceIcon()}
                        <NouText className="font-medium">{entry.serviceName}</NouText>
                      </View>
                    }
                    value={serviceEnabled}
                    onPress={() => settings$.toggleService(entry.serviceId)}
                  />
                </View>
                {serviceEnabled ? (
                  <>
                    {entry.matchingBuiltins.map((definition) => (
                      <View key={definition.id} className={clsx(rowCls, nextRowBorderClass())}>
                        <NouSwitch
                          label={<NouText className="font-medium">{t(definition.labelKey)}</NouText>}
                          value={builtinStyles[definition.id]?.enabled ?? true}
                          onPress={() => userStyles$.toggleBuiltin(definition.id)}
                        />
                      </View>
                    ))}
                    {hasRedditSettings ? (
                      <View className={clsx(rowCls, nextRowBorderClass())}>
                        <NouSwitch
                          label={<NouText className="font-medium">{t('settings.redirectToOldReddit')}</NouText>}
                          value={settings.redirectToOldReddit}
                          onPress={() => settings$.redirectToOldReddit.toggle()}
                        />
                      </View>
                    ) : null}
                    {hasXSettings ? (
                      <View className={clsx(rowCls, nextRowBorderClass(), 'flex-row items-center justify-between gap-3')}>
                        <NouText className="flex-1 font-medium">{t('settings.xHomeTimeline.label')}</NouText>
                        <Segemented
                          options={xHomeTimelineValues.map((value) => t(xTimelineLabels[value]))}
                          selectedIndex={Math.max(0, xTimelineIndex)}
                          size={1}
                          onChange={(index) => settings$.xDefaultHomeTimeline.set(xHomeTimelineValues[index])}
                        />
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export const SettingsBookmarksContent = () => {
  const bookmarks = useValue(bookmarks$.bookmarks)

  return (
    <View className="pb-4">
      <NouText className={subheaderCls}>{t('settings.bookmarks.saved')}</NouText>
      <View className={surfaceCls}>
        {!bookmarks.length ? <NouText className="px-4 py-4 text-sm text-zinc-600 dark:text-gray-500">{t('settings.bookmarks.empty')}</NouText> : null}
        {bookmarks.map((bookmark, index) => (
          <View
            className={clsx(
              rowCls,
              'flex-row items-center justify-between gap-5',
              index !== bookmarks.length - 1 && rowBorderCls,
            )}
            key={index}
          >
            <View className="flex-row items-center gap-2 w-[70%]">
              <Image source={bookmark.icon} style={{ width: 24, height: 24 }} />
              <NouText numberOfLines={1}>{bookmark.title}</NouText>
            </View>
            <NouMenu
              trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
              items={[{ label: t('menus.delete'), handler: () => bookmarks$.deleteBookmark(index) }]}
            />
          </View>
        ))}
      </View>
    </View>
  )
}

type SearchProviderDraft = {
  id: string | null
  name: string
  templateUrl: string
}

const emptySearchProviderDraft: SearchProviderDraft = {
  id: null,
  name: '',
  templateUrl: '',
}

export const SettingsSearchContent = () => {
  const enabledSearchProviderIds = useValue(settings$.enabledSearchProviderIds)
  const customSearchProviders = useValue(settings$.customSearchProviders)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<SearchProviderDraft>(emptySearchProviderDraft)

  useEffect(() => {
    if (!draft.id) {
      return
    }

    const provider = customSearchProviders.find((item) => item.id === draft.id)
    if (!provider) {
      setDraft(emptySearchProviderDraft)
      setEditorOpen(false)
    }
  }, [customSearchProviders, draft.id])

  const saveDraft = () => {
    const name = draft.name.trim()
    const templateUrl = draft.templateUrl.trim()
    const duplicateName = customSearchProviders.some(
      (provider) => provider.id !== draft.id && provider.name.trim().toLowerCase() === name.toLowerCase(),
    )

    if (!name) {
      showToast(t('settings.search.validation.name'))
      return
    }

    if (duplicateName) {
      showToast(t('settings.search.validation.duplicateName'))
      return
    }

    if (!isValidSearchTemplate(templateUrl)) {
      showToast(t('settings.search.validation.template'))
      return
    }

    if (draft.id) {
      settings$.updateCustomSearchProvider(draft.id, name, templateUrl)
    } else {
      settings$.addCustomSearchProvider(name, templateUrl)
    }

    setDraft(emptySearchProviderDraft)
    setEditorOpen(false)
  }

  return (
    <View className="pb-4">
      <View>
        <NouText className={subheaderCls}>{t('settings.search.builtin')}</NouText>
        <View className={surfaceCls}>
          {searchSettingsProviderIds.map((providerId, index) => {
            const provider = getResolvedSearchProvider(providerId, customSearchProviders)
            if (!provider) {
              return null
            }

            const enabled = enabledSearchProviderIds.includes(providerId)
            return (
              <View key={provider.id} className={clsx(rowCls, index !== searchSettingsProviderIds.length - 1 && rowBorderCls)}>
                <View className="flex-row items-center gap-3">
                  <SearchProviderIcon provider={provider} />
                  <View className="flex-1">
                    <NouSwitch
                      label={
                        <View className="pr-3">
                          <NouText className="font-medium">{provider.name}</NouText>
                          {provider.id === 'url' ? (
                            <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{t('settings.search.urlHint')}</NouText>
                          ) : null}
                        </View>
                      }
                      value={enabled}
                      disabled={provider.id === 'url'}
                      onPress={() => settings$.toggleSearchProvider(provider.id)}
                    />
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      <View className="mt-10">
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <NouText className="text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500">{t('settings.search.custom')}</NouText>
          <Pressable
            onPress={() => {
              setDraft(emptySearchProviderDraft)
              setEditorOpen(true)
            }}
            className="h-8 w-8 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 active:bg-zinc-200 dark:active:bg-zinc-800"
          >
            <MaterialIcons name="add" size={18} color="#6366f1" />
          </Pressable>
        </View>
        <View className={surfaceCls}>
          {!customSearchProviders.length ? (
            <NouText className="px-4 py-4 text-sm text-zinc-600 dark:text-gray-500">{t('settings.search.empty')}</NouText>
          ) : null}
          {customSearchProviders.map((provider, index) => {
            const enabled = enabledSearchProviderIds.includes(provider.id)
            const resolved = getResolvedSearchProvider(provider.id, customSearchProviders)

            return (
              <View
                key={provider.id}
                className={clsx('px-4 py-4', index !== customSearchProviders.length - 1 && 'border-b border-zinc-300 dark:border-zinc-800')}
              >
                <View className="flex-row items-center gap-3">
                  {resolved ? <SearchProviderIcon provider={resolved} /> : null}
                  <View className="flex-1">
                    <NouText className="font-medium">{provider.name}</NouText>
                    <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
                      {provider.templateUrl}
                    </NouText>
                  </View>
                  <NouButton size="1" variant={enabled ? 'soft' : 'outline'} onPress={() => settings$.toggleSearchProvider(provider.id)}>
                    {enabled ? t('common.on') : t('common.off')}
                  </NouButton>
                </View>
                <View className="mt-3 flex-row flex-wrap justify-end gap-2">
                  <NouButton
                    size="1"
                    variant="outline"
                    onPress={() => {
                      setDraft({
                        id: provider.id,
                        name: provider.name,
                        templateUrl: provider.templateUrl,
                      })
                      setEditorOpen(true)
                    }}
                  >
                    {t('common.edit')}
                  </NouButton>
                  <NouButton
                    size="1"
                    variant="outline"
                    onPress={() => {
                      Alert.alert(t('menus.delete'), t('settings.search.deleteConfirm'), [
                        { text: t('buttons.cancel'), style: 'cancel' },
                        {
                          text: t('menus.delete'),
                          style: 'destructive',
                          onPress: () => settings$.deleteCustomSearchProvider(provider.id),
                        },
                      ])
                    }}
                  >
                    {t('menus.delete')}
                  </NouButton>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {editorOpen ? (
        <BaseCenterModal
          onClose={() => {
            setDraft(emptySearchProviderDraft)
            setEditorOpen(false)
          }}
          containerClassName="max-h-[80vh] overflow-hidden"
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <View className="p-5">
              <NouText className="text-lg font-semibold mb-4">
                {draft.id ? t('settings.search.editTitle') : t('settings.search.addTitle')}
              </NouText>
              <View>
                <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                  {t('settings.search.fields.name')}
                </NouText>
                <TextInput
                  className={textInputCls}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={draft.name}
                  onChangeText={(name) => setDraft((value) => ({ ...value, name }))}
                  placeholder={t('settings.search.fields.namePlaceholder')}
                  placeholderTextColor="#71717a"
                />
              </View>
              <View className="mt-4">
                <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                  {t('settings.search.fields.template')}
                </NouText>
                <TextInput
                  className={textInputCls}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={draft.templateUrl}
                  onChangeText={(templateUrl) => setDraft((value) => ({ ...value, templateUrl }))}
                  placeholder={t('settings.search.fields.templatePlaceholder')}
                  placeholderTextColor="#71717a"
                />
                <NouText className="mt-3 text-sm leading-6 text-zinc-400">{t('settings.search.templateHint')}</NouText>
              </View>
              <View className="mt-6 flex-row justify-end gap-2">
                <NouButton
                  variant="outline"
                  size="1"
                  onPress={() => {
                    setDraft(emptySearchProviderDraft)
                    setEditorOpen(false)
                  }}
                >
                  {t('buttons.cancel')}
                </NouButton>
                <NouButton size="1" onPress={saveDraft}>
                  {draft.id ? t('buttons.save') : t('settings.search.addAction')}
                </NouButton>
              </View>
            </View>
          </ScrollView>
        </BaseCenterModal>
      ) : null}
    </View>
  )
}
