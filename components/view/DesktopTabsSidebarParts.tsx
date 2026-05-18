import React, { memo, type ReactNode } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Pressable, View, useColorScheme } from 'react-native'
import { t } from 'i18next'
import { NouContextMenu, type ContextItem } from '@/components/menu/NouContextMenu'
import { NouText } from '@/components/NouText'
import { clsx } from '@/lib/utils'
import { tabGroups$, type TabGroup, type TabGroupLayout } from '@/states/tab-groups'
import { openDesktopTab, sortTabsByOrder, tabs$, type Tab } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { TAB_DND_PREFIX } from './DesktopTabsSidebarConstants'
import { TabRow } from './DesktopTabsSidebarTabRow'

const UNGROUPED_ID = 'ungrouped'
const GROUP_DND_PREFIX = 'group:'

const isMacPlatform = typeof window !== 'undefined' && window.electron?.process?.platform === 'darwin'
export const NEW_TAB_SHORTCUT = isMacPlatform ? '⌘T' : 'Ctrl+T'

const getLayoutLabel = (layout: TabGroupLayout) => {
  if (layout === 'split-view') return t('views.desktop.layout.split')
  if (layout === 'grid-4') return t('views.desktop.layout.grid')
  return t('views.desktop.layout.deck')
}

const ViewTypeIcon = ({ layout, size = 18, color = '#71717a' }: { layout: TabGroupLayout; size?: number; color?: string }) => {
  let name: React.ComponentProps<typeof MaterialIcons>['name'] = 'view-day'
  if (layout === 'split-view') name = 'view-week'
  if (layout === 'grid-4') name = 'grid-view'
  return <MaterialIcons name={name} size={size} color={color} />
}

const getGlobalOrderedTabIds = (tabs: Tab[], orders: Record<string, number>) => sortTabsByOrder(tabs, orders).map((tab) => tab.id)

export const reorderUngroupedTabs = (tabId: string, ungroupedIds: string[], targetIndex?: number) => {
  const withoutTab = ungroupedIds.filter((currentTabId) => currentTabId !== tabId)
  const boundedIndex = typeof targetIndex === 'number' ? Math.max(0, Math.min(targetIndex, withoutTab.length)) : withoutTab.length
  const nextUngrouped = [...withoutTab.slice(0, boundedIndex), tabId, ...withoutTab.slice(boundedIndex)]
  const globalIds = getGlobalOrderedTabIds(tabs$.tabs.get(), tabs$.orders.get())
  const ungroupedSet = new Set(ungroupedIds.concat([tabId]))
  const nextQueue = [...nextUngrouped]
  const nextGlobal = globalIds.map((currentTabId) => {
    if (currentTabId === tabId) return null
    if (ungroupedSet.has(currentTabId)) return nextQueue.shift() ?? currentTabId
    return currentTabId
  }).filter((id): id is string => id !== null)
  while (nextQueue.length) {
    const id = nextQueue.shift()
    if (id) nextGlobal.push(id)
  }
  tabs$.orders.set(Object.fromEntries(nextGlobal.map((currentTabId, index) => [currentTabId, index])))
}

export const SectionDropTarget: React.FC<{
  children: ReactNode
  groupId: string | null
}> = ({ children, groupId }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: groupId ? `${GROUP_DND_PREFIX}${groupId}` : UNGROUPED_ID,
    data: { type: 'section', groupId },
  })
  const { active, over } = useDndContext()
  const activeGroupId = (active?.data.current?.groupId ?? null) as string | null | undefined
  const overGroupId = (over?.data.current?.groupId ?? null) as string | null | undefined
  const isCrossSectionTarget = !!active && !!over && activeGroupId !== groupId && overGroupId === groupId
  const showHighlight = isOver || isCrossSectionTarget

  return (
    <div
      ref={setNodeRef}
      className={clsx('rounded-md transition-colors', showHighlight && 'bg-indigo-50/80 dark:bg-indigo-400/10')}
    >
      {children}
    </div>
  )
}

export const GroupHeader = memo<{
  collapsed?: boolean
  group: TabGroup
  isActive: boolean
  onFocus: () => void
}>(({ collapsed = false, group, isActive, onFocus }) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const iconColor = isActive ? (isDark ? '#e0e7ff' : '#312e81') : isDark ? '#a1a1aa' : '#52525b'
  const menuIconColor = isDark ? '#a1a1aa' : '#52525b'
  const layoutItems = (['deck', 'split-view', 'grid-4'] as const).map((layout) => ({
    label: getLayoutLabel(layout),
    icon: <ViewTypeIcon layout={layout} size={14} color={menuIconColor} />,
    meta: layout === group.layout ? <MaterialIcons name="check" size={14} color="#4f46e5" /> : undefined,
    handler: () => tabGroups$.setGroupLayout(group.id, layout),
  }))
  const contextItems: ContextItem[] = [
    {
      label: t('tabs.new'),
      icon: <MaterialIcons name="add" size={14} color={menuIconColor} />,
      handler: () => {
        tabGroups$.setActiveGroup(group.id)
        const tabId = openDesktopTab('')
        if (tabId) {
          if (group.layout === 'split-view') {
            const emptySlotIndex = group.tabIds.findIndex((slotTabId) => !slotTabId)
            if (emptySlotIndex >= 0) {
              tabGroups$.assignGroupSlot(group.id, emptySlotIndex, tabId)
            } else {
              const newSlotIndex = group.tabIds.length
              tabGroups$.appendSplitGroupSlot(group.id)
              tabGroups$.assignGroupSlot(group.id, newSlotIndex, tabId)
            }
          } else {
            tabGroups$.moveTabToGroup(tabId, group.id)
          }
          tabs$.setActiveTabById(tabId, 'open')
        }
      },
    },
    { kind: 'separator' },
    {
      label: t('views.desktop.renameGroup'),
      icon: <MaterialIcons name="edit" size={14} color={menuIconColor} />,
      handler: () => ui$.renameGroupModalTargetGroupId.set(group.id),
    },
    {
      label: t('menus.delete'),
      icon: <MaterialIcons name="delete" size={14} color="#f87171" />,
      color: 'red',
      handler: () => tabGroups$.deleteGroup(group.id),
    },
  ]

  const mergedContextItems: ContextItem[] = [
    ...layoutItems.map((item) => ({
      ...item,
      handler: () => {
        item.handler()
        onFocus()
      },
    })),
    { kind: 'separator' },
    ...contextItems,
  ]

  if (collapsed) {
    const collapsedIconColor = isDark ? '#a1a1aa' : '#52525b'
    return (
      <NouContextMenu items={mergedContextItems}>
        <div title={group.name}>
          <Pressable
            className="h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900"
            onPress={onFocus}
          >
            <ViewTypeIcon layout={group.layout} size={20} color={collapsedIconColor} />
          </Pressable>
        </div>
      </NouContextMenu>
    )
  }

  return (
    <NouContextMenu items={mergedContextItems}>
      <Pressable
        className={clsx(
          'flex-row items-center gap-2 rounded-md border px-2 py-1 transition-colors',
          'border-transparent hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900',
        )}
        onPress={onFocus}
      >
        <View className="h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/70 dark:bg-zinc-950/50">
          <ViewTypeIcon layout={group.layout} size={14} color={iconColor} />
        </View>
        <View className="min-w-0 flex-1">
          <NouText className="text-xs font-bold text-zinc-900 dark:text-zinc-100" numberOfLines={1}>
            {group.name}
          </NouText>
        </View>
      </Pressable>
    </NouContextMenu>
  )
})
GroupHeader.displayName = 'GroupHeader'

export const SidebarGroupSection: React.FC<{
  activeGroupId: string | null
  activeTabId?: string
  collapsed?: boolean
  focusSection: (groupId: string | null, tabIds: string[]) => void
  group: TabGroup
  groupTabs: Tab[]
}> = ({ activeGroupId, activeTabId, collapsed = false, focusSection, group, groupTabs }) => {
  const isActiveGroup = group.id === activeGroupId
  const tabRows = groupTabs.map((tab, index) => (
    <TabRow
      collapsed={collapsed}
      groupId={group.id}
      index={index}
      isActive={tab.id === activeTabId}
      key={tab.id}
      tab={tab}
    />
  ))

  return (
    <SectionDropTarget groupId={group.id}>
      <div
        className={clsx(
          collapsed ? 'rounded-xl border px-1 py-1 transition-colors' : 'rounded-xl border p-1 transition-colors',
          isActiveGroup ? 'border-indigo-200 dark:border-indigo-300/45' : 'border-zinc-200/80 dark:border-zinc-700/80',
        )}
      >
        <View className={clsx(collapsed && 'gap-1 items-center')}>
          <GroupHeader
            collapsed={collapsed}
            group={group}
            isActive={isActiveGroup}
            onFocus={() => focusSection(group.id, groupTabs.map((tab) => tab.id))}
          />
          {groupTabs.length > 0 && (
            <SortableContext items={groupTabs.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
              <View className={collapsed ? 'gap-1 items-center' : 'mt-1 gap-1'}>{tabRows}</View>
            </SortableContext>
          )}
        </View>
      </div>
    </SectionDropTarget>
  )
}
