import { describe, expect, it } from 'bun:test'
import { addTabToGroup, normalizeTabGroups, removeTabFromGroups, sanitizeGroupTabIds, type TabGroup } from '../lib/tab-groups'

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
    expect(data?.groups[1].tabIds).toEqual(['tab-3', null, null, null])
  })
})
