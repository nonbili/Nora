import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

import '../../test/gestures'
import '../../test/component'
import type { TestGesture } from '../../test/gestures'
import { testVideoPlayers } from '../../test/video'

const actualZoomable = { ...await import('./ZoomableMedia') }
let zoomed = false
mock.module('./ZoomableMedia', () => ({
  ZoomableMedia: ({ children, overlay }: {
    children: (zoomed: boolean) => React.ReactNode
    overlay?: (zoomed: boolean, reset: () => void) => React.ReactNode
  }) => <>{children(zoomed)}{overlay?.(zoomed, () => {})}</>,
}))

const player = () => testVideoPlayers[testVideoPlayers.length - 1]
const { FeedVideo } = await import('./FeedVideo')
const { settings$ } = await import('@/states/settings')
let savedSettings: { speed: number; edge: boolean }
beforeEach(() => {
  savedSettings = { speed: settings$.videoDefaultSpeed.get(), edge: settings$.videoEdgeLongPressTo2x.get() }
  testVideoPlayers.length = 0
  zoomed = false
})
afterEach(async () => {
  await act(async () => {
    settings$.videoDefaultSpeed.set(savedSettings.speed)
    settings$.videoEdgeLongPressTo2x.set(savedSettings.edge)
  })
})
afterAll(() => {
  mock.module('./ZoomableMedia', () => actualZoomable)
})

const mount = async (speed: number) => {
  settings$.videoDefaultSpeed.set(speed)
  settings$.videoEdgeLongPressTo2x.set(true)
  let renderer!: TestRenderer.ReactTestRenderer
  const video = () => <FeedVideo uri="https://example.com/video.mp4" width={390} height={844} onError={() => {}} />
  await act(async () => {
    renderer = TestRenderer.create(video())
  })
  return {
    edge: () => renderer.root.findAllByType('GestureDetector' as never)[0].props.gesture as TestGesture,
    zoom: async (value: boolean) => {
      zoomed = value
      await act(async () => renderer.update(video()))
    },
    unmount: async () => { await act(async () => renderer.unmount()) },
  }
}

describe('feed video playback gestures', () => {
  it('only requests progress updates while zoomed controls are showing', async () => {
    const view = await mount(1)
    expect(player().timeUpdateEventInterval).toBe(0)
    await view.zoom(true)
    expect(player().timeUpdateEventInterval).toBe(0.25)
    await view.zoom(false)
    expect(player().timeUpdateEventInterval).toBe(0)
    await view.zoom(true)
    const currentPlayer = player()
    await view.unmount()
    expect(currentPlayer.timeUpdateEventInterval).toBe(0)
  })

  it('uses the saved speed, temporarily accelerates, and restores on cancellation', async () => {
    const view = await mount(1.25)
    expect(player().playbackRate).toBe(1.25)
    await act(async () => view.edge().handlers.onStart?.({ translationX: 0 }))
    expect(player().playbackRate).toBe(2)
    await act(async () => view.edge().handlers.onFinalize?.())
    expect(player().playbackRate).toBe(1.25)
    await view.unmount()
  })

  it('offers 3x when already playing at 2x and supports sliding between speeds', async () => {
    const view = await mount(2)
    await act(async () => view.edge().handlers.onStart?.({ translationX: 0 }))
    expect(player().playbackRate).toBe(3)
    await act(async () => view.edge().handlers.onUpdate?.({ translationX: -48 }))
    expect(player().playbackRate).toBe(1.5)
    await act(async () => view.edge().handlers.onFinalize?.())
    expect(player().playbackRate).toBe(2)
    await view.unmount()
  })

  it('leaves paused videos paused and at their original speed', async () => {
    const view = await mount(1.5)
    player().playing = false
    await act(async () => view.edge().handlers.onStart?.({ translationX: 0 }))
    expect(player().playbackRate).toBe(1.5)
    expect(player().playing).toBe(false)
    await view.unmount()
  })

  it('restores the latest preference if edge gestures are disabled during a hold', async () => {
    const view = await mount(1)
    await act(async () => view.edge().handlers.onStart?.({ translationX: 0 }))
    expect(player().playbackRate).toBe(2)
    await act(async () => {
      settings$.videoDefaultSpeed.set(1.75)
      settings$.videoEdgeLongPressTo2x.set(false)
    })
    expect(player().playbackRate).toBe(1.75)
    await view.unmount()
  })

  it('rejects multi-touch and taps outside the edge hold area', async () => {
    const view = await mount(1.25)
    const fail = mock(() => {})
    view.edge().handlers.onTouchesDown?.({ allTouches: [{ x: 10, y: 200 }, { x: 380, y: 200 }] }, { fail })
    expect(fail).toHaveBeenCalledTimes(1)
    view.edge().handlers.onTouchesDown?.({ allTouches: [{ x: 195, y: 200 }] }, { fail })
    expect(fail).toHaveBeenCalledTimes(2)
    view.edge().handlers.onTouchesDown?.({ allTouches: [{ x: 10, y: 800 }] }, { fail })
    expect(fail).toHaveBeenCalledTimes(3)
    await view.unmount()
  })

  it('does not replace the resting rate if start is delivered again during a hold', async () => {
    const view = await mount(1.25)
    await act(async () => view.edge().handlers.onStart?.({ translationX: 0 }))
    await act(async () => view.edge().handlers.onStart?.({ translationX: 0 }))
    await act(async () => view.edge().handlers.onFinalize?.())
    expect(player().playbackRate).toBe(1.25)
    await view.unmount()
  })
})
