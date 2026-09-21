import { expect, test } from 'bun:test'
import { tabs$ } from '@/states/tabs'
import { tabGroups$ } from '@/states/tab-groups'
import { activateNotificationTabById } from '../desktop/src/renderer/lib/notifications'

test('notification activation reveals grouped and ungrouped tabs, ignoring closed tabs', () => {
  const tabs = tabs$.tabs.get()
  const index = tabs$.activeTabIndex.get()
  const groups = tabGroups$.groups.get()
  const activeGroup = tabGroups$.activeGroupId.get()
  try {
    tabs$.tabs.set([{ id: 'plain', url: '' }, { id: 'grouped', url: '' }])
    tabs$.activeTabIndex.set(0)
    tabGroups$.groups.set([{ id: 'group', name: 'Group', layout: 'deck', tabIds: ['grouped'] }])
    tabGroups$.activeGroupId.set(null)
    activateNotificationTabById('grouped')
    expect(tabGroups$.activeGroupId.get()).toBe('group')
    expect(tabs$.activeTabIndex.get()).toBe(1)
    activateNotificationTabById('closed')
    expect(tabGroups$.activeGroupId.get()).toBe('group')
    expect(tabs$.activeTabIndex.get()).toBe(1)
    activateNotificationTabById('plain')
    expect(tabGroups$.activeGroupId.get()).toBeNull()
    expect(tabs$.activeTabIndex.get()).toBe(0)
  } finally {
    tabs$.tabs.set(tabs)
    tabs$.activeTabIndex.set(index)
    tabGroups$.groups.set(groups)
    tabGroups$.activeGroupId.set(activeGroup)
  }
})
