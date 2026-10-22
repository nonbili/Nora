import { type ReactNode, useEffect, useState } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector, MouseButton, PointerType } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useWheelZoom } from './use-wheel-zoom'
import { isWeb } from '@/lib/utils'

/** Gallery media stays enlarged until pinched back or reset with a double tap. */
export function ZoomableMedia({ children, overlay, enabled = true, onZoomChange, style }: {
  children: ReactNode | ((zoomed: boolean) => ReactNode)
  overlay?: (zoomed: boolean, reset: () => void) => ReactNode
  enabled?: boolean
  onZoomChange?: (zoomed: boolean) => void
  style?: StyleProp<ViewStyle>
}) {
  const scale = useSharedValue(1)
  const startScale = useSharedValue(1)
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  const focalX = useSharedValue(0)
  const focalY = useSharedValue(0)
  const [zoomed, setZoomed] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    onZoomChange?.(zoomed)
    return () => onZoomChange?.(false)
  }, [zoomed, onZoomChange])

  const reset = () => {
    scale.value = withTiming(1)
    x.value = withTiming(0)
    y.value = withTiming(0)
    setZoomed(false)
  }
  const clamp = (value: number, dimension: number, zoom: number) => {
    const max = dimension * (zoom - 1) / 2
    return Math.max(-max, Math.min(max, value))
  }
  const ref = useWheelZoom((factor, px, py) => {
    const previous = scale.value
    const next = Math.max(1, Math.min(5, previous * factor))
    const dx = px - size.width / 2
    const dy = py - size.height / 2
    x.value = clamp(dx - (dx - x.value) * next / previous, size.width, next)
    y.value = clamp(dy - (dy - y.value) * next / previous, size.height, next)
    scale.value = next
    setZoomed(next > 1.01)
  }, enabled, (dx, dy) => {
    if (scale.value <= 1 || (!dx && !dy)) return false
    x.value = clamp(x.value - dx, size.width, scale.value)
    y.value = clamp(y.value - dy, size.height, scale.value)
    return true
  })
  const pinch = Gesture.Pinch().runOnJS(true).enabled(enabled)
    .onStart((event) => {
      startScale.value = scale.value
      startX.value = x.value
      startY.value = y.value
      focalX.value = event.focalX - size.width / 2
      focalY.value = event.focalY - size.height / 2
      setZoomed(true)
    })
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(5, startScale.value * event.scale))
      x.value = clamp(event.focalX - size.width / 2 - (focalX.value - startX.value) * scale.value / startScale.value, size.width, scale.value)
      y.value = clamp(event.focalY - size.height / 2 - (focalY.value - startY.value) * scale.value / startScale.value, size.height, scale.value)
    })
    .onFinalize(() => {
      if (scale.value <= 1.01) reset()
    })
  const makePan = () => Gesture.Pan().runOnJS(true).enabled(enabled && zoomed).maxPointers(1)
    .onStart(() => {
      startX.value = x.value
      startY.value = y.value
    })
    .onUpdate((event) => {
      x.value = clamp(startX.value + event.translationX, size.width, scale.value)
      y.value = clamp(startY.value + event.translationY, size.height, scale.value)
    })
  const touchPan = makePan().onTouchesDown((event, manager) => {
    if (isWeb && event.pointerType === PointerType.MOUSE) manager.fail()
  })
  const mousePan = makePan().enabled(isWeb && enabled && zoomed).mouseButton(MouseButton.MIDDLE)
  const doubleTap = Gesture.Tap().runOnJS(true).numberOfTaps(2).enabled(enabled && zoomed).onEnd(reset)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }))

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, touchPan, mousePan, doubleTap)} touchAction={zoomed ? 'none' : 'pan-x'} userSelect="auto" enableContextMenu>
        <View ref={ref} style={{ flex: 1 }} onLayout={(e) => setSize(e.nativeEvent.layout)}>
          <Animated.View style={animatedStyle}>{typeof children === 'function' ? children(zoomed) : children}</Animated.View>
        </View>
      </GestureDetector>
      {overlay?.(zoomed, reset)}
    </View>
  )
}
