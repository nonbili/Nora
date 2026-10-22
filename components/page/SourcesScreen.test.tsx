import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { BackHandler } from 'react-native'
import { ui$ } from '@/states/ui'

mock.module('@/components/feed/SourcesList', () => ({
  SourcesList: (props: { tabId?: string; onClose: () => void }) => React.createElement('SourcesList', props),
}))
const { SourcesScreen } = await import('./SourcesScreen')

describe('SourcesScreen', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount()
      ui$.sourcesScreen.set(null)
      ui$.sourcesModal.set(null)
    })
    mock.restore()
  })

  it('keeps quick selection separate and returns from management with the back button', async () => {
    await act(async () => {
      ui$.sourcesModal.set({ tabId: 'feed', timelineId: 'timeline' })
      renderer = TestRenderer.create(<SourcesScreen />)
    })
    expect(renderer!.toJSON()).toBeNull()

    await act(async () => ui$.sourcesScreen.set({ tabId: 'feed' }))
    const list = renderer!.root.findByType('SourcesList' as any)
    expect(list.props.tabId).toBe('feed')
    await act(async () => list.props.onClose())
    expect(renderer!.toJSON()).toBeNull()
    expect(ui$.sourcesModal.peek()?.timelineId).toBe('timeline')
  })

  it('consumes Android back and removes its handler when closed', async () => {
    let handleBack!: Parameters<typeof BackHandler.addEventListener>[1]
    const remove = mock(() => {})
    spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handleBack = handler
      return { remove }
    })
    await act(async () => {
      ui$.sourcesScreen.set({ tabId: 'feed' })
      renderer = TestRenderer.create(<SourcesScreen />)
    })
    await act(async () => { expect(handleBack({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(true) })
    expect(ui$.sourcesScreen.peek()).toBeNull()
    expect(renderer!.toJSON()).toBeNull()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
