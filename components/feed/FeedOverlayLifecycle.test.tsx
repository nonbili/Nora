import { afterEach, beforeEach, expect, it } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { ui$ } from '@/states/ui'

import { tabs$ } from '@/states/tabs'
import { openFeedOverlay } from '@/lib/open-feed-overlay'
import { FeedOverlayLifecycle } from './FeedOverlayLifecycle'
const originalTabs = tabs$.tabs.peek()
const originalIndex = tabs$.activeTabIndex.peek()
beforeEach(() => {
  tabs$.tabs.set([{ id: 'feed', url: 'nora://feed' }, { id: 'page', url: 'https://example.com' }])
  tabs$.activeTabIndex.set(0)
})
let renderer: TestRenderer.ReactTestRenderer | undefined

afterEach(async () => {
  await act(async () => {
    renderer?.unmount()
    tabs$.tabs.set(originalTabs)
    tabs$.activeTabIndex.set(originalIndex)
    ui$.feedSettingsModal.set(null)
    ui$.feedGallery.set(null)
    ui$.sourcesScreen.set(null)
    ui$.timelineModal.set(null)
    ui$.addSourcesModal.set(null)
    ui$.sourcePicker.set(null)
    ui$.sourcesModal.set(null)
  })
})

it('dismisses all feed overlays on a tab switch and does not reopen them on return', async () => {
  await act(async () => {
    ui$.feedSettingsModal.set({ tabId: 'feed' })
    ui$.feedGallery.set({ tabId: 'feed', postKey: 'post', profileKey: 'source', index: 0 })
    ui$.sourcesScreen.set({ tabId: 'feed' })
    ui$.timelineModal.set({ tabId: 'feed' })
    ui$.addSourcesModal.set({ tabId: 'feed' })
    ui$.sourcePicker.set({ tabId: 'feed', profileKey: 'source', kind: 'notify' })
    ui$.sourcesModal.set({ tabId: 'feed' })
    renderer = TestRenderer.create(<FeedOverlayLifecycle dismissOnBlur />)
  })
  expect(ui$.feedSettingsModal.peek()).toEqual({ tabId: 'feed' })
  await act(async () => tabs$.activeTabIndex.set(1))
  for (const key of ['feedSettingsModal', 'feedGallery', 'sourcesScreen', 'timelineModal', 'addSourcesModal', 'sourcePicker', 'sourcesModal'] as const) {
    expect(ui$[key].peek()).toBeNull()
  }
  await act(async () => tabs$.activeTabIndex.set(0))
  expect(ui$.feedSettingsModal.peek()).toBeNull()
})

it('closes overlays when the owning tab is removed, preserving dialogs opened outside a feed tab', async () => {
  await act(async () => {
    ui$.feedSettingsModal.set({ tabId: 'feed' })
    ui$.timelineModal.set({ profileKey: 'source' })
    renderer = TestRenderer.create(<FeedOverlayLifecycle dismissOnBlur />)
  })
  await act(async () => tabs$.tabs[0].id.set('replacement'))
  expect(ui$.feedSettingsModal.peek()).toBeNull()
  expect(ui$.timelineModal.peek()).toEqual({ profileKey: 'source' })
  await act(async () => ui$.feedSettingsModal.set({ tabId: 'feed' }))
  expect(ui$.feedSettingsModal.peek()).toBeNull()
})

it('keeps desktop overlays when focus changes and clears them when their tab closes', async () => {
  await act(async () => {
    ui$.sourcesScreen.set({ tabId: 'feed' })
    renderer = TestRenderer.create(<FeedOverlayLifecycle dismissOnBlur={false} />)
  })
  await act(async () => tabs$.activeTabIndex.set(1))
  expect(ui$.sourcesScreen.peek()).toEqual({ tabId: 'feed' })
  await act(async () => tabs$.tabs.set([{ id: 'page', url: 'https://example.com' }]))
  expect(ui$.sourcesScreen.peek()).toBeNull()
})

it('activates a background native feed before opening its sheet', async () => {
  await act(async () => {
    tabs$.activeTabIndex.set(1)
    renderer = TestRenderer.create(<FeedOverlayLifecycle dismissOnBlur />)
  })
  await act(async () => openFeedOverlay('feedSettingsModal', { tabId: 'feed' }))
  expect(tabs$.tabs.peek()[tabs$.activeTabIndex.peek()].id).toBe('feed')
  expect(ui$.feedSettingsModal.peek()).toEqual({ tabId: 'feed' })
  await act(async () => tabs$.activeTabIndex.set(1))
  expect(ui$.feedSettingsModal.peek()).toBeNull()
})

it('clears overlays when the owning feed tab navigates to a web page', async () => {
  await act(async () => {
    openFeedOverlay('feedSettingsModal', { tabId: 'feed' })
    renderer = TestRenderer.create(<FeedOverlayLifecycle dismissOnBlur={false} />)
  })
  await act(async () => tabs$.tabs[0].url.set('https://example.com'))
  expect(ui$.feedSettingsModal.peek()).toBeNull()
})
