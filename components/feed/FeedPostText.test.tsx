import { expect, it } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { FeedPostText } from './FeedPostText'

it('allows selecting post text without activating the separate expansion control', async () => {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<FeedPostText style={{ fontSize: 14 }}>A long post</FeedPostText>)
  })
  const text = () => renderer.root.findAllByType('Text' as never)[0]
  expect(text().props.selectable).toBe(true)
  expect(text().props.onPress).toBeUndefined()
  expect(text().props.numberOfLines).toBe(8)
  expect(renderer.root.findAllByType('Pressable' as never)).toHaveLength(0)
  const measurement = () => renderer.root.findAllByType('Text' as never).find((node) => node.props.onTextLayout)!
  expect(measurement().props.numberOfLines).toBeUndefined()
  const measurementContainer = renderer.root.findAllByType('View' as never)
    .find((node) => node.props.importantForAccessibility === 'no-hide-descendants')
  expect(measurementContainer?.props.pointerEvents).toBe('none')
  await act(async () => measurement().props.onTextLayout({ nativeEvent: { lines: Array(8).fill({}) } }))
  expect(renderer.root.findAllByType('Pressable' as never)).toHaveLength(0)
  await act(async () => measurement().props.onTextLayout({ nativeEvent: { lines: Array(9).fill({}) } }))
  const button = () => renderer.root.findByType('Pressable' as never)
  expect(button().props.accessibilityState.expanded).toBe(false)
  expect(text().parent?.type).not.toBe('Pressable')
  await act(async () => button().props.onPress())
  expect(text().props.selectable).toBe(true)
  expect(text().props.numberOfLines).toBeUndefined()
  expect(button().props.accessibilityState.expanded).toBe(true)
  await act(async () => button().props.onPress())
  expect(text().props.numberOfLines).toBe(8)
  // Reflowing to fit the text removes the control too.
  await act(async () => measurement().props.onTextLayout({ nativeEvent: { lines: Array(7).fill({}) } }))
  expect(renderer.root.findAllByType('Pressable' as never)).toHaveLength(0)
  await act(async () => renderer.unmount())
})

it('does not offer expansion for a quote that fits exactly six lines', async () => {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<FeedPostText style={{ fontSize: 14 }} lines={6}>A quote</FeedPostText>)
  })
  const measurement = renderer.root.findAllByType('Text' as never).find((node) => node.props.onTextLayout)!
  await act(async () => measurement.props.onTextLayout({ nativeEvent: { lines: Array(6).fill({}) } }))
  expect(renderer.root.findAllByType('Pressable' as never)).toHaveLength(0)
  await act(async () => renderer.unmount())
})
