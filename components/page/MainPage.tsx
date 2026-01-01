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
import { ContentJsContext } from '@/lib/hooks/useContentJs'
import { useLocales } from 'expo-localization'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enText from '@/locales/en.json'
/* import jaText from '@/locales/ja.json' */

i18n.use(initReactI18next).init({
  /* debug: true, */
  fallbackLng: 'en',
  supportedLngs: ['en'],
  resources: {
    en: {
      translation: enText,
    },
    /* ja: {
     *   translation: jaText,
     * }, */
  },
})

export const MainPage: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const locales = useLocales()

  useEffect(() => {
    i18n.changeLanguage(locales[0].languageCode || undefined)
  }, [locales[0]])

  return (
    <ContentJsContext.Provider value={contentJs}>
      <MainPageContent contentJs={contentJs} />
      <NavModal />
      <SettingsModal />
      <BookmarkModal />
      <CookieModal />
      {nIf(
        !isWeb,
        <>
          <DownloadVideoModal contentJs={contentJs} />
          <TabModal />
        </>,
      )}
    </ContentJsContext.Provider>
  )
}
