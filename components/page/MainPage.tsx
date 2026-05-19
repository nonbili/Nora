import { useValue } from '@legendapp/state/react'
import { useEffect, useState } from 'react'
import { settings$ } from '@/states/settings'
import { MainPageContent } from './MainPageContent'
import { NavModal } from '../modal/NavModal'
import { CookieModal } from '../modal/CookieModal'
import { SettingsModal } from '../modal/SettingsModal'
import { isWeb, nIf } from '@/lib/utils'
import { TabModal } from '../modal/TabModal'
import { BookmarkModal } from '../modal/BookmarkModal'
import { DownloadVideoModal } from '../modal/DownloadVideoModal'
import { UrlModal } from '../modal/UrlModal'
import { ToolsModal } from '../modal/ToolsModal'
import { ProfileEditModal } from '../modal/ProfileEditModal'
import { ProfileLinkModal } from '../modal/ProfileLinkModal'
import { RenameViewModal } from '../modal/RenameViewModal'
import { RenameGroupModal } from '../modal/RenameGroupModal'
import { ContentJsContext } from '@/lib/hooks/useContentJs'
import { useLocales } from 'expo-localization'
import i18n from 'i18next'
import NoraViewModule from '@/modules/nora-view'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query/client'
import { resolveI18nLanguageFromExpoLocale } from '@/lib/i18n'

export const MainPage: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const locales = useLocales()
  const selectedLanguage = useValue(settings$.language)
  const [, setLanguageRevision] = useState(0)

  useEffect(() => {
    let active = true

    const applyLanguage = async () => {
    const systemLanguage = resolveI18nLanguageFromExpoLocale(locales[0]) || 'en'
    const language = selectedLanguage || systemLanguage
      if (i18n.language !== language) {
        await i18n.changeLanguage(language)
      }
      if (!active) {
        return
      }
      if (!isWeb) {
        const strings = i18n.t('native', { returnObjects: true })
        NoraViewModule.setLocaleStrings(strings)
      }
      setLanguageRevision((v) => v + 1)
    }

    void applyLanguage()

    return () => {
      active = false
    }
  }, [locales, selectedLanguage])

  return (
    <ContentJsContext.Provider value={contentJs}>
      <QueryClientProvider client={queryClient}>
        <MainPageContent contentJs={contentJs} />
        <NavModal />
        {nIf(!isWeb, <SettingsModal />)}
        <BookmarkModal />
        <CookieModal />
        <UrlModal />
        <ToolsModal />
        <ProfileEditModal />
        <ProfileLinkModal />
        <RenameGroupModal />
        <RenameViewModal />
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
