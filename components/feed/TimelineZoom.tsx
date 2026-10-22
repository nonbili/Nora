import { type ReactNode, useRef, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector, MouseButton, PointerType } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useWheelZoom } from './use-wheel-zoom'
import { isWeb } from '@/lib/utils'

/** Keep the list's width fixed: magnify it without reflowing or remounting its rows. */
export function TimelineZoom({ children, onScaleChange }: {
  children: ReactNode
  onScaleChange: (oldScale: number, newScale: number, focalY: number) => void
}) {
  const scale = useSharedValue(1)
  const x = useSharedValue(0)
  const start = useRef({ scale: 1, x: 0, focalX: 0 })
  const panX = useSharedValue(0)
  const [zoomed, setZoomed] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const clampX = (value: number, zoom: number) => Math.max(size.width * (1 - zoom), Math.min(0, value))
  const changeScale = (next: number, focalX: number, focalY: number) => {
    const previous = scale.value
    const zoom = Math.max(1, Math.min(3, next))
    x.value = clampX(focalX - (focalX - x.value) * zoom / previous, zoom)
    scale.value = zoom
    onScaleChange(previous, zoom, focalY)
  }
  const ref = useWheelZoom((factor, focalX, focalY) => {
    changeScale(scale.value * factor, focalX, focalY)
    setZoomed(scale.value > 1.01)
  }, true, (dx, dy) => {
    // Vertical wheel gestures keep scrolling the list. Horizontal gestures pan
    // its magnified content, including Shift+wheel on a conventional mouse.
    if (scale.value <= 1 || !dx || Math.abs(dy) > Math.abs(dx)) return false
    x.value = clampX(x.value - dx, scale.value)
    return true
  })
  const pinch = Gesture.Pinch().runOnJS(true)
    .onStart((event) => {
      start.current = { scale: scale.value, x: x.value, focalX: event.focalX }
    })
    .onUpdate((event) => {
      const zoom = Math.max(1, Math.min(3, start.current.scale * event.scale))
      const previous = scale.value
      x.value = clampX(event.focalX - (start.current.focalX - start.current.x) * zoom / start.current.scale, zoom)
      scale.value = zoom
      onScaleChange(previous, zoom, event.focalY)
    })
    .onFinalize(() => setZoomed(scale.value > 1.01))
  const makePan = () => Gesture.Pan().runOnJS(true).enabled(zoomed).maxPointers(1)
    .activeOffsetX([-10, 10]).failOffsetY([-10, 10])
    .onStart(() => { panX.value = x.value })
    .onUpdate((event) => { x.value = clampX(panX.value + event.translationX, scale.value) })
  const touchPan = makePan().onTouchesDown((event, manager) => {
    if (isWeb && event.pointerType === PointerType.MOUSE) manager.fail()
  })
  const mousePan = makePan().enabled(isWeb && zoomed).mouseButton(MouseButton.MIDDLE)
  const style = useAnimatedStyle(() => size.width && size.height ? {
    width: size.width,
    height: size.height / scale.value,
    transform: [{ translateX: x.value }, { scale: scale.value }],
    transformOrigin: 'top left',
  } : { flex: 1 })

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, touchPan, mousePan)} touchAction="pan-y" userSelect="auto" enableContextMenu>
      <View ref={ref} style={{ flex: 1, overflow: 'hidden' }} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        <Animated.View style={style}>{children}</Animated.View>
      </View>
    </GestureDetector>
  )
}
