import { NoraView } from '@/modules/nora-view'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { migrateDisabledServices, settings$ } from '@/states/settings'
import { fixSharingUrl, getHomeUrl, hostHomes } from '@/lib/page'
import { NouHeader } from '../header/NouHeader'
import { ScrollView, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { NoraTab } from '../tab/NoraTab'
import { NouButton } from '../button/NouButton'
import { NavModalContent } from '../modal/NavModal'

export const MainPageContent: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const headerPosition = useValue(settings$.headerPosition)
  const tabs = useValue(tabs$.tabs)

  useEffect(() => {
    migrateDisabledServices()
  }, [])

  return (
    <View
      className={clsx('flex-1 h-full lg:flex-row overflow-hidden', headerPosition == 'bottom' && 'flex-col-reverse')}
    >
      <NouHeader />
      {isWeb ? (
        <ScrollView
          className={clsx('flex-row', isWeb && 'bg-zinc-600 p-2')}
          horizontal
          contentContainerStyle={{ gap: '0.5rem' }}
        >
          {tabs.map((tab, index) => (
            <NoraTab tab={tab} contentJs={contentJs} index={index} key={tab.id} />
          ))}
        </ScrollView>
      ) : tabs.length ? (
        <View className="flex-1">
          {tabs.map((tab, index) => (
            <NoraTab tab={tab} contentJs={contentJs} index={index} key={tab.id} />
          ))}
        </View>
      ) : (
        <View className="flex-1 bg-gray-950">
          <NavModalContent />
        </View>
      )}
    </View>
  )
}
