import { useEffect } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

export function useHeaderAnimation({
  autoHideHeader,
  doubleTapToToggleHeader,
  headerHeight,
  headerPosition,
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
  const translateY = useSharedValue(0)

  useEffect(() => {
    const canHide = autoHideHeader || hideToolbarWhenScrolled || doubleTapToToggleHeader
    const hiddenOffset = headerPosition === 'bottom' ? headerHeight : -headerHeight
    translateY.value = withTiming(canHide && !headerShown ? hiddenOffset : 0)
  }, [autoHideHeader, doubleTapToToggleHeader, headerHeight, headerPosition, headerShown, hideToolbarWhenScrolled, translateY])

  const style = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    }
  }, [translateY])

  return {
    Root: Animated.View,
    style,
  }
}
