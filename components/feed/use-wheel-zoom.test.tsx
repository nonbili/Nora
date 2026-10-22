import { afterAll, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { View } from 'react-native'

const utils = { ...await import('@/lib/utils') }
mock.module('@/lib/utils', () => ({ ...utils, isWeb: true }))
const { useWheelZoom } = await import('./use-wheel-zoom')
afterAll(() => { mock.module('@/lib/utils', () => utils) })

it('uses Ctrl+wheel for focal zoom, preserves ordinary scroll, and removes its listener', async () => {
  const onZoom = mock(() => {})
  let magnified = false
  const onPan = mock((_dx: number, _dy: number) => magnified)
  const element = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 20, top: 30 }) })
  const Harness = () => <View ref={useWheelZoom(onZoom, true, onPan)} />
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<Harness />, { createNodeMock: () => element })
  })
  const wheel = (ctrlKey: boolean, overrides: Partial<WheelEvent> = {}) => Object.assign(new Event('wheel', { cancelable: true }), {
    ctrlKey, deltaX: 0, deltaY: -100, deltaMode: 0, shiftKey: false, clientX: 120, clientY: 230,
  }, overrides)
  const scroll = wheel(false)
  element.dispatchEvent(scroll)
  expect(scroll.defaultPrevented).toBe(false)
  expect(onZoom).not.toHaveBeenCalled()
  const zoom = wheel(true)
  element.dispatchEvent(zoom)
  expect(zoom.defaultPrevented).toBe(true)
  expect(onZoom).toHaveBeenCalledWith(Math.exp(0.2), 100, 200)
  magnified = true
  const horizontal = wheel(false, { deltaX: 20, deltaY: 0 })
  element.dispatchEvent(horizontal)
  expect(horizontal.defaultPrevented).toBe(true)
  expect(onPan).toHaveBeenLastCalledWith(20, 0)
  const shifted = wheel(false, { shiftKey: true, deltaY: 3, deltaMode: 1 })
  element.dispatchEvent(shifted)
  expect(shifted.defaultPrevented).toBe(true)
  expect(onPan).toHaveBeenLastCalledWith(48, 0)
  const chips = {
    nodeType: 1, parentElement: element, scrollWidth: 1000, clientWidth: 390, scrollLeft: 100,
    ownerDocument: { defaultView: { getComputedStyle: () => ({ overflowX: 'auto', direction: 'ltr' }) } },
  }
  const overChips = wheel(false, { deltaX: 20, deltaY: 0 })
  Object.defineProperty(overChips, 'target', { value: chips })
  onPan.mockClear()
  element.dispatchEvent(overChips)
  expect(overChips.defaultPrevented).toBe(false)
  expect(onPan).not.toHaveBeenCalled()
  chips.scrollLeft = 610
  const atEnd = wheel(false, { deltaX: 20, deltaY: 0 })
  Object.defineProperty(atEnd, 'target', { value: chips })
  element.dispatchEvent(atEnd)
  expect(atEnd.defaultPrevented).toBe(true)
  expect(onPan).toHaveBeenCalledWith(20, 0)
  await act(async () => renderer.unmount())
  element.dispatchEvent(wheel(true))
  expect(onZoom).toHaveBeenCalledTimes(1)
})
