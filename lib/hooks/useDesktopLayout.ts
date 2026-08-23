import { useWindowDimensions } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { isWeb } from '@/lib/utils'
import { settings$ } from '@/states/settings'

// Android desktop mode puts the app in a resizable window on a large external
// display, where the phone layout wastes most of the screen. The window width is
// the signal that matters for the layout, so it also covers tablets and
// foldables that are wide enough for the desktop workspace.
export const DESKTOP_LAYOUT_MIN_WIDTH = 900

// Phones get wide enough in landscape to pass the width threshold on their own
// (an iPhone Pro Max is 926pt wide, a 1080p Android phone lands around 914dp),
// which would swap the whole tab tree on every rotation and remount every
// WebView, reloading the page and losing video playback. The short side never
// changes with rotation, so requiring a tablet-sized one keeps rotation out of
// the decision.
export const DESKTOP_LAYOUT_MIN_SHORT_SIDE = 600

/**
 * Pure form of the auto-mode decision, so the rotation behaviour is testable
 * without mounting a component.
 */
export const shouldUseDesktopLayout = (width: number, height: number) =>
  width >= DESKTOP_LAYOUT_MIN_WIDTH && Math.min(width, height) >= DESKTOP_LAYOUT_MIN_SHORT_SIDE

/**
 * True when the desktop workspace (tab groups plus deck/split/grid views) should
 * replace the single fullscreen tab. Always true on web, where the desktop app
 * has no other layout.
 */
export const useDesktopLayout = () => {
  const { width, height } = useWindowDimensions()
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
  return shouldUseDesktopLayout(width, height)
}
