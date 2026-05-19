import { BackHandler, Linking, Pressable, ScrollView, View, useColorScheme, useWindowDimensions } from 'react-native'
import { NouText } from '../NouText'
import { version } from '../../package.json'
import { version as desktopVersion } from '../../desktop/package.json'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx, isWeb } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { BaseModal } from './BaseModal'
import {
  SettingsBrowsingContent,
  SettingsAppearanceContent,
  SettingsProfilesContent,
  SettingsServicesContent,
  SettingsBookmarksContent,
  SettingsSearchContent,
} from './SettingsModalTabSettings'
import { SettingsUserStylesContent } from './SettingsUserStylesContent'
import { t } from 'i18next'
import { SettingsModalTabSync } from './SettingsModalTabSync'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { auth$ } from '@/states/auth'
import { capitalize } from 'es-toolkit'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supportsRuntimeBlocklist } from '@/lib/blocklist'
import { SettingsChangelogContent } from './SettingsModalTabChangelog'
import { SettingsUsageLimitsContent } from './SettingsUsageLimitsContent'
import { queryClient } from '@/lib/query/client'
import { getReleaseFeedQuery } from '@/lib/query/changelog'
import { settingsUi, SettingsSection, SettingsSurface } from './SettingsPrimitives'
import { colors } from '@/lib/colors'

const repo = 'https://github.com/nonbili/Nora'
const donateLinks = [
  { label: 'GitHub Sponsors', detail: 'github.com/sponsors/rnons', url: 'https://github.com/sponsors/rnons' },
  { label: 'Liberapay', detail: 'liberapay.com/rnons', url: 'https://liberapay.com/rnons' },
  { label: 'PayPal', detail: 'paypal.me/rnons', url: 'https://paypal.me/rnons' },
]
type SettingsPage = 'home' | 'browsing' | 'styles' | 'appearance' | 'services' | 'profiles' | 'bookmarks' | 'search' | 'sync' | 'about' | 'changelog' | 'usageLimits'

const SettingsNavRow: React.FC<{
  title: string
  description: string
  icon: keyof typeof MaterialIcons.glyphMap
  meta?: string
  onPress: () => void
  isLast?: boolean
}> = ({ title, description, icon, meta, onPress, isLast = false }) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  return (
    <Pressable
      onPress={onPress}
      className={clsx(
        'flex-row items-center gap-3 px-4 py-4 active:bg-zinc-200/80 dark:active:bg-zinc-800/80',
        !isLast && 'border-b border-zinc-300 dark:border-zinc-800',
      )}
    >
      <View className={settingsUi.iconWrapCls}>
        <MaterialIcons name={icon} color={isDark ? colors.icon : colors.iconLightStrong} size={18} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <NouText className="flex-1 font-medium">{title}</NouText>
          {meta ? <NouText className="text-xs uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-500">{meta}</NouText> : null}
        </View>
        <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{description}</NouText>
      </View>
      <MaterialIcons name="chevron-right" color={isDark ? '#71717a' : '#52525b'} size={20} />
    </Pressable>
  )
}

const SettingsExternalRow: React.FC<{
  title: string
  detail: string
  href: string
  icon?: keyof typeof MaterialIcons.glyphMap
  isLast?: boolean
}> = ({ title, detail, href, icon = 'open-in-new', isLast = false }) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  return (
    <Pressable
      onPress={() => {
        void Linking.openURL(href)
      }}
      className={clsx(
        'flex-row items-center gap-3 px-4 py-4 active:bg-zinc-200/80 dark:active:bg-zinc-800/80',
        !isLast && 'border-b border-zinc-300 dark:border-zinc-800',
      )}
    >
      <View className={settingsUi.iconWrapCls}>
        <MaterialIcons name={icon} color={isDark ? colors.icon : colors.iconLightStrong} size={18} />
      </View>
      <View className="flex-1">
        <NouText className="font-medium">{title}</NouText>
        <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{detail}</NouText>
      </View>
      <MaterialIcons name="chevron-right" color={isDark ? '#71717a' : '#52525b'} size={20} />
    </Pressable>
  )
}

function formatPlanLabel(plan?: string) {
  return plan ? capitalize(plan) : 'Free'
}

export const SettingsModal = () => {
  const settingsModalOpen = useValue(ui$.settingsModalOpen)
  const urlModalOpen = useValue(ui$.urlModalOpen)
  const cookieModalOpen = useValue(ui$.cookieModalOpen)
  const profileModalOpen = useValue(ui$.profileModalOpen)
  const userStyleModalOpen = useValue(ui$.userStyleModalOpen)
  const userScriptModalOpen = useValue(ui$.userScriptModalOpen)
  const theme = useValue(settings$.theme)
  const { user, plan } = useValue(auth$)
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  const { width } = useWindowDimensions()
  const [pageStack, setPageStack] = useState<SettingsPage[]>(['home'])
  const scrollRef = useRef<ScrollView>(null)
  const scrollPositionsRef = useRef<Partial<Record<SettingsPage, number>>>({ home: 0 })

  const isNarrowNative = !isWeb && width < 768
  const currentPage = pageStack[pageStack.length - 1]
  const canGoBack = pageStack.length > 1
  const appVersion = isWeb ? desktopVersion : version
  const planLabel = formatPlanLabel(plan)
  const themeLabel =
    theme === 'dark' ? t('settings.theme.dark') : theme === 'light' ? t('settings.theme.light') : t('settings.theme.system')
  const showBlocklist = supportsRuntimeBlocklist()
  const showBrowsing = !isWeb || showBlocklist
  const showSync = true
  const browsingDescription = !isWeb ? t('settings.browsing.descriptionNative') : t('settings.browsing.descriptionWeb')
  const syncDescription = user
    ? plan
      ? user.email
      : t('sync.upgradeHint')
    : t('sync.hint')

  useEffect(() => {
    if (!settingsModalOpen) {
      setPageStack(['home'])
      return
    }

    void queryClient.prefetchQuery(getReleaseFeedQuery())
  }, [settingsModalOpen])

  const closeSettingsChildren = useCallback(() => {
    ui$.assign({
      urlModalOpen: false,
      cookieModalOpen: false,
      profileModalOpen: false,
      editingProfileId: null,
      userStyleModalOpen: false,
      editingUserStyleId: null,
      previewBuiltinId: null,
      userScriptModalOpen: false,
      editingUserScriptId: null,
    })
  }, [])

  const closeSettingsTree = useCallback(() => {
    closeSettingsChildren()
    ui$.settingsModalOpen.set(false)
  }, [closeSettingsChildren])

  const closeTopOverlay = useCallback(() => {
    if (profileModalOpen) {
      ui$.assign({ profileModalOpen: false, editingProfileId: null })
      return true
    }
    if (cookieModalOpen) {
      ui$.cookieModalOpen.set(false)
      return true
    }
    if (urlModalOpen) {
      ui$.urlModalOpen.set(false)
      return true
    }
    return false
  }, [cookieModalOpen, profileModalOpen, urlModalOpen])

  const pushPage = useCallback((page: SettingsPage) => {
    setPageStack((stack) => (stack[stack.length - 1] === page ? stack : stack.concat(page)))
  }, [])

  const popPage = useCallback(() => {
    setPageStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack))
  }, [])

  const handleBack = useCallback(() => {
    if (currentPage === 'styles' && (userStyleModalOpen || userScriptModalOpen)) {
      ui$.assign({
        userStyleModalOpen: false,
        editingUserStyleId: null,
        previewBuiltinId: null,
        userScriptModalOpen: false,
        editingUserScriptId: null,
      })
      return true
    }
    if (closeTopOverlay()) {
      return true
    }
    if (canGoBack) {
      popPage()
      return true
    }
    closeSettingsTree()
    return true
  }, [canGoBack, closeSettingsTree, closeTopOverlay, currentPage, popPage, userScriptModalOpen, userStyleModalOpen])

  useEffect(() => {
    if (!settingsModalOpen || isWeb) {
      return
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack)
    return () => subscription.remove()
  }, [handleBack, settingsModalOpen])

  useEffect(() => {
    if (!settingsModalOpen || !isWeb || typeof window === 'undefined' || !window.addEventListener) {
      return
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return
      }
      handleBack()
      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('keyup', onKeyUp, true)
    return () => window.removeEventListener('keyup', onKeyUp, true)
  }, [handleBack, settingsModalOpen])

  useEffect(() => {
    const y = scrollPositionsRef.current[currentPage] ?? 0
    scrollRef.current?.scrollTo({ y, animated: false })
  }, [currentPage])

  const pageMeta: Record<SettingsPage, string> = {
    home: t('settings.label'),
    browsing: t('settings.pages.browsing'),
    styles: t('settings.userStyles.label'),
    appearance: t('settings.pages.appearance'),
    services: t('settings.pages.services'),
    profiles: t('settings.pages.profiles'),
    bookmarks: t('settings.pages.bookmarks'),
    search: t('settings.pages.search'),
    sync: t('sync.label'),
    about: t('common.about'),
    changelog: t('changelog.label'),
    usageLimits: t('usageLimits.label'),
  }

  const renderPage = () => {
    if (currentPage === 'home') {
      return (
        <View className="gap-8">
          <SettingsSection label={t('settings.sections.general')}>
            <SettingsSurface>
              {showBrowsing ? (
                <SettingsNavRow
                  title={t('settings.pages.browsing')}
                  description={browsingDescription}
                  icon="tune"
                  onPress={() => pushPage('browsing')}
                />
              ) : null}
              <SettingsNavRow
                title={t('settings.pages.appearance')}
                description={t('settings.appearance.description')}
                icon="palette"
                meta={themeLabel}
                onPress={() => pushPage('appearance')}
              />
              <SettingsNavRow
                title={t('settings.pages.services')}
                description={t('settings.services.description')}
                icon="apps"
                onPress={() => pushPage('services')}
              />
              <SettingsNavRow
                title={t('settings.userStyles.label')}
                description={t('settings.userStyles.customHint')}
                icon="brush"
                onPress={() => pushPage('styles')}
              />
              <SettingsNavRow
                title={t('usageLimits.label')}
                description={t('usageLimits.description')}
                icon="hourglass-empty"
                onPress={() => pushPage('usageLimits')}
                isLast
              />
            </SettingsSurface>
          </SettingsSection>

          <SettingsSection label={t('settings.sections.accounts')}>
            <SettingsSurface>
              <SettingsNavRow
                title={t('settings.pages.profiles')}
                description={t('settings.profiles.description')}
                icon="people"
                onPress={() => pushPage('profiles')}
              />
              <SettingsNavRow
                title={t('settings.pages.bookmarks')}
                description={t('settings.bookmarks.description')}
                icon="bookmark"
                onPress={() => pushPage('bookmarks')}
              />
              <SettingsNavRow
                title={t('settings.pages.search')}
                description={t('settings.search.description')}
                icon="manage-search"
                onPress={() => pushPage('search')}
                isLast={!showSync}
              />
              {showSync ? (
                <SettingsNavRow
                  title={t('sync.label')}
                  description={syncDescription}
                  icon="sync"
                  meta={planLabel}
                  onPress={() => pushPage('sync')}
                  isLast
                />
              ) : null}
            </SettingsSurface>
          </SettingsSection>

          <SettingsSection label={t('common.about')}>
            <SettingsSurface>
              <SettingsNavRow
                title={t('common.about')}
                description={t('about.hint')}
                icon="info-outline"
                meta={`v${appVersion}`}
                onPress={() => pushPage('about')}
              />
              <SettingsNavRow
                title={t('changelog.label')}
                description={t('changelog.hint')}
                icon="history"
                onPress={() => pushPage('changelog')}
                isLast
              />
            </SettingsSurface>
          </SettingsSection>
        </View>
      )
    }

    if (currentPage === 'browsing') return <SettingsBrowsingContent />
    if (currentPage === 'styles') return <SettingsUserStylesContent />
    if (currentPage === 'appearance') return <SettingsAppearanceContent />
    if (currentPage === 'services') return <SettingsServicesContent />
    if (currentPage === 'profiles') return <SettingsProfilesContent />
    if (currentPage === 'bookmarks') return <SettingsBookmarksContent />
    if (currentPage === 'search') return <SettingsSearchContent />
    if (currentPage === 'changelog') return <SettingsChangelogContent />
    if (currentPage === 'usageLimits') return <SettingsUsageLimitsContent />

    if (currentPage === 'sync' && showSync) {
      return <SettingsModalTabSync />
    }

    return (
      <View className="gap-6">
        <View className="rounded-[28px] border border-zinc-300 dark:border-zinc-800 bg-zinc-100/90 dark:bg-zinc-900/80 px-5 py-5">
          <NouText className="text-[11px] uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-500">Nora</NouText>
          <NouText className="mt-2 text-xl font-semibold tracking-tight">v{appVersion}</NouText>
        </View>

        <SettingsSection label={t('about.code')}>
          <SettingsSurface>
            <SettingsExternalRow title="GitHub" detail="github.com/nonbili/Nora" href={repo} icon="code" isLast />
          </SettingsSurface>
        </SettingsSection>

        <SettingsSection label={t('about.donate')}>
          <SettingsSurface>
            {donateLinks.map((item, index) => (
              <SettingsExternalRow
                key={item.url}
                title={item.label}
                detail={item.detail}
                href={item.url}
                isLast={index === donateLinks.length - 1}
              />
            ))}
          </SettingsSurface>
        </SettingsSection>
      </View>
    )
  }

  const content = (
    <View className="flex-1 bg-zinc-100 dark:bg-zinc-950">
      <View className="border-b border-zinc-300 dark:border-zinc-800 px-3 py-3">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={handleBack} className="h-11 w-11 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-900">
            <MaterialIcons name={canGoBack ? 'arrow-back' : 'close'} color={isDark ? '#f8fafc' : '#334155'} size={22} />
          </Pressable>
          <View className="flex-1">
            <NouText className="text-lg font-semibold">{pageMeta[currentPage]}</NouText>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollPositionsRef.current[currentPage] = e.nativeEvent.contentOffset.y
        }}
      >
        <View className="px-4 py-5">
          {renderPage()}
          <View className="h-16" />
        </View>
      </ScrollView>
    </View>
  )

  if (!settingsModalOpen) {
    return null
  }

  if (isWeb) {
    return (
      <View className="h-full w-[30rem] max-w-[42vw] shrink-0 border-r border-zinc-300 bg-zinc-100 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950">
        {content}
      </View>
    )
  }

  return isNarrowNative ? (
    <View className="absolute inset-0 z-10 bg-zinc-100 dark:bg-zinc-950">
      <SafeAreaView className="flex-1" edges={['top']}>
        {content}
      </SafeAreaView>
    </View>
  ) : (
    <BaseModal onClose={closeSettingsTree} onRequestClose={handleBack} className="bg-transparent" useNativeModal={false}>
      {content}
    </BaseModal>
  )
}
