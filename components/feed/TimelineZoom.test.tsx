import { afterAll, expect, it, mock } from 'bun:test'
import React, { act, useRef } from 'react'
import TestRenderer from 'react-test-renderer'
import { View } from 'react-native'
import '../../test/component'
import type { TestGesture } from '../../test/gestures'

const actualAnimated = { ...await import('react-native-reanimated') }
mock.module('react-native-reanimated', () => ({
  ...actualAnimated,
  default: { ...actualAnimated.default, View: 'Animated.View' },
  useSharedValue: (initial: number) => useRef({ value: initial }).current,
  useAnimatedStyle: (style: () => unknown) => style(),
}))
afterAll(() => { mock.module('react-native-reanimated', () => actualAnimated) })
const { TimelineZoom } = await import('./TimelineZoom')

it('magnifies a fixed list layout around the focal point without rendering its children again', async () => {
  const onScaleChange = mock(() => {})
  let renders = 0
  const Content = () => { renders++; return <View /> }
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<TimelineZoom onScaleChange={onScaleChange}><Content /></TimelineZoom>)
  })
  const detector = () => renderer.root.findByType('GestureDetector' as never)
  expect(detector().props.userSelect).toBe('auto')
  expect(detector().props.enableContextMenu).toBe(true)
  const viewport = renderer.root.findAllByType('View' as never).find((node) => node.props.onLayout)!
  await act(async () => viewport.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } }))
  const pinch = () => (detector().props.gesture.gestures as TestGesture[])[0]
  await act(async () => pinch().handlers.onStart({ focalX: 100, focalY: 200 }))
  await act(async () => pinch().handlers.onUpdate({ scale: 2, focalX: 100, focalY: 200 }))
  await act(async () => pinch().handlers.onFinalize())
  expect(onScaleChange).toHaveBeenLastCalledWith(1, 2, 200)
  const style = renderer.root.findByType('Animated.View' as never).props.style
  expect(style.width).toBe(390)
  expect(style.height).toBe(422)
  expect(style.transform).toEqual([{ translateX: -100 }, { scale: 2 }])
  expect(renders).toBe(1)
  await act(async () => renderer.unmount())
})
