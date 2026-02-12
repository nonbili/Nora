import { NoraView } from '@/modules/nora-view'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { MainPageContent } from './MainPageContent'
import { NavModal } from '../modal/NavModal'
import { SettingsModal } from '../modal/SettingsModal'
import { CookieModal } from '../modal/CookieModal'
import { isWeb, nIf } from '@/lib/utils'
import { TabModal } from '../modal/TabModal'
import { BookmarkModal } from '../modal/BookmarkModal'
import { DownloadVideoModal } from '../modal/DownloadVideoModal'
import { UrlModal } from '../modal/UrlModal'
import { ToolsModal } from '../modal/ToolsModal'
import { ProfileEditModal } from '../modal/ProfileEditModal'
import { ContentJsContext } from '@/lib/hooks/useContentJs'
import { Locale, useLocales } from 'expo-localization'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import NoraViewModule from '@/modules/nora-view'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query/client'
import { useMe } from '@/lib/hooks/useMe'
import { auth$ } from '@/states/auth'
import { supabaseAuth } from '@/lib/supabase/client'

function expoLocaleToI18nLocale(locale: Locale): string | undefined {
  const { languageCode, languageScriptCode } = locale
  if (languageCode == 'zh') {
    return `${languageCode}_${languageScriptCode}`
  }
  return languageCode || undefined
}

export const MainPage: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const locales = useLocales()

  useEffect(() => {
    i18n.changeLanguage(expoLocaleToI18nLocale(locales[0]))
    if (!isWeb) {
      const strings = i18n.t('native', { returnObjects: true })
      NoraViewModule.setLocaleStrings(strings)
    }
  }, [locales[0]])

  useEffect(() => {
    supabaseAuth.onAuthStateChange((event, session) => {
      // console.log('onAuthStateChange', event, session)
      auth$.assign({
        loaded: true,
        userId: session?.user.id,
        user: session?.user.user_metadata,
        accessToken: session?.access_token,
      })
    })
  }, [])

  return (
    <ContentJsContext.Provider value={contentJs}>
      <QueryClientProvider client={queryClient}>
        <MainPageContent contentJs={contentJs} />
        <NavModal />
        <SettingsModal />
        <BookmarkModal />
        <CookieModal />
        <UrlModal />
        <ToolsModal />
        <ProfileEditModal />
        {nIf(
          !isWeb,
          <>
            <DownloadVideoModal contentJs={contentJs} />
            <TabModal />
          </>,
        )}
      </QueryClientProvider>
    </ContentJsContext.Provider>
  )
}
