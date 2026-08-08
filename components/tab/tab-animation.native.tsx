import { View } from 'react-native'

// The inset is plain layout, not a Reanimated value. The tab is absolutely positioned and
// the webview has to genuinely resize, so the inset must survive re-renders: switching
// tabs re-renders every NoraTab (isActive drives opacity/zIndex), and an animated margin
// does not carry across that, which left every tab but the first one sitting under the
// toolbar.
export function useTabAnimation({
  headerHeight,
  headerShown,
  hideableHeader,
  headerPosition,
}: {
  headerHeight: number
  headerShown: boolean
  hideableHeader: boolean
  headerPosition: 'top' | 'bottom'
}) {
  const inset = hideableHeader && headerShown ? headerHeight : 0

  return {
    Root: View,
    style: {
      marginTop: headerPosition === 'top' ? inset : 0,
      marginBottom: headerPosition === 'bottom' ? inset : 0,
    },
  }
}
