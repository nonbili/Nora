import { describe, expect, it } from 'bun:test'
import {
  getSidebarItems,
  getTabOrdersFromSidebarItems,
  groupItemKey,
  moveSidebarItem,
  moveSidebarItemToGap,
  placeTabItem,
  replaceSidebarKey,
  tabItemKey,
} from './sidebar-order'
import { type TabGroup } from './tab-groups'

const keys = (items: { key: string }[]) => items.map((item) => item.key)

describe('getSidebarItems', () => {
  it('renders tabs before groups when nothing has been reordered', () => {
    expect(keys(getSidebarItems(['tab-1', 'tab-2'], ['group-1'], []))).toEqual([
      tabItemKey('tab-1'),
      tabItemKey('tab-2'),
      groupItemKey('group-1'),
    ])
  })

  it('follows the stored order', () => {
    const stored = [groupItemKey('group-1'), tabItemKey('tab-2'), tabItemKey('tab-1')]
    expect(keys(getSidebarItems(['tab-1', 'tab-2'], ['group-1'], stored))).toEqual(stored)
  })

  it('drops keys that no longer resolve and appends what it has not seen', () => {
    const stored = [tabItemKey('closed'), groupItemKey('group-1'), tabItemKey('tab-1')]
    expect(keys(getSidebarItems(['tab-1', 'tab-new'], ['group-1'], stored))).toEqual([
      groupItemKey('group-1'),
      tabItemKey('tab-1'),
      tabItemKey('tab-new'),
    ])
  })

  it('ignores a duplicated key', () => {
    const stored = [tabItemKey('tab-1'), tabItemKey('tab-1')]
    expect(keys(getSidebarItems(['tab-1'], [], stored))).toEqual([tabItemKey('tab-1')])
  })
})

describe('moveSidebarItem', () => {
  const items = getSidebarItems(['tab-1', 'tab-2'], ['group-1'], [])

  it('moves a group up between tabs', () => {
    expect(keys(moveSidebarItem(items, groupItemKey('group-1'), tabItemKey('tab-2')))).toEqual([
      tabItemKey('tab-1'),
      groupItemKey('group-1'),
      tabItemKey('tab-2'),
    ])
  })

  it('leaves the list alone for an unknown or unchanged position', () => {
    expect(moveSidebarItem(items, tabItemKey('tab-1'), tabItemKey('tab-1'))).toBe(items)
    expect(moveSidebarItem(items, tabItemKey('missing'), tabItemKey('tab-1'))).toBe(items)
  })
})

describe('placeTabItem', () => {
  const items = getSidebarItems(['tab-1', 'tab-2'], ['group-1'], [])

  it('inserts a tab arriving from a group', () => {
    expect(keys(placeTabItem(items, 'tab-3', 1))).toEqual([
      tabItemKey('tab-1'),
      tabItemKey('tab-3'),
      tabItemKey('tab-2'),
      groupItemKey('group-1'),
    ])
  })

  it('moves a tab already in the list instead of duplicating it', () => {
    expect(keys(placeTabItem(items, 'tab-2', 0))).toEqual([
      tabItemKey('tab-2'),
      tabItemKey('tab-1'),
      groupItemKey('group-1'),
    ])
  })

  it('appends without a target index', () => {
    expect(keys(placeTabItem(items, 'tab-3'))).toEqual([
      tabItemKey('tab-1'),
      tabItemKey('tab-2'),
      groupItemKey('group-1'),
      tabItemKey('tab-3'),
    ])
  })
})

describe('getTabOrdersFromSidebarItems', () => {
  const groups: TabGroup[] = [
    { id: 'group-1', name: 'One', layout: 'grid-4', tabIds: ['tab-3', null, 'tab-4', null] },
  ]

  it('flattens a group into the tab order at the group position', () => {
    const items = getSidebarItems(['tab-1', 'tab-2'], ['group-1'], [
      tabItemKey('tab-1'),
      groupItemKey('group-1'),
      tabItemKey('tab-2'),
    ])

    expect(getTabOrdersFromSidebarItems(items, groups, ['tab-1', 'tab-2', 'tab-3', 'tab-4'])).toEqual({
      'tab-1': 0,
      'tab-3': 1,
      'tab-4': 2,
      'tab-2': 3,
    })
  })

  it('keeps a position for a tab the list does not account for', () => {
    const items = getSidebarItems(['tab-1'], [], [])
    expect(getTabOrdersFromSidebarItems(items, [], ['tab-1', 'orphan'])).toEqual({ 'tab-1': 0, orphan: 1 })
  })
})

describe('replaceSidebarKey', () => {
  it('puts the replacements where the key was', () => {
    const keys = [tabItemKey('tab-1'), groupItemKey('group-1'), tabItemKey('tab-2')]
    expect(replaceSidebarKey(keys, groupItemKey('group-1'), [tabItemKey('tab-3'), tabItemKey('tab-4')])).toEqual([
      tabItemKey('tab-1'),
      tabItemKey('tab-3'),
      tabItemKey('tab-4'),
      tabItemKey('tab-2'),
    ])
  })

  it('appends when the key is not in the order yet', () => {
    expect(replaceSidebarKey([tabItemKey('tab-1')], groupItemKey('group-1'), [tabItemKey('tab-2')])).toEqual([
      tabItemKey('tab-1'),
      tabItemKey('tab-2'),
    ])
  })

  it('does not leave a replacement listed twice', () => {
    const keys = [tabItemKey('tab-1'), groupItemKey('group-1')]
    expect(replaceSidebarKey(keys, groupItemKey('group-1'), [tabItemKey('tab-1')])).toEqual([tabItemKey('tab-1')])
  })
})

describe('moveSidebarItemToGap', () => {
  const items = getSidebarItems(['tab-1', 'tab-2'], ['group-1'], [])

  it('moves a group to the top', () => {
    expect(keys(moveSidebarItemToGap(items, groupItemKey('group-1'), 0))).toEqual([
      groupItemKey('group-1'),
      tabItemKey('tab-1'),
      tabItemKey('tab-2'),
    ])
  })

  it('moves a group between two tabs', () => {
    expect(keys(moveSidebarItemToGap(items, groupItemKey('group-1'), 1))).toEqual([
      tabItemKey('tab-1'),
      groupItemKey('group-1'),
      tabItemKey('tab-2'),
    ])
  })

  it('accounts for the item being lifted out of the list first', () => {
    expect(keys(moveSidebarItemToGap(items, tabItemKey('tab-1'), 2))).toEqual([
      tabItemKey('tab-2'),
      tabItemKey('tab-1'),
      groupItemKey('group-1'),
    ])
  })

  it('leaves the list alone when the gap is where the item already is', () => {
    expect(moveSidebarItemToGap(items, tabItemKey('tab-1'), 0)).toBe(items)
    expect(moveSidebarItemToGap(items, tabItemKey('tab-1'), 1)).toBe(items)
  })
})
