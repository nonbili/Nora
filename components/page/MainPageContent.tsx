import { NoraView } from '@/modules/nora-view'
import { use$, useObserve, useObserveEffect } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settings$ } from '@/states/settings'
import { fixSharingUrl, getHomeUrl, hostHomes } from '@/lib/page'
import { NouHeader } from '../header/NouHeader'
import { View } from 'react-native'
import { ObservableHint } from '@legendapp/state'

export const MainPageContent: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const uiState = use$(ui$)
  const nativeRef = useRef<any>(null)

  useEffect(() => {
    const webview = nativeRef.current
    if (webview) {
      ui$.webview.set(ObservableHint.opaque(webview))
    }
  }, [nativeRef])

  const onLoad = async (e: { nativeEvent: any }) => {
    const { url, title } = e.nativeEvent
    if (url) {
      ui$.pageUrl.set(url)
      const { host } = new URL(url)
      settings$.home.set((hostHomes[host] || 'x') as any)
    }
    if (title) {
      ui$.title.set(title)
    }
  }

  const onMessage = async (e: { nativeEvent: { payload: string } }) => {
    const { type, payload } = JSON.parse(e.nativeEvent.payload)
  }

  return (
    <View className="flex-1 h-full lg:flex-row overflow-hidden">
      <NouHeader nora={nativeRef.current} />
      <NoraView
        // @ts-expect-error ??
        ref={nativeRef}
        style={{ flex: 1 }}
        url={uiState.url}
        scriptOnStart={contentJs}
        onLoad={onLoad}
        onMessage={onMessage}
      />
    </View>
  )
}
