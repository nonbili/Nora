import { NoraView } from '@/modules/nora-view'
import { use$, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { fixSharingUrl, getHomeUrl, hostHomes } from '@/lib/page'
import { NouHeader } from '../header/NouHeader'
import { ScrollView, View } from 'react-native'
import { ObservableHint } from '@legendapp/state'
import type { WebviewTag } from 'electron'
import { clsx, isWeb } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { NoraTab } from '../tab/NoraTab'

export const MainPageContent: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const uiState = use$(ui$)
  const tabs = use$(tabs$.tabs)

  useObserveEffect(tabs$.tabs, ({ value }) => {
    if (!value?.length) {
      tabs$.openTab(getHomeUrl(settings$.home.get()))
    }
  })

  return (
    <View className="flex-1 h-full lg:flex-row overflow-hidden">
      <NouHeader nora={undefined} />
      {isWeb ? (
        <ScrollView
          className={clsx('flex-row', isWeb && 'bg-zinc-600 p-2')}
          horizontal
          contentContainerStyle={{ gap: '0.5rem' }}
        >
          {tabs.map((tab, index) => (
            <NoraTab url={tab.url} contentJs={contentJs} index={index} key={tab.id} />
          ))}
        </ScrollView>
      ) : (
        <NoraTab url={tabs[0]?.url} contentJs={contentJs} index={0} />
      )}
    </View>
  )
}
