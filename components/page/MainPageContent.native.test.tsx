import { beforeEach, describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { noraViewMountCount, resetNoraViewEvents } from '../../test/component'

// `isWeb` is captured when lib/utils first loads, so pin it here rather than let the
// suite ordering decide which layout branch this file renders.
const utils = await import('@/lib/utils')
mock.module('@/lib/utils', () => ({ ...utils, isWeb: false, isIos: false, isAndroid: true }))
mock.module('@/components/menu/NouMenu', () => ({ NouMenu: () => null }))
// Chrome around the tab host: none of it owns a webview, so it only adds noise here.
mock.module('@/components/header/NouHeader', () => ({ NouHeader: () => null }))
mock.module('@/components/lockout/UsageLockout', () => ({ UsageLockout: () => null }))
mock.module('@/components/modal/SettingsModal', () => ({ SettingsModal: () => null }))
mock.module('@/lib/hooks/useMe', () => ({ useMe: () => ({ userId: undefined, me: undefined }) }))
mock.module('@/lib/hooks/useUsageTracker', () => ({ useUsageTracker: () => {} }))

const { MainPageContent } = await import('./MainPageContent')
const { settings$ } = await import('@/states/settings')
const { tabs$ } = await import('@/states/tabs')
const { tabGroups$ } = await import('@/states/tab-groups')

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))))

describe('MainPageContent (native)', () => {
  beforeEach(() => {
    resetNoraViewEvents()
    tabGroups$.groups.set([])
    tabGroups$.activeGroupId.set(null)
    settings$.desktopLayout.set('auto')
  })

  // A rotation on a wide phone flips the desktop layout on and off (an iPhone Pro Max is
  // 926pt wide in landscape). That used to swap the phone tab list for the workspace,
  // which remounted every webview: the page reloaded and a playing video restarted.
  it('keeps every webview mounted when the desktop layout turns on and off', async () => {
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.test/' },
      { id: 'tab-2', url: 'https://two.test/' },
    ])
    tabs$.activeTabIndex.set(0)
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1 })
    settings$.desktopLayout.set('off')

    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<MainPageContent contentJs="" />)
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    await act(async () => {
      settings$.desktopLayout.set('on')
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    await act(async () => {
      settings$.desktopLayout.set('off')
    })
    await settle()
    expect(noraViewMountCount()).toBe(2)

    await act(async () => renderer.unmount())
    settings$.desktopLayout.set('auto')
  })
})
