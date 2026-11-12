import { afterAll, expect, it, mock, spyOn } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { Animated } from 'react-native'
import '../../test/component'

const actualZoom = { ...await import('./TimelineZoom') }
const actualMenu = { ...await import('../menu/NouMenu') }
mock.module('./TimelineZoom', () => ({ TimelineZoom: ({ children }: { children: React.ReactNode }) => children }))
mock.module('../menu/NouMenu', () => ({ NouMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger }))
afterAll(() => {
  mock.module('./TimelineZoom', () => actualZoom)
  mock.module('../menu/NouMenu', () => actualMenu)
})
const { FeedView } = await import('./FeedView')

it('slides the header without resizing the list and ignores bottom bounce', async () => {
  const timing = spyOn(Animated, 'timing')
  let renderer!: TestRenderer.ReactTestRenderer
  try {
    await act(async () => {
      renderer = TestRenderer.create(<FeedView tabId="test-feed" active={false} focused={false} />)
    })
    const header = () => renderer.root.findByType('Animated.View' as never)
    const row = header().findAllByType('View' as never).find((node) => node.props.onLayout)!
    await act(async () => row.props.onLayout({ nativeEvent: { layout: { height: 52 } } }))
    const list = () => renderer.root.findByType('FlatList' as never)
    expect(header().props.style.position).toBe('absolute')
    expect(header().props.style.height).toBeUndefined()
    expect(header().props.style.transform).toHaveLength(1)
    expect(list().props.ListHeaderComponent.props.style.paddingTop).toBe(52)
    const scroll = async (y: number) => {
      await act(async () => list().props.onScroll({ nativeEvent: {
        contentOffset: { y }, contentSize: { height: 1500 }, layoutMeasurement: { height: 500 },
      } }))
    }
    await scroll(100)
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), { toValue: 0, duration: 180, useNativeDriver: true })
    await scroll(1000)
    const calls = timing.mock.calls.length
    await scroll(1060)
    await scroll(1000)
    expect(timing.mock.calls.length).toBe(calls)
    await scroll(980)
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), { toValue: 1, duration: 180, useNativeDriver: true })
    expect(list().props.style).toEqual({ flex: 1 })
  } finally {
    await act(async () => renderer?.unmount())
    timing.mockRestore()
  }
})
