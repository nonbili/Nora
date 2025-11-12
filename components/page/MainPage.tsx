import { NoraView } from '@/modules/nora-view'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { fixSharingUrl, getHomeUrl, hostHomes } from '@/lib/page'
import { MainPageContent } from './MainPageContent'
import { NavModal } from '../modal/NavModal'
import { SettingsModal } from '../modal/SettingsModal'
import { CookieModal } from '../modal/CookieModal'
import { isWeb, nIf } from '@/lib/utils'
import { TabModal } from '../modal/TabModal'
import { BookmarkModal } from '../modal/BookmarkModal'
import { DownloadVideoModal } from '../modal/DownloadVideoModal'

export const MainPage: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  return (
    <>
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
    </>
  )
}
