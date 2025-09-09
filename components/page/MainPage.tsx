import { NoraView } from '@/modules/nora-view'
import { use$, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { fixSharingUrl, getHomeUrl, hostHomes } from '@/lib/page'
import { MainPageContent } from './MainPageContent'
import { NavModal } from '../modal/NavModal'
import { SettingsModal } from '../modal/SettingsModal'
import { CookieModal } from '../modal/CookieModal'

export const MainPage: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  return (
    <>
      <MainPageContent contentJs={contentJs} />
      <NavModal />
      <SettingsModal />
      <CookieModal />
    </>
  )
}
