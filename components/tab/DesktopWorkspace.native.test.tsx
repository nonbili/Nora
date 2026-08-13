import { beforeEach, describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { noraViewMountCount, resetNoraViewEvents } from '../../test/component'

// `isWeb` is captured when lib/utils first loads, so pin it here rather than let the
// suite ordering decide which branch of NoraTab this file renders.
const utils = await import('@/lib/utils')
mock.module('@/lib/utils', () => ({ ...utils, isWeb: false, isIos: false, isAndroid: true }))
mock.module('@/components/menu/NouMenu', () => ({ NouMenu: () => null }))

const { DesktopWorkspace } = await import('./DesktopWorkspace.native')
const { tabs$ } = await import('@/states/tabs')
const { tabGroups$ } = await import('@/states/tab-groups')

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))))

const seedGroup = (layout: 'deck' | 'split-view' | 'grid-4') => {
  tabs$.tabs.set([
    { id: 'tab-1', url: 'https://one.test/' },
    { id: 'tab-2', url: 'https://two.test/' },
  ])
  tabs$.activeTabIndex.set(0)
  tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1 })
  tabGroups$.groups.set([
    { id: 'group-1', name: 'Group', layout, tabIds: layout === 'grid-4' ? ['tab-1', 'tab-2', null, null] : ['tab-1', 'tab-2'] },
  ])
  tabGroups$.activeGroupId.set('group-1')
}

describe('DesktopWorkspace (native)', () => {
  beforeEach(() => {
    resetNoraViewEvents()
    tabGroups$.groups.set([])
    tabGroups$.activeGroupId.set(null)
  })

  it('keeps every webview mounted across a layout change', async () => {
    seedGroup('deck')
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<DesktopWorkspace />)
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    // Switching the layout must only move the slots: reparenting a tab would remount
    // its native view and reload the page.
    await act(async () => {
      tabGroups$.setGroupLayout('group-1', 'grid-4')
    })
    await settle()
    await act(async () => {
      tabGroups$.setGroupLayout('group-1', 'split-view')
    })
    await settle()

    expect(noraViewMountCount()).toBe(2)
    await act(async () => renderer.unmount())
  })

  it('keeps a tab of another group mounted so its page survives the switch', async () => {
    seedGroup('deck')
    tabGroups$.groups.push({ id: 'group-2', name: 'Other', layout: 'deck', tabIds: [] })
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<DesktopWorkspace />)
    })
    await settle()

    await act(async () => {
      tabGroups$.setActiveGroup('group-2')
    })
    await settle()

    expect(noraViewMountCount()).toBe(2)
    await act(async () => renderer.unmount())
  })
})
