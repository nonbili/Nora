import { beforeEach, describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'
import { noraViewLoads, noraViewMountCount, noraViewVisibility, resetNoraViewEvents } from '../../test/component'
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

const render = async (tab: Tab, isVisible = true) => {
  let renderer!: TestRenderer.ReactTestRenderer
  seed(tab)
  await act(async () => {
    renderer = TestRenderer.create(<NoraTab tab={tab} index={0} isActive={false} isVisible={isVisible} />)
  })
  await settle()
  return {
    update: async (nextTab: Tab, nextVisible = isVisible) => {
      seed(nextTab)
      await act(async () => {
        renderer.update(<NoraTab tab={nextTab} index={0} isActive={false} isVisible={nextVisible} />)
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

  it('mounts nothing when a dormant tab is paused, even on screen', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true, isPaused: true }, true)

    expect(tabs$.tabs[0].isDormant.get()).toBe(true)
    expect(noraViewMountCount()).toBe(0)
    expect(noraViewLoads()).toEqual([])
    await view.unmount()
  })

  it('loads a dormant tab a layout puts on screen without activating it', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true }, true)

    expect(tabs$.tabs[0].isDormant.get()).toBe(false)
    await view.unmount()
  })

  it('leaves a dormant tab that is off screen alone', async () => {
    const view = await render({ id: 'tab-1', url: TAB_URL, isDormant: true }, false)

    expect(tabs$.tabs[0].isDormant.get()).toBe(true)
    expect(noraViewMountCount()).toBe(0)
    await view.unmount()
  })
})

describe('NoraTab sleep (native)', () => {
  beforeEach(resetNoraViewEvents)

  // The sleep is delayed so that a quick switch between two tabs does not churn, so this
  // has to outwait SLEEP_DELAY.
  const outwaitSleepDelay = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 2100))))

  it('sleeps a tab that goes off screen, and wakes it immediately when it comes back', async () => {
    const tab: Tab = { id: 'tab-1', url: TAB_URL }
    const view = await render(tab, true)
    expect(noraViewVisibility()).toEqual([])

    await view.update(tab, false)
    // Still awake: a tab that comes straight back never sleeps at all.
    expect(noraViewVisibility()).toEqual([])

    await outwaitSleepDelay()
    expect(noraViewVisibility()).toEqual([false])

    await view.update(tab, true)
    expect(noraViewVisibility()).toEqual([false, true])
    await view.unmount()
  })

  it('keeps the visible tab awake', async () => {
    const tab: Tab = { id: 'tab-1', url: TAB_URL }
    const view = await render(tab, true)

    await outwaitSleepDelay()
    expect(noraViewVisibility()).toEqual([])
    await view.unmount()
  })
})
