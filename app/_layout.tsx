import '@/lib/i18n'
import './global.css'

import { StatusBar } from 'expo-status-bar'
import { Appearance, View } from 'react-native'
import { useObserveEffect } from '@legendapp/state/react'
import { Slot } from 'expo-router'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { settings$ } from '@/states/settings'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

export default function RootLayout() {
  useObserveEffect(settings$.theme, ({ value }) => {
    Appearance.setColorScheme(value)
  })

  const insets = useSafeAreaInsets()

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View className="bg-zinc-800" style={{ height: insets.top, zIndex: 10 }} />
      <GestureHandlerRootView>
        <Slot />
      </GestureHandlerRootView>
      <View className="bg-zinc-800" style={{ height: insets.bottom }} />
    </SafeAreaProvider>
  )
}
