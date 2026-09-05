import { beforeEach, describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { noraViewMountCount, resetNoraViewEvents } from '../../test/component'

// `isWeb` is captured when lib/utils first loads, so pin it here rather than let the
// suite ordering decide which branch of NoraTab this file renders.
const utils = await import('@/lib/utils')
mock.module('@/lib/utils', () => ({ ...utils, isWeb: false, isIos: false, isAndroid: true }))
mock.module('@/components/menu/NouMenu', () => ({ NouMenu: () => null }))

const { NativeTabHost } = await import('./NativeTabHost')
const { NoraTab } = await import('./NoraTab')
const { tabs$ } = await import('@/states/tabs')
const { tabGroups$ } = await import('@/states/tab-groups')

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))))

const seedTabs = () => {
  tabs$.tabs.set([
    { id: 'tab-1', url: 'https://one.test/' },
    { id: 'tab-2', url: 'https://two.test/' },
  ])
  tabs$.activeTabIndex.set(0)
  tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1 })
}

describe('NativeTabHost', () => {
  beforeEach(() => {
    resetNoraViewEvents()
    tabGroups$.groups.set([])
    tabGroups$.activeGroupId.set(null)
  })

  // A rotation on a wide phone used to cross the desktop-layout width threshold, which
  // swapped the phone tab list for the workspace and remounted every webview: the page
  // reloaded and a playing video restarted.
  it('keeps every webview mounted when the layout switches, in both directions', async () => {
    seedTabs()
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<NativeTabHost desktopLayout={false} />)
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    await act(async () => {
      renderer.update(<NativeTabHost desktopLayout />)
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    await act(async () => {
      renderer.update(<NativeTabHost desktopLayout={false} />)
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    await act(async () => renderer.unmount())
  })

  it('keeps the webview mounted when a group layout change lands in the same switch', async () => {
    seedTabs()
    tabGroups$.groups.set([{ id: 'group-1', name: 'Group', layout: 'deck', tabIds: ['tab-1', 'tab-2'] }])
    tabGroups$.activeGroupId.set('group-1')
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<NativeTabHost desktopLayout />)
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    await act(async () => {
      renderer.update(<NativeTabHost desktopLayout={false} />)
    })
    await settle()
    await act(async () => {
      tabGroups$.setGroupLayout('group-1', 'split-view')
    })
    await settle()
    await act(async () => {
      renderer.update(<NativeTabHost desktopLayout />)
    })
    await settle()

    expect(noraViewMountCount()).toBe(2)
    await act(async () => renderer.unmount())
  })

  // A webview inside a horizontal ScrollView gets no mouse wheel: React Native drops every
  // generic motion event while the scroll view is disabled. The deck scrolls an empty
  // surface instead, so no tab may end up under it in any layout.
  it.each([
    ['phone', false, 'deck' as const],
    ['deck', true, 'deck' as const],
    ['split-view', true, 'split-view' as const],
  ])('keeps the tabs out of the deck scroll surface (%s)', async (_name, desktopLayout, layout) => {
    seedTabs()
    tabGroups$.groups.set([{ id: 'group-1', name: 'Group', layout, tabIds: ['tab-1', 'tab-2'] }])
    tabGroups$.activeGroupId.set('group-1')
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<NativeTabHost desktopLayout={desktopLayout} />)
    })
    await settle()

    const scrollSurface = renderer.root.findByType('Animated.ScrollView' as unknown as React.ComponentType)
    expect(renderer.root.findAllByType(NoraTab).length).toBe(2)
    expect(scrollSurface.findAllByType(NoraTab).length).toBe(0)

    await act(async () => renderer.unmount())
  })
})
