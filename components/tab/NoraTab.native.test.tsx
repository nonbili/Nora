import { beforeEach, describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { noraViewLoads, noraViewMountCount, resetNoraViewEvents } from '../../test/component'
import type { Tab } from '@/states/tabs'

// Pin the platform rather than relying on `document` being absent: lib/utils captures
// `isWeb` at first load, so without this the branch would depend on suite ordering.
const utils = await import('@/lib/utils')
mock.module('@/lib/utils', () => ({ ...utils, isWeb: false, isIos: false, isAndroid: true }))

const { NoraTab } = await import('./NoraTab')
const { tabs$ } = await import('@/states/tabs')

const TAB_URL = 'https://dormant.test/feed'

// The native load is issued from a zero-delay timer (it retries a stale view tag), so
// every step has to let the macrotask queue drain before asserting.
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))))

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
  await settle()
  return {
    update: async (nextTab: Tab) => {
      seed(nextTab)
      await act(async () => {
        renderer.update(<NoraTab tab={nextTab} index={0} isActive={false} />)
      })
      await settle()
    },
    unmount: async () => {
      await act(async () => renderer.unmount())
    },
  }
}

describe('NoraTab dormancy (native)', () => {
  beforeEach(resetNoraViewEvents)

  it('mounts no view and issues no load while dormant', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true })

    expect(noraViewMountCount()).toBe(0)
    expect(noraViewLoads()).toEqual([])
    await view.unmount()
  })

  it('mounts the view and loads the url when the tab wakes', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true })
    await view.update({ id: 'tab-1', url: TAB_URL, isDormant: false })

    expect(noraViewMountCount()).toBe(1)
    expect(noraViewLoads()).toEqual([TAB_URL])
    await view.unmount()
  })

  it('loads once, not once per render, after waking', async () => {
    const woken: Tab = { id: 'tab-1', url: TAB_URL, isDormant: false }
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true })
    await view.update(woken)
    await view.update({ ...woken, title: 'Feed' })
    await view.update({ ...woken, title: 'Feed', icon: 'https://dormant.test/icon.png' })

    expect(noraViewLoads()).toEqual([TAB_URL])
    await view.unmount()
  })

  it('reloads a tab that goes dormant and wakes again', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: false })
    expect(noraViewLoads()).toEqual([TAB_URL])

    await view.update({ id: 'tab-1', url: TAB_URL, isDormant: true })
    expect(noraViewMountCount()).toBe(1)

    await view.update({ id: 'tab-1', url: TAB_URL, isDormant: false })
    expect(noraViewMountCount()).toBe(2)
    expect(noraViewLoads()).toEqual([TAB_URL, TAB_URL])
    await view.unmount()
  })

  it('never loads a dormant tab that has no url', async () => {
    const view = await render({ id: 'tab-1', url: '', isDormant: true })

    expect(noraViewMountCount()).toBe(0)
    expect(noraViewLoads()).toEqual([])
    await view.unmount()
  })
})
