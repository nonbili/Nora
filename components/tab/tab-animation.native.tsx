import { useEffect, useRef } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

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
  const inset = useSharedValue(hideableHeader && headerShown ? headerHeight : 0)
  const isFirstRender = useRef(true)

  useEffect(() => {
    const targetInset = hideableHeader && headerShown ? headerHeight : 0
    if (isFirstRender.current) {
      inset.value = targetInset
      isFirstRender.current = false
    } else {
      inset.value = withTiming(targetInset)
    }
  }, [headerHeight, headerShown, hideableHeader, inset])

  const style = useAnimatedStyle(() => {
    return {
      top: headerPosition === 'top' ? inset.value : 0,
      bottom: headerPosition === 'bottom' ? inset.value : 0,
    }
  }, [headerPosition])

  return {
    Root: Animated.View,
    style,
  }
}
