import '@/lib/i18n'
import '@/lib/mention-notifications'
import './global.css'

import { StatusBar } from 'expo-status-bar'
import { AppState, Appearance, View, useColorScheme } from 'react-native'
import { useObserveEffect, useValue } from '@legendapp/state/react'
import { Slot } from 'expo-router'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { settings$ } from '@/states/settings'
import { useEffect } from 'react'
import { applyPalette, getDynamicPalette } from '@/lib/dynamic-palette'
import { dynamicPalette$ } from '@/lib/theme'

function RootLayoutContent() {
  useObserveEffect(settings$.theme, ({ value }) => {
    Appearance.setColorScheme(value ?? 'unspecified')
  })

  const dynamicColor = useValue(settings$.dynamicColor)
  useEffect(() => {
    const update = () => {
      const palette = dynamicColor ? getDynamicPalette() : null
      if (JSON.stringify(palette) !== JSON.stringify(dynamicPalette$.peek())) {
        dynamicPalette$.set(palette)
        applyPalette(palette)
      }
    }
    update()
    // The wallpaper may have changed while the app was in the background.
    const sub = AppState.addEventListener('change', (state) => state === 'active' && update())
    return () => sub.remove()
  }, [dynamicColor])

  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className={isDark ? 'bg-zinc-800' : 'bg-zinc-100'} style={{ height: insets.top, zIndex: 10 }} />
      <Slot />
      <View className={isDark ? 'bg-zinc-800' : 'bg-zinc-100'} style={{ height: insets.bottom }} />
    </>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RootLayoutContent />
    </SafeAreaProvider>
  )
}
