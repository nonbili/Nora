import { View } from 'react-native'

export function useHeaderAnimation({
  autoHideHeader,
  headerHeight,
  headerShown,
  hideToolbarWhenScrolled,
}: {
  autoHideHeader: boolean
  doubleTapToToggleHeader: boolean
  headerHeight: number
  headerPosition: 'top' | 'bottom'
  headerShown: boolean
  hideToolbarWhenScrolled: boolean
}) {
  return {
    Root: View,
    style: {
      marginTop: (autoHideHeader || hideToolbarWhenScrolled) && !headerShown ? -headerHeight : 0,
    },
  }
}
