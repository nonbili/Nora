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
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated'

export const MainPageContent: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const headerPosition = useValue(settings$.headerPosition)
  const tabs = useValue(tabs$.tabs)
  /* const headerHeight = useValue(ui$.headerHeight) */
  const uiState = useValue(ui$)
  /* const headerShown = useValue(ui$.headerShown) */
  /* const headerShown = useSharedValue(true) */
  const headerHidden = useSharedValue(false)
  /* const [headerShown, setHeaderShown] = useState(true) */
  const autoHideHeader = useValue(settings$.autoHideHeader)

  useEffect(() => {
    migrateDisabledServices()
  }, [])

  const marginTop = useSharedValue(0)

  /* console.log('- headerShown0', headerShown.value) */
  const gesture = Gesture.Pan()
    .onBegin(() => {
      /* isPressed.value = true; */
    })
    .onUpdate((e) => {
      const headerHeight = 40
      /* const headerHeight = ui$.headerHeight.peek() */
      const dy = e.translationY
      /* console.log('- onUpdate', { dy, headerHeight, headerShown }) */
      /* const headerHeight = ui$.headerHeight.get() */
      if (Math.abs(dy) <= headerHeight / 2) {
        return
      }
      /* const headerShown = ui$.headerShown.get() */
      /* if (headerShown) { */
      /* console.log('- headerShown', headerShown.value) */
      console.log('- headerHidden', headerHidden.value)
      if (!headerHidden.value) {
        if (dy < 0) {
          /* setHeaderShown(false) */
          console.log('- false')
          /* headerShown.value = false */
          headerHidden.value = true
          marginTop.value = withTiming(autoHideHeader && headerHidden.value ? -uiState.headerHeight : 0)
          /* showHeader(false) */
          /* ui$.headerShown.set(false) */
        }
      } else if (dy > 0) {
        /* setHeaderShown(true) */
        console.log('- true')
        /* headerShown.value = true */
        headerHidden.value = false
        marginTop.value = withTiming(autoHideHeader && headerHidden.value ? -uiState.headerHeight : 0)
        /* showHeader(true) */
        /* ui$.headerShown.set(true) */
      }
    })
    .onEnd(() => {
      /* start.value = {
       *   x: offset.value.x,
       *   y: offset.value.y,
       * }; */
    })
    .onFinalize(() => {
      /* isPressed.value = false; */
    })

  /* useEffect(() => {
   *   if (!uiState.headerHeight) {
   *     return
   *   }
   *   marginTop.value = withTiming(autoHideHeader && headerHidden.value ? -uiState.headerHeight : 0)
   *   console.log('- marginTop', marginTop.value)
   * }, [autoHideHeader, headerHidden.value, uiState.headerHeight])
   * marginTop.value = withTiming(autoHideHeader && headerHidden.value ? -uiState.headerHeight : 0)
   * console.log('- marginTop', marginTop.value) */

  /* useEffect(() => {
   *   if (!uiState.headerHeight) {
   *     return
   *   }
   *   marginTop.value = withTiming(autoHideHeader && !headerShown.value ? -uiState.headerHeight : 0)
   *   console.log('- marginTop', marginTop.value)
   * }, [autoHideHeader, headerShown.value, uiState.headerHeight]) */

  /* console.log('- header', uiState.headerHeight, headerHidden.value) */
  return (
    <View
      className={clsx('flex-1 h-full lg:flex-row overflow-hidden', headerPosition == 'bottom' && 'flex-col-reverse')}
    >
      <Animated.View style={{ marginTop }}>
        <NouHeader />
      </Animated.View>

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
      ) : tabs.length ? (
        /* <GestureDetector gesture={gesture}> */
        <View className="flex-1">
          {tabs.map((tab, index) => (
            <NoraTab url={tab.url} contentJs={contentJs} index={index} key={tab.id} />
          ))}
        </View>
      ) : (
        /* </GestureDetector> */
        <View className="flex-1 bg-gray-950">
          <NavModalContent />
        </View>
      )}
    </View>
  )
}
