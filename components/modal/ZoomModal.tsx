import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { settings$, ZOOM_PRESETS } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { BaseCenterModal } from './BaseCenterModal'
import { NouText } from '../NouText'
import { View, Pressable, useColorScheme } from 'react-native'
import { MaterialButton } from '../button/IconButtons'
import { colors } from '@/lib/colors'
import { getHostFromUrl } from '@/lib/utils'
import { t } from 'i18next'

const getNextZoom = (current: number) => {
  const next = ZOOM_PRESETS.find((preset) => preset > current)
  return next ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1]
}

const getPrevZoom = (current: number) => {
  const reversed = [...ZOOM_PRESETS].reverse()
  const prev = reversed.find((preset) => preset < current)
  return prev ?? ZOOM_PRESETS[0]
}

export const ZoomModal = () => {
  const zoomModalOpen = useValue(ui$.zoomModalOpen)
  const currentTab = useValue(tabs$.currentTab)
  const defaultZoom = useValue(settings$.defaultZoom)
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const siteZoom = useValue(settings$.siteZoom)
  const host = currentTab?.url ? getHostFromUrl(currentTab.url) : ''
  const hostZoom = host ? siteZoom[host] : undefined
  const currentZoom = hostZoom ?? defaultZoom ?? 100
  const isCustomized = hostZoom !== undefined

  const onClose = () => ui$.zoomModalOpen.set(false)

  const handleZoomIn = () => {
    if (!host) return
    const next = getNextZoom(currentZoom)
    settings$.setSiteZoom(host, next)
  }

  const handleZoomOut = () => {
    if (!host) return
    const prev = getPrevZoom(currentZoom)
    settings$.setSiteZoom(host, prev)
  }

  const handleReset = () => {
    if (!host) return
    settings$.setSiteZoom(host, null)
  }

  if (!zoomModalOpen) {
    return null
  }

  return (
    <BaseCenterModal onClose={onClose} align="center" containerClassName="w-[20rem] max-w-[90vw] rounded-2xl">
      <View className="p-5 items-center">
        <NouText className="text-lg font-semibold text-zinc-950 dark:text-white">
          {t('settings.zoom.siteZoomLabel') || 'Page Zoom'}
        </NouText>
        {host ? (
          <NouText className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-4 select-all">
            {host}
          </NouText>
        ) : null}

        <View className="flex-row items-center justify-between w-full px-4 mb-4">
          <MaterialButton
            name="remove"
            disabled={!host || currentZoom <= ZOOM_PRESETS[0]}
            onPress={handleZoomOut}
            color={isDark ? colors.icon : colors.iconLightStrong}
          />
          <NouText className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {currentZoom}%
          </NouText>
          <MaterialButton
            name="add"
            disabled={!host || currentZoom >= ZOOM_PRESETS[ZOOM_PRESETS.length - 1]}
            onPress={handleZoomIn}
            color={isDark ? colors.icon : colors.iconLightStrong}
          />
        </View>

        {isCustomized ? (
          <Pressable onPress={handleReset} hitSlop={12} className="px-4 py-2">
            <NouText className="text-sm font-semibold text-indigo-500 hover:text-indigo-600 active:text-indigo-600">
              {t('common.reset') || 'Reset'}
            </NouText>
          </Pressable>
        ) : (
          <NouText className="text-xs text-zinc-400 dark:text-zinc-500">
            {t('settings.zoom.usingDefault') || 'Using default zoom'}
          </NouText>
        )}
      </View>
    </BaseCenterModal>
  )
}
