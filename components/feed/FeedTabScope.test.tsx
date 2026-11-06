import { afterEach, expect, it } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { ui$ } from '@/states/ui'
import { FeedTabScope } from './FeedTabScope'

let renderer: TestRenderer.ReactTestRenderer | undefined
afterEach(async () => {
  await act(async () => {
    renderer?.unmount()
    ui$.sourcesScreen.set(null)
  })
})

it('makes only the covered feed inert, leaving its overlay and neighboring tabs interactive', async () => {
  await act(async () => {
    renderer = TestRenderer.create(<>
      <FeedTabScope tabId="feed-a" overlays={<span>Sources</span>}><span>Feed A</span></FeedTabScope>
      <FeedTabScope tabId="feed-b" overlays={<span>Other overlays</span>}><span>Feed B</span></FeedTabScope>
    </>)
    ui$.sourcesScreen.set({ tabId: 'feed-a' })
  })
  const containers = renderer!.root.findAllByType('div')
  expect(containers[0].props.inert).toBe(true)
  expect(containers[0].props['aria-hidden']).toBe(true)
  expect(containers[1].props.inert).toBe(false)
  expect(renderer!.root.findAllByType('span')[1].parent?.type).not.toBe('div')
  await act(async () => ui$.sourcesScreen.set(null))
  expect(renderer!.root.findAllByType('div')[0].props.inert).toBe(false)
})
