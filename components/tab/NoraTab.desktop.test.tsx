import { beforeEach, describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { noraViewLoads, noraViewMountCount, resetNoraViewEvents } from '../../test/component'
import type { Tab } from '@/states/tabs'

// `isWeb` is `typeof document != 'undefined'`, captured when lib/utils first loads, which
// makes the rendered branch depend on which test file loaded it first. Pin it here instead,
// so this file selects the desktop branch however the suite is ordered.
const utils = await import('@/lib/utils')
mock.module('@/lib/utils', () => ({ ...utils, isWeb: true, isIos: false, isAndroid: false }))
;(globalThis as { window?: unknown }).window = { electron: { process: { platform: 'darwin' } } }

const { NoraTab } = await import('./NoraTab')
const { tabs$ } = await import('@/states/tabs')

const TAB_URL = 'https://dormant.test/feed'

// NoraTab reads the tab's current url from the store, not only from props, so the store
// has to hold the same tab for the load paths to behave as they do in the app.
const seed = (tab: Tab) => {
  tabs$.tabs.set([tab])
  tabs$.activeTabIndex.set(0)
}

const render = async (tab: Tab) => {
  let renderer!: TestRenderer.ReactTestRenderer
  seed(tab)
  await act(async () => {
    renderer = TestRenderer.create(<NoraTab tab={tab} index={0} isActive={false} />)
  })
  return {
    update: async (nextTab: Tab) => {
      seed(nextTab)
      await act(async () => {
        renderer.update(<NoraTab tab={nextTab} index={0} isActive={false} />)
      })
    },
    unmount: async () => {
      await act(async () => renderer.unmount())
    },
  }
}

describe('NoraTab dormancy (desktop)', () => {
  beforeEach(resetNoraViewEvents)

  it('mounts no webview and navigates nowhere while dormant', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true })

    expect(noraViewMountCount()).toBe(0)
    expect(noraViewLoads()).toEqual([])
    await view.unmount()
  })

  it('mounts the webview and navigates once when the tab wakes', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true })
    await view.update({ id: 'tab-1', url: TAB_URL, isDormant: false })

    expect(noraViewMountCount()).toBe(1)
    // Exactly one: the ref callback issues the load, and the tab.url effect that runs
    // afterwards must see pageUrlRef already seeded and stay out of the way.
    expect(noraViewLoads()).toEqual([TAB_URL])
    await view.unmount()
  })

  it('does not renavigate on re-renders after waking', async () => {
    const woken: Tab = { id: 'tab-1', url: TAB_URL, isDormant: false }
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true })
    await view.update(woken)
    await view.update({ ...woken, title: 'Feed' })
    await view.update({ ...woken, title: 'Feed', isLoading: true })

    expect(noraViewLoads()).toEqual([TAB_URL])
    await view.unmount()
  })

  it('navigates again after a dormancy round trip', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: false })
    expect(noraViewLoads()).toEqual([TAB_URL])

    // Going dormant destroys the webview, so the stale page URL must not suppress the
    // load when a fresh element mounts on wake.
    await view.update({ id: 'tab-1', url: TAB_URL, isDormant: true })
    expect(noraViewMountCount()).toBe(1)

    await view.update({ id: 'tab-1', url: TAB_URL, isDormant: false })
    expect(noraViewMountCount()).toBe(2)
    expect(noraViewLoads()).toEqual([TAB_URL, TAB_URL])
    await view.unmount()
  })

  it('leaves a paused tab unmounted regardless of the dormant flag', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isPaused: true, isDormant: false })

    expect(noraViewMountCount()).toBe(0)
    expect(noraViewLoads()).toEqual([])
    await view.unmount()
  })
})
