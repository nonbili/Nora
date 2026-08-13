import { useWindowDimensions } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { isWeb } from '@/lib/utils'
import { settings$ } from '@/states/settings'

// Android desktop mode puts the app in a resizable window on a large external
// display, where the phone layout wastes most of the screen. The window width is
// the signal that matters for the layout, so it also covers tablets and
// foldables that are wide enough for the desktop workspace.
export const DESKTOP_LAYOUT_MIN_WIDTH = 900

/**
 * True when the desktop workspace (tab groups plus deck/split/grid views) should
 * replace the single fullscreen tab. Always true on web, where the desktop app
 * has no other layout.
 */
export const useDesktopLayout = () => {
  const { width } = useWindowDimensions()
  const mode = useValue(settings$.desktopLayout)

  if (isWeb) {
    return true
  }
  if (mode === 'on') {
    return true
  }
  if (mode === 'off') {
    return false
  }
  return width >= DESKTOP_LAYOUT_MIN_WIDTH
}
