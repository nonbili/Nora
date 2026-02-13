import { NoraView } from '@/modules/nora-view'
import { useValue, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { NouHeader } from '../header/NouHeader'
import { ScrollView, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { NoraTab } from '../tab/NoraTab'
import { NouButton } from '../button/NouButton'
import { NavModalContent } from '../modal/NavModal'
import { SortableNoraTabs } from '../tab/SortableNoraTabs'
import { auth$ } from '@/states/auth'
import { useMe } from '@/lib/hooks/useMe'
import { syncSupabase } from '@/lib/supabase/sync'

export const MainPageContent: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const headerPosition = useValue(settings$.headerPosition)
  const { tabs, activeTabIndex } = useValue(tabs$)
  const { userId, me } = useMe()

  useEffect(() => {
    auth$.plan.set(me?.plan)
    if (userId && me?.plan && me.plan != 'free') {
      syncSupabase()
      const timer = setInterval(
        () => syncSupabase(),
        10 * 60 * 1000, // 10 minutes
      )
      return () => clearInterval(timer)
    }
  }, [me?.plan, userId])

  return (
    <View className={clsx('flex-1 h-full overflow-hidden', headerPosition == 'bottom' && 'flex-col-reverse')}>
      <NouHeader />
      {isWeb && tabs.length ? (
        <SortableNoraTabs tabs={tabs} />
      ) : tabs.length ? (
        <View className="flex-1">
          {tabs.map((tab, index) => (
            <NoraTab tab={tab} index={index} key={tab.id} />
          ))}
        </View>
      ) : (
        <View className="flex-1 bg-gray-950 lg:px-20">
          <NavModalContent />
        </View>
      )}
    </View>
  )
}
