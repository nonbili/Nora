import { beforeEach, describe, expect, it } from 'bun:test'
import { addTabToGroup, normalizeTabGroups, removeTabFromGroups, sanitizeGroupTabIds, type TabGroup } from '../lib/tab-groups'
import { closeDesktopGroupWithTabs, ungroupDesktopGroup } from '../lib/desktop-view-actions'
import { createDesktopTabGroupFromTab, tabGroups$ } from './tab-groups'
import { tabs$ } from './tabs'

describe('tab group helpers', () => {
  it('keeps a tab in only one group when removed globally', () => {
    const groups: TabGroup[] = [
      { id: 'group-1', name: 'One', layout: 'deck', tabIds: ['tab-1', 'tab-2'] },
      { id: 'group-2', name: 'Two', layout: 'grid-4', tabIds: ['tab-3', 'tab-1', null, null] },
    ]

    expect(removeTabFromGroups(groups, 'tab-1')).toEqual([
      { id: 'group-1', name: 'One', layout: 'deck', tabIds: ['tab-2'] },
      { id: 'group-2', name: 'Two', layout: 'grid-4', tabIds: ['tab-3', null, null, null] },
    ])
  })

  it('inserts and reorders tabs in deck and split groups', () => {
    const group: TabGroup = { id: 'group-1', name: 'One', layout: 'deck', tabIds: ['tab-1', 'tab-2'] }

    expect(addTabToGroup(group, 'tab-3', 1).tabIds).toEqual(['tab-1', 'tab-3', 'tab-2'])
    expect(addTabToGroup(group, 'tab-1', 1).tabIds).toEqual(['tab-2', 'tab-1'])
  })

  it('pads grid groups to four slots and ignores overflow inserts', () => {
    expect(sanitizeGroupTabIds('grid-4', ['tab-1'])).toEqual(['tab-1', null, null, null])

    const gridWithSpace: TabGroup = { id: 'group-1', name: 'Grid', layout: 'grid-4', tabIds: ['tab-1', null, 'tab-2', null] }
    expect(addTabToGroup(gridWithSpace, 'tab-3', 1).tabIds).toEqual(['tab-1', 'tab-3', 'tab-2', null])
    expect(addTabToGroup(gridWithSpace, 'tab-2', 0).tabIds).toEqual(['tab-2', 'tab-1', null, null])

    const fullGrid: TabGroup = { id: 'group-1', name: 'Grid', layout: 'grid-4', tabIds: ['tab-1', 'tab-2', 'tab-3', 'tab-4'] }
    expect(addTabToGroup(fullGrid, 'tab-5')).toEqual(fullGrid)
  })

  it('normalizes duplicate tab membership across persisted groups', () => {
    const data = normalizeTabGroups({
      activeGroupId: 'group-2',
      groups: [
        { id: 'group-1', name: '', layout: 'deck', tabIds: ['tab-1', 'tab-2'] },
        { id: 'group-2', name: 'Two', layout: 'grid-4', tabIds: ['tab-1', 'tab-3'] },
      ],
    })

    expect(data?.activeGroupId).toBe('group-2')
    expect(data?.groups[0].tabIds).toEqual(['tab-1', 'tab-2'])
    expect(data?.groups[1].tabIds as Array<string | null>).toEqual(['tab-3', null, null, null])
  })
})

describe('tabGroups$', () => {
  it('replaces the groups array reference when a group is deleted', () => {
    tabGroups$.groups.set([])
    const groupId = createDesktopTabGroupFromTab('tab-1')
    tabGroups$.moveTabToGroup('tab-2', groupId)

    const before = tabGroups$.groups.get()
    expect(before[0].tabIds).toEqual(['tab-1', 'tab-2'])

    tabGroups$.deleteGroup(groupId)

    const after = tabGroups$.groups.get()
    expect(after).toEqual([])
    expect(after).not.toBe(before)
    expect(tabGroups$.activeGroupId.get()).toBeNull()
  })
})

describe('closeDesktopGroupWithTabs', () => {
  beforeEach(() => {
    tabGroups$.groups.set([])
    tabGroups$.activeGroupId.set(null)
    tabs$.recentlyClosedTabs.set([])
  })

  it('closes the group tabs, drops the group, and tags the batch for undo', () => {
    tabGroups$.groups.set([])
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
      { id: 'tab-3', url: 'https://three.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1, 'tab-3': 2 })
    tabs$.recentlyClosedTabs.set([])
    tabs$.activeTabIndex.set(1)

    const groupId = createDesktopTabGroupFromTab('tab-1')
    tabGroups$.moveTabToGroup('tab-2', groupId)

    closeDesktopGroupWithTabs(groupId)

    expect(tabs$.tabs.get().map((tab) => tab.id)).toEqual(['tab-3'])
    expect(tabs$.orders.get()).toEqual({ 'tab-3': 2 })
    expect(tabGroups$.groups.get()).toEqual([])
    // Newest-first history, matching closeAll's batch ordering.
    const history = tabs$.recentlyClosedTabs.get()
    expect(history.map((tab) => tab.id)).toEqual(['tab-2', 'tab-1'])
    const batchIds = new Set(history.map((tab) => tab.closedBatchId))
    expect(batchIds.size).toBe(1)
    expect([...batchIds][0]).toBeTruthy()
  })

  it('keeps tabs that are not in the group', () => {
    tabGroups$.groups.set([])
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1 })
    tabs$.activeTabIndex.set(0)

    const groupId = createDesktopTabGroupFromTab('tab-2')
    closeDesktopGroupWithTabs(groupId)

    expect(tabs$.tabs.get().map((tab) => tab.id)).toEqual(['tab-1'])
    expect(tabs$.activeTabIndex.get()).toBe(0)
  })

  it('activates the group of the surviving tab instead of leaving the workspace blank', () => {
    tabGroups$.groups.set([])
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1 })

    const keptGroupId = createDesktopTabGroupFromTab('tab-2')
    const closedGroupId = createDesktopTabGroupFromTab('tab-1')
    tabs$.setActiveTabById('tab-1')
    tabGroups$.setActiveGroup(closedGroupId)

    closeDesktopGroupWithTabs(closedGroupId)

    expect(tabs$.tabs.get().map((tab) => tab.id)).toEqual(['tab-2'])
    // Every remaining tab is grouped, so a null activeGroupId would render nothing.
    expect(tabGroups$.activeGroupId.get()).toBe(keptGroupId)
  })
})

describe('reopenClosedTabBatch', () => {
  beforeEach(() => {
    tabGroups$.groups.set([])
    tabGroups$.activeGroupId.set(null)
    tabs$.recentlyClosedTabs.set([])
  })

  it('restores every tab of a closed group and rebuilds the group', () => {
    tabGroups$.groups.set([])
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
      { id: 'tab-3', url: 'https://three.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1, 'tab-3': 2 })
    tabs$.recentlyClosedTabs.set([])
    tabs$.activeTabIndex.set(0)

    const groupId = createDesktopTabGroupFromTab('tab-1')
    tabGroups$.moveTabToGroup('tab-2', groupId)
    tabGroups$.setGroupLayout(groupId, 'split-view')
    tabGroups$.renameGroup(groupId, 'Work')

    closeDesktopGroupWithTabs(groupId)
    expect(tabs$.tabs.get()).toHaveLength(1)

    tabs$.reopenClosedTabBatch(tabs$.recentlyClosedTabs.get()[0].id)

    expect(tabs$.tabs.get().map((tab) => tab.url)).toEqual([
      'https://three.example',
      'https://one.example',
      'https://two.example',
    ])
    expect(tabs$.recentlyClosedTabs.get()).toEqual([])

    const groups = tabGroups$.groups.get()
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Work')
    expect(groups[0].layout).toBe('split-view')
    expect(groups[0].tabIds).toHaveLength(2)
  })

  it('restores empty panes of a split-view group', () => {
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1 })
    tabs$.activeTabIndex.set(0)

    const groupId = createDesktopTabGroupFromTab('tab-1')
    tabGroups$.setGroupLayout(groupId, 'split-view')
    tabGroups$.appendSplitGroupSlot(groupId)
    tabGroups$.appendSplitGroupSlot(groupId)
    tabGroups$.assignGroupSlot(groupId, 2, 'tab-2')
    expect(tabGroups$.groups.get()[0].tabIds).toEqual(['tab-1', null, 'tab-2'])

    closeDesktopGroupWithTabs(groupId)
    tabs$.reopenClosedTabBatch(tabs$.recentlyClosedTabs.get()[0].id)

    const [restored] = tabGroups$.groups.get()
    expect(restored.layout).toBe('split-view')
    expect(restored.tabIds).toHaveLength(3)
    expect(restored.tabIds[1]).toBeNull()
    const tabUrlById = new Map(tabs$.tabs.get().map((tab) => [tab.id, tab.url]))
    expect(tabUrlById.get(restored.tabIds[0] as string)).toBe('https://one.example')
    expect(tabUrlById.get(restored.tabIds[2] as string)).toBe('https://two.example')
  })

  it('keeps a batch larger than the history cap intact', () => {
    const tabIds = Array.from({ length: 12 }, (_, index) => `tab-${index + 1}`)
    tabs$.tabs.set(tabIds.map((id) => ({ id, url: `https://${id}.example` })))
    tabs$.orders.set(Object.fromEntries(tabIds.map((id, index) => [id, index])))
    tabs$.activeTabIndex.set(0)

    const groupId = createDesktopTabGroupFromTab(tabIds[0])
    for (const tabId of tabIds.slice(1, 11)) {
      tabGroups$.moveTabToGroup(tabId, groupId)
    }
    closeDesktopGroupWithTabs(groupId)

    // 11 tabs closed together must all survive the 10-entry cap.
    expect(tabs$.recentlyClosedTabs.get()).toHaveLength(11)

    tabs$.reopenClosedTabBatch(tabs$.recentlyClosedTabs.get()[0].id)
    expect(tabs$.tabs.get()).toHaveLength(12)
    expect(tabGroups$.groups.get()[0].tabIds).toHaveLength(11)
  })
})

describe('ungroupDesktopGroup', () => {
  beforeEach(() => {
    tabGroups$.groups.set([])
    tabGroups$.activeGroupId.set(null)
    tabGroups$.sidebarOrder.set([])
  })

  it('leaves the freed tabs where the group was in a sidebar nobody has reordered', () => {
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
      { id: 'tab-3', url: 'https://three.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1, 'tab-3': 2 })

    // The sidebar renders [tab-1, tab-2, group(tab-3)] while the stored order is empty.
    const groupId = createDesktopTabGroupFromTab('tab-3')
    ungroupDesktopGroup(groupId)

    expect(tabGroups$.groups.get()).toEqual([])
    expect(tabGroups$.sidebarOrder.get()).toEqual(['tab:tab-1', 'tab:tab-2', 'tab:tab-3'])
    expect(tabs$.orders.get()).toEqual({ 'tab-1': 0, 'tab-2': 1, 'tab-3': 2 })
  })

  it('keeps a group that sits between two tabs in place', () => {
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
      { id: 'tab-3', url: 'https://three.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1, 'tab-3': 2 })

    const groupId = createDesktopTabGroupFromTab('tab-2')
    tabGroups$.setSidebarOrder(['tab:tab-1', `group:${groupId}`, 'tab:tab-3'])
    ungroupDesktopGroup(groupId)

    expect(tabGroups$.sidebarOrder.get()).toEqual(['tab:tab-1', 'tab:tab-2', 'tab:tab-3'])
    expect(tabs$.orders.get()).toEqual({ 'tab-1': 0, 'tab-2': 1, 'tab-3': 2 })
  })

  it('moves the freed tabs in the tab order to where the sidebar shows them', () => {
    tabs$.tabs.set([
      { id: 'tab-1', url: 'https://one.example' },
      { id: 'tab-2', url: 'https://two.example' },
      { id: 'tab-3', url: 'https://three.example' },
    ])
    tabs$.orders.set({ 'tab-1': 0, 'tab-2': 1, 'tab-3': 2 })

    // Grouping tab-2 moves its section below the ungrouped tabs, so ungrouping it leaves
    // the sidebar showing [tab-1, tab-3, tab-2] -- and the tab order has to agree.
    const groupId = createDesktopTabGroupFromTab('tab-2')
    ungroupDesktopGroup(groupId)

    expect(tabGroups$.sidebarOrder.get()).toEqual(['tab:tab-1', 'tab:tab-3', 'tab:tab-2'])
    expect(tabs$.orders.get()).toEqual({ 'tab-1': 0, 'tab-3': 1, 'tab-2': 2 })
  })
})

describe('reopening a closed tab', () => {
  beforeEach(() => {
    tabGroups$.groups.set([])
    tabGroups$.activeGroupId.set(null)
    tabGroups$.sidebarOrder.set([])
    tabs$.recentlyClosedTabs.set([])
  })

  it('puts the tab back where it was in a sidebar that has been reordered', () => {
    tabs$.tabs.set([
      { id: 'tab-a', url: 'https://a.example' },
      { id: 'tab-b', url: 'https://b.example' },
      { id: 'tab-c', url: 'https://c.example' },
    ])
    tabs$.orders.set({ 'tab-a': 0, 'tab-b': 1, 'tab-c': 2 })
    tabGroups$.setSidebarOrder(['tab:tab-a', 'tab:tab-b', 'tab:tab-c'])
    tabs$.activeTabIndex.set(0)

    tabs$.closeTab(1)
    const closedTab = tabs$.recentlyClosedTabs.get()[0]
    const reopenedTabId = tabs$.reopenClosedTab(closedTab.id)

    expect(reopenedTabId).toBeTruthy()
    expect(tabGroups$.sidebarOrder.get()).toEqual(['tab:tab-a', `tab:${reopenedTabId}`, 'tab:tab-c'])
  })

  it('leaves the stored order alone when the sidebar has never been reordered', () => {
    tabs$.tabs.set([
      { id: 'tab-a', url: 'https://a.example' },
      { id: 'tab-b', url: 'https://b.example' },
    ])
    tabs$.orders.set({ 'tab-a': 0, 'tab-b': 1 })
    tabs$.activeTabIndex.set(0)

    tabs$.closeTab(1)
    tabs$.reopenClosedTab(tabs$.recentlyClosedTabs.get()[0].id)

    expect(tabGroups$.sidebarOrder.get()).toEqual([])
  })
})
