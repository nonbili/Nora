import { type ReactNode, useEffect } from 'react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  measure,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated'
import { moveTabPosition } from '@/lib/tab-reorder'

type Positions = Record<string, number>
const GAP = 12
const EDGE = 72
const SCROLL_SPEED = 900
const MOVE_TIMING = { duration: 160 }

// Uses the same shared-position approach as Nori's SortableList and SortableGrid:
// pointer movement and neighboring rows animate entirely on the UI thread.
export function SortableTabList<T extends { id: string }>({
  items, rowHeight, scrollViewRef, renderItem, onReorder, onDragging,
}: {
  items: T[]
  rowHeight: number
  scrollViewRef: AnimatedRef<Animated.ScrollView>
  renderItem: (item: T) => ReactNode
  onReorder: (ids: string[]) => void
  onDragging: (dragging: boolean) => void
}) {
  const idsKey = JSON.stringify(items.map((item) => item.id))
  const positions = useSharedValue<Positions>({})
  useEffect(() => {
    const ids: string[] = JSON.parse(idsKey)
    positions.value = Object.fromEntries(ids.map((id, index) => [id, index]))
  }, [idsKey, positions])

  const listRef = useAnimatedRef<Animated.View>()
  const scrollOffset = useScrollOffset(scrollViewRef)
  const pointerY = useSharedValue(0)
  const activeDragId = useSharedValue<string | null>(null)
  const autoScroll = useFrameCallback((frame) => {
    // Stop on the same UI frame as release, even if JS has not handled cleanup yet.
    if (activeDragId.value === null) return
    const viewport = measure(scrollViewRef)
    const list = measure(listRef)
    if (!viewport || !list) return
    const top = viewport.pageY
    const bottom = top + viewport.height
    const distance = SCROLL_SPEED * Math.min(frame.timeSincePreviousFrame ?? 16, 64) / 1000
    let step = 0
    if (pointerY.value < top + EDGE) {
      const pull = Math.min(1, (top + EDGE - pointerY.value) / EDGE)
      step = -Math.min(pull * distance, scrollOffset.value)
    } else if (pointerY.value > bottom - EDGE) {
      const pull = Math.min(1, (pointerY.value - bottom + EDGE) / EDGE)
      step = Math.max(0, Math.min(pull * distance, list.pageY + list.height - bottom + EDGE))
    }
    if (step) scrollTo(scrollViewRef, 0, scrollOffset.value + step, false)
  }, false)

  useEffect(() => () => autoScroll.setActive(false), [autoScroll])
  const setDragging = (dragging: boolean) => {
    autoScroll.setActive(dragging)
    onDragging(dragging)
  }
  const commit = (next: Positions) => {
    onReorder(Object.keys(next).sort((a, b) => next[a] - next[b]))
  }

  return (
    <Animated.View ref={listRef} style={{ height: items.length * (rowHeight + GAP) }}>
      {items.map((item, index) => (
        <SortableRow
          key={item.id}
          id={item.id}
          initialIndex={index}
          rowHeight={rowHeight}
          positions={positions}
          scrollOffset={scrollOffset}
          pointerY={pointerY}
          activeDragId={activeDragId}
          onDragging={setDragging}
          onReorder={commit}
        >
          {renderItem(item)}
        </SortableRow>
      ))}
    </Animated.View>
  )
}

function SortableRow({
  id, initialIndex, rowHeight, positions, scrollOffset, pointerY, activeDragId, onDragging, onReorder, children,
}: {
  id: string
  initialIndex: number
  rowHeight: number
  positions: SharedValue<Positions>
  scrollOffset: SharedValue<number>
  pointerY: SharedValue<number>
  activeDragId: SharedValue<string | null>
  onDragging: (dragging: boolean) => void
  onReorder: (positions: Positions) => void
  children: ReactNode
}) {
  const dragging = useSharedValue(false)
  const startY = useSharedValue(0)
  const translation = useSharedValue(0)
  const startScroll = useSharedValue(0)
  const originalPositions = useSharedValue<Positions>({})
  const stride = rowHeight + GAP

  const move = () => {
    'worklet'
    const y = startY.value + translation.value + scrollOffset.value - startScroll.value
    const targetIndex = Math.max(0, Math.min(Object.keys(positions.value).length - 1, Math.round(y / stride)))
    if (targetIndex !== positions.value[id]) {
      positions.set(moveTabPosition(positions.value, id, targetIndex))
    }
  }

  useAnimatedReaction(
    () => scrollOffset.value,
    () => { if (dragging.value) move() },
    [scrollOffset, dragging, startY, translation, startScroll, stride, positions, id],
  )

  const gesture = Gesture.Pan()
    .activateAfterLongPress(250)
    .onTouchesDown((_, manager) => {
      if (activeDragId.value !== null) manager.fail()
    })
    .onStart((event) => {
      // Two holds may begin before either activates. Claim the shared owner on
      // the UI thread so only one gesture can modify the preview or commit it.
      if (activeDragId.value !== null) return
      activeDragId.set(id)
      originalPositions.value = { ...positions.value }
      startY.value = (positions.value[id] ?? initialIndex) * stride
      startScroll.value = scrollOffset.value
      translation.value = 0
      pointerY.set(event.absoluteY)
      dragging.value = true
      runOnJS(onDragging)(true)
    })
    .onUpdate((event) => {
      if (!dragging.value) return
      translation.value = event.translationY
      pointerY.set(event.absoluteY)
      move()
    })
    .onEnd((_, success) => {
      if (success && dragging.value) runOnJS(onReorder)(positions.value)
    })
    .onFinalize((_, success) => {
      if (!dragging.value) return
      activeDragId.set(null)
      if (!success) positions.set(originalPositions.value)
      dragging.value = false
      runOnJS(onDragging)(false)
    })

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    right: 0,
    height: rowHeight,
    zIndex: dragging.value ? 100 : 1,
    transform: [
      { translateY: dragging.value
        ? startY.value + translation.value + scrollOffset.value - startScroll.value
        : withTiming((positions.value[id] ?? initialIndex) * stride, MOVE_TIMING) },
      { scale: withTiming(dragging.value ? 1.02 : 1, MOVE_TIMING) },
    ],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: dragging.value ? 4 : 0 },
    shadowOpacity: dragging.value ? 0.2 : 0,
    shadowRadius: dragging.value ? 8 : 0,
    elevation: dragging.value ? 5 : 0,
  }), [dragging, startY, translation, scrollOffset, startScroll, positions, id, initialIndex, stride, rowHeight])

  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  )
}
