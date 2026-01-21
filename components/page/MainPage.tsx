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
import { ContentJsContext } from '@/lib/hooks/useContentJs'
import { Locale, useLocales } from 'expo-localization'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import NoraViewModule from '@/modules/nora-view'

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

  return (
    <ContentJsContext.Provider value={contentJs}>
      <MainPageContent contentJs={contentJs} />
      <NavModal />
      <SettingsModal />
      <BookmarkModal />
      <CookieModal />
      <UrlModal />
      <ToolsModal />
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
