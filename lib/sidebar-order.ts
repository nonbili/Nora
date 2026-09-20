import { type TabGroup } from './tab-groups'

export const SIDEBAR_TAB_PREFIX = 'tab:'
export const SIDEBAR_GROUP_PREFIX = 'group:'

export type SidebarItem =
  | { kind: 'tab'; key: string; tabId: string }
  | { kind: 'group'; key: string; groupId: string }

export const tabItemKey = (tabId: string) => `${SIDEBAR_TAB_PREFIX}${tabId}`
export const groupItemKey = (groupId: string) => `${SIDEBAR_GROUP_PREFIX}${groupId}`

// The sidebar is a single list in which an ungrouped tab and a group section are the same
// kind of thing, so they share one order, stored as these keys. The stored order never
// has to be complete or clean: keys that no longer resolve are dropped, and a tab or
// group it has not seen yet is appended in its own natural order. An empty stored order
// therefore renders tabs first and groups after, which is what the sidebar did before it
// could be reordered.
export function getSidebarItems(
  orderedUngroupedTabIds: string[],
  groupIds: string[],
  sidebarOrder: string[],
): SidebarItem[] {
  const byKey = new Map<string, SidebarItem>()
  orderedUngroupedTabIds.forEach((tabId) => {
    const key = tabItemKey(tabId)
    byKey.set(key, { kind: 'tab', key, tabId })
  })
  groupIds.forEach((groupId) => {
    const key = groupItemKey(groupId)
    byKey.set(key, { kind: 'group', key, groupId })
  })

  const items: SidebarItem[] = []
  const used = new Set<string>()
  sidebarOrder.forEach((key) => {
    const item = byKey.get(key)
    if (item && !used.has(key)) {
      used.add(key)
      items.push(item)
    }
  })
  byKey.forEach((item, key) => {
    if (!used.has(key)) {
      used.add(key)
      items.push(item)
    }
  })

  return items
}

export function moveSidebarItem(items: SidebarItem[], activeKey: string, overKey: string) {
  const from = items.findIndex((item) => item.key === activeKey)
  const to = items.findIndex((item) => item.key === overKey)
  if (from === -1 || to === -1 || from === to) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// Moves an item to a gap in the list, where gap `n` is the slot before item `n`. The
// item is lifted out first, so a gap below its own position shifts up by one.
export function moveSidebarItemToGap(items: SidebarItem[], key: string, gapIndex: number) {
  const from = items.findIndex((item) => item.key === key)
  if (from === -1) {
    return items
  }
  const without = items.filter((item) => item.key !== key)
  const index = Math.max(0, Math.min(gapIndex > from ? gapIndex - 1 : gapIndex, without.length))
  if (index === from) {
    return items
  }
  return [...without.slice(0, index), items[from], ...without.slice(index)]
}

// Puts a tab at a position in the list, whether it was elsewhere in it or is arriving
// from a group. An index past the end, or none at all, appends it.
export function placeTabItem(items: SidebarItem[], tabId: string, targetIndex?: number) {
  const key = tabItemKey(tabId)
  const without = items.filter((item) => item.key !== key)
  const index = typeof targetIndex === 'number' ? Math.max(0, Math.min(targetIndex, without.length)) : without.length
  return [...without.slice(0, index), { kind: 'tab' as const, key, tabId }, ...without.slice(index)]
}

// The workspace orders tabs by `tabs$.orders`, so the sidebar's list is flattened back
// into it -- a group contributes its own tabs in its own order -- and the two stay in
// step. Tabs the list does not account for keep a position at the end rather than losing
// their order entirely.
export function getTabOrdersFromSidebarItems(items: SidebarItem[], groups: TabGroup[], allTabIds: string[]) {
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const tabIds: string[] = []
  const seen = new Set<string>()
  const push = (tabId: string) => {
    if (!seen.has(tabId)) {
      seen.add(tabId)
      tabIds.push(tabId)
    }
  }

  items.forEach((item) => {
    if (item.kind === 'tab') {
      push(item.tabId)
      return
    }
    groupById
      .get(item.groupId)
      ?.tabIds.filter((tabId): tabId is string => typeof tabId === 'string')
      .forEach(push)
  })
  allTabIds.forEach(push)

  return Object.fromEntries(tabIds.map((tabId, index) => [tabId, index]))
}

// Ungrouping a section leaves its tabs behind. Putting their keys where the group's key
// was keeps them where the eye last saw them, instead of appending them to the bottom.
export function replaceSidebarKey(keys: string[], key: string, replacements: string[]) {
  const index = keys.indexOf(key)
  const without = keys.filter((currentKey) => currentKey !== key && !replacements.includes(currentKey))
  if (index === -1) {
    return [...without, ...replacements]
  }
  const boundedIndex = Math.min(index, without.length)
  return [...without.slice(0, boundedIndex), ...replacements, ...without.slice(boundedIndex)]
}
