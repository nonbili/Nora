import React, { useMemo, useRef, useState } from 'react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { DndContext, DragOverlay, PointerSensor, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { batch } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import { Pressable, ScrollView, View, useColorScheme } from 'react-native'
import { t } from 'i18next'
import { NouContextMenu, type ContextItem } from '@/components/menu/NouContextMenu'
import { NouText } from '@/components/NouText'
import { openTabInDesktopGroup } from '@/lib/desktop-view-actions'
import {
  getSidebarItems,
  getTabOrdersFromSidebarItems,
  groupItemKey,
  moveSidebarItem,
  moveSidebarItemToGap,
  placeTabItem,
  tabItemKey,
  type SidebarItem,
} from '@/lib/sidebar-order'
import { getGroupedTabIds, getTabGroupsKey } from '@/lib/tab-groups'
import { createDesktopTabGroup, tabGroups$, type TabGroup, type TabGroupLayout } from '@/states/tab-groups'
import { sortTabsByOrder, tabs$, type Tab } from '@/states/tabs'
import {
  GroupSectionPreview,
  ItemGapDropZone,
  NEW_TAB_SHORTCUT,
  SectionDropTarget,
  SidebarGroupSection,
} from './DesktopTabsSidebarParts'
import { TabRow, TabRowPreview } from './DesktopTabsSidebarTabRow'
import { useUrlDropTarget } from './useUrlDropTarget'

type PreviewState = { items: SidebarItem[]; groups: TabGroup[] }

// A group is as tall as its contents, so ranking its drag by overlapping area hands every
// collision to the full-height surface behind the list and the drag resolves to nothing.
// A dragged group is aimed by the pointer instead, at the gap it is closest to, which also
// makes "put it below everything" reachable.
const collisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type !== 'section') {
    return rectIntersection(args)
  }

  const pointerY = args.pointerCoordinates?.y ?? args.collisionRect.top
  let closestId: string | number | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  args.droppableContainers.forEach((container) => {
    const rect = container.rect.current
    if (container.data.current?.type !== 'gap' || !rect) {
      return
    }
    const distance = Math.abs(rect.top + rect.height / 2 - pointerY)
    if (distance < closestDistance) {
      closestId = container.id
      closestDistance = distance
    }
  })

  return closestId == null ? [] : [{ id: closestId }]
}

const sameIds = (left: (string | null)[], right: (string | null)[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])

const samePreviewState = (left: PreviewState, right: PreviewState) =>
  sameIds(left.items.map((item) => item.key), right.items.map((item) => item.key)) &&
  left.groups.length === right.groups.length &&
  left.groups.every((group, index) => group.id === right.groups[index]?.id && sameIds(group.tabIds, right.groups[index].tabIds))

export const DesktopTabsSidebar: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const tabs = useValue(tabs$.tabs)
  const orders = useValue(tabs$.orders)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)
  const sidebarOrder = useValue(tabGroups$.sidebarOrder)

  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<PreviewState | null>(null)

  const lastTarget = useRef<{ groupId: string | null; index: number | undefined; isGap: boolean } | null>(null)
  const lastSectionTarget = useRef<{ gapIndex?: number; overKey?: string } | null>(null)
  const lastUpdateAt = useRef<number>(0)

  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabs = useMemo(() => sortTabsByOrder(tabs, orders), [tabIdsKey, orders])
  const activeTabId = tabs[activeTabIndex]?.id
  const draggingTab = draggingTabId ? tabs.find((tab) => tab.id === draggingTabId) ?? null : null
  const groupsKey = getTabGroupsKey(groups)
  const groupedTabIds = useMemo(() => getGroupedTabIds(groups), [groupsKey])
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabIdsKey])
  const ungroupedTabIds = useMemo(
    () => orderedTabs.filter((tab) => !groupedTabIds.has(tab.id)).map((tab) => tab.id),
    [orderedTabs, groupedTabIds],
  )
  // Ungrouped tabs and group sections in one order, so a group can sit between two tabs.
  const items = useMemo(
    () => getSidebarItems(ungroupedTabIds, groups.map((group) => group.id), sidebarOrder),
    [ungroupedTabIds, groupsKey, sidebarOrder],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  )

  // The list is also what orders tabs for the workspace, so every change to it is written
  // back to both: the keys the sidebar renders from, and the flattened tab order.
  const commitItems = (nextItems: SidebarItem[]) => {
    tabGroups$.setSidebarOrder(nextItems.map((item) => item.key))
    tabs$.orders.set(
      getTabOrdersFromSidebarItems(nextItems, tabGroups$.groups.get(), tabs$.tabs.get().map((tab) => tab.id)),
    )
  }

  const { dropProps: sidebarDropProps } = useUrlDropTarget((url) => openTabInDesktopGroup(null, url), {
    stopPropagation: false,
  })

  const resetDrag = () => {
    setDraggingTabId(null)
    setDraggingGroupId(null)
    setDragState(null)
    lastTarget.current = null
    lastSectionTarget.current = null
    lastUpdateAt.current = 0
  }

  const focusSection = (groupId: string | null, tabIds: string[]) => {
    batch(() => {
      tabGroups$.setActiveGroup(groupId)
      const firstTabId = tabIds.find(Boolean)
      if (firstTabId) {
        tabs$.setActiveTabById(firstTabId, 'user')
      }
    })
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current
    setDraggingTabId(data?.type === 'tab' ? (data.tabId as string) : null)
    setDraggingGroupId(data?.type === 'section' ? (data.groupId as string) : null)
    setDragState({ items, groups: JSON.parse(JSON.stringify(groups)) })
    lastTarget.current = null
    lastSectionTarget.current = null
    lastUpdateAt.current = 0
  }

  const getDropTarget = (over: DragOverEvent['over']) => {
    const overData = over?.data.current
    if (overData?.type === 'gap') {
      return { groupId: null, index: overData.index as number, isGap: true }
    }
    const groupId = (overData?.type === 'section' ? overData.groupId : overData?.groupId) as string | null | undefined
    if (typeof groupId === 'undefined') {
      return null
    }
    return {
      groupId,
      index: overData?.type === 'tab' ? (overData.index as number) : undefined,
      isGap: false,
    }
  }

  // A gap is addressed by the slot it sits in, so a tab that is already above it lands one
  // place earlier once it has been lifted out of the list.
  const getInsertIndex = (list: SidebarItem[], tabId: string, target: { index: number | undefined; isGap: boolean }) => {
    if (!target.isGap || typeof target.index !== 'number') {
      return target.index
    }
    const currentIndex = list.findIndex((item) => item.key === tabItemKey(tabId))
    return currentIndex !== -1 && currentIndex < target.index ? target.index - 1 : target.index
  }

  // Which item of the list the pointer is over. A row inside a group answers with its
  // group, because that is the item that moves.
  const getTopLevelKey = (over: DragOverEvent['over']) => {
    const data = over?.data.current
    if (!data) {
      return null
    }
    if (data.type === 'section') {
      return data.groupId ? groupItemKey(data.groupId as string) : null
    }
    if (data.type === 'tab') {
      const groupId = data.groupId as string | null
      return groupId ? groupItemKey(groupId) : tabItemKey(data.tabId as string)
    }
    return null
  }

  const getSectionTarget = (over: DragOverEvent['over']) => {
    if (over?.data.current?.type === 'gap') {
      return { gapIndex: over.data.current.index as number }
    }
    const overKey = getTopLevelKey(over)
    return overKey ? { overKey } : null
  }

  const applySectionTarget = (
    list: SidebarItem[],
    activeKey: string,
    target: { gapIndex?: number; overKey?: string },
  ) => {
    if (typeof target.gapIndex === 'number') {
      return moveSidebarItemToGap(list, activeKey, target.gapIndex)
    }
    return target.overKey && target.overKey !== activeKey ? moveSidebarItem(list, activeKey, target.overKey) : list
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const data = active.data.current
    if (!over || over.id === active.id) {
      return
    }

    const now = Date.now()
    if (now - lastUpdateAt.current < 100) {
      return
    }

    if (data?.type === 'section') {
      const activeKey = groupItemKey(data.groupId as string)
      const target = getSectionTarget(over)
      if (!target || target.overKey === activeKey) {
        return
      }
      if (
        target.overKey === lastSectionTarget.current?.overKey &&
        target.gapIndex === lastSectionTarget.current?.gapIndex
      ) {
        return
      }
      lastUpdateAt.current = now
      lastSectionTarget.current = target
      setDragState((current) => (current ? { ...current, items: applySectionTarget(current.items, activeKey, target) } : current))
      return
    }

    const tabId = data?.tabId as string | undefined
    if (!tabId) {
      return
    }

    const target = getDropTarget(over)
    if (!target) {
      return
    }
    const { groupId: targetGroupId, index: targetIndex } = target

    if (lastTarget.current?.groupId === targetGroupId && lastTarget.current?.index === targetIndex) {
      return
    }

    lastUpdateAt.current = now
    lastTarget.current = { groupId: targetGroupId, index: targetIndex, isGap: target.isGap }

    setDragState((current) => {
      if (!current) {
        return current
      }

      const nextGroups = current.groups.map((group) => {
        const withoutTab =
          group.layout === 'grid-4'
            ? group.tabIds.map((currentTabId) => (currentTabId === tabId ? null : currentTabId))
            : group.tabIds.filter((currentTabId) => currentTabId !== tabId)
        if (group.id !== targetGroupId) {
          return { ...group, tabIds: withoutTab }
        }
        const tabIds = withoutTab.filter((currentTabId): currentTabId is string => typeof currentTabId === 'string')
        const boundedIndex = typeof targetIndex === 'number' ? Math.max(0, Math.min(targetIndex, tabIds.length)) : tabIds.length
        return { ...group, tabIds: [...tabIds.slice(0, boundedIndex), tabId, ...tabIds.slice(boundedIndex)] }
      })

      const nextItems = targetGroupId
        ? current.items.filter((item) => item.key !== tabItemKey(tabId))
        : placeTabItem(current.items, tabId, getInsertIndex(current.items, tabId, target))

      const next = { groups: nextGroups, items: nextItems }
      return samePreviewState(current, next) ? current : next
    })
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const data = active.data.current

    // The gaps the pointer aims at were rendered from the preview, so the drop resolves
    // against the preview too. Against the pre-drag list the same gap index means a
    // different slot, and the drop would undo what the preview promised.
    const baseItems = dragState?.items ?? items

    if (data?.type === 'section') {
      const activeKey = groupItemKey(data.groupId as string)
      const target = getSectionTarget(over) ?? lastSectionTarget.current
      // The preview has usually already reached the target gap, so applying it again is a
      // no-op. What is on screen is what was asked for either way, so commit it rather
      // than test whether this last step changed anything -- resetting the preview
      // without committing is what puts the group back where it started.
      commitItems(target ? applySectionTarget(baseItems, activeKey, target) : baseItems)
      resetDrag()
      return
    }

    const tabId = data?.tabId as string | undefined
    const target = over?.id === active.id ? lastTarget.current : getDropTarget(over) ?? lastTarget.current

    if (!tabId || !target) {
      resetDrag()
      return
    }

    const { groupId: targetGroupId, index: targetIndex } = target
    const insertIndex = getInsertIndex(baseItems, tabId, target)

    batch(() => {
      tabGroups$.moveTabToGroup(tabId, targetGroupId, targetIndex)
      commitItems(
        targetGroupId
          ? baseItems.filter((item) => item.key !== tabItemKey(tabId))
          : placeTabItem(baseItems, tabId, insertIndex),
      )
      resetDrag()
    })
  }

  const currentItems = dragState?.items ?? items
  const currentGroups = dragState?.groups ?? groups
  const groupById = useMemo(() => new Map(currentGroups.map((group) => [group.id, group])), [currentGroups])

  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  // Same tone as a tab row's label, so the row does not read as disabled.
  const newTabIconColor = isDark ? '#e4e4e7' : '#27272a'
  const menuIconColor = isDark ? '#a1a1aa' : '#52525b'

  const newGroupItems: ContextItem[] = (
    [
      { layout: 'deck' as TabGroupLayout, label: t('views.desktop.newDeckView'), icon: 'view-day' as const },
      { layout: 'split-view' as TabGroupLayout, label: t('views.desktop.newSplitView'), icon: 'view-week' as const },
      { layout: 'grid-4' as TabGroupLayout, label: t('views.desktop.newGridView'), icon: 'grid-view' as const },
    ]
  ).map(({ layout, label, icon }) => ({
    label,
    icon: <MaterialIcons name={icon} size={14} color={menuIconColor} />,
    handler: () => createDesktopTabGroup(layout),
  }))

  const recentlyClosedTabs = useValue(tabs$.recentlyClosedTabs)
  const sidebarContextItems: ContextItem[] = [
    {
      label: `${t('tabs.new')} (${NEW_TAB_SHORTCUT})`,
      icon: <MaterialIcons name="add" size={14} color={menuIconColor} />,
      handler: () => openTabInDesktopGroup(null),
    },
    ...(recentlyClosedTabs.length
      ? ([
          {
            label: t('buttons.reopenLastClosedTab'),
            icon: <MaterialIcons name="restore" size={14} color={menuIconColor} />,
            handler: () => tabs$.reopenClosedTabBatch(recentlyClosedTabs[0].id),
          },
          {
            label: t('tabs.clearRecentlyClosed'),
            icon: <MaterialIcons name="delete-outline" size={14} color={menuIconColor} />,
            handler: () => tabs$.clearRecentlyClosedTabs(),
          },
        ] as ContextItem[])
      : []),
    { kind: 'separator' },
    ...newGroupItems,
    { kind: 'separator' },
    {
      label: t('buttons.closeAll'),
      icon: <MaterialIcons name="tab-unselected" size={14} color="#f87171" />,
      color: 'red',
      handler: () => tabs$.closeAll(),
    },
  ]

  const draggingGroup = draggingGroupId ? currentGroups.find((group) => group.id === draggingGroupId) ?? null : null

  const renderItem = (item: SidebarItem, index: number) => {
    if (item.kind === 'tab') {
      const tab = tabById.get(item.tabId)
      if (!tab) {
        return null
      }
      return (
        <TabRow
          collapsed={collapsed}
          groupId={null}
          index={index}
          isActive={tab.id === activeTabId}
          key={item.key}
          tab={tab}
        />
      )
    }

    const group = groupById.get(item.groupId)
    if (!group) {
      return null
    }
    const groupTabs = group.tabIds
      .filter((tabId): tabId is string => typeof tabId === 'string')
      .map((tabId) => tabById.get(tabId))
      .filter((tab): tab is Tab => tab != null)
    return (
      <SidebarGroupSection
        activeGroupId={activeGroupId}
        activeTabId={activeTabId}
        collapsed={collapsed}
        focusSection={focusSection}
        group={group}
        groupTabs={groupTabs}
        isDragging={draggingGroupId === group.id}
        key={item.key}
      />
    )
  }

  const list = (
    <SortableContext items={currentItems.map((item) => item.key)} strategy={verticalListSortingStrategy}>
      <View className={collapsed ? 'items-center' : undefined}>
        <ItemGapDropZone collapsed={collapsed} index={0} />
        {currentItems.map((item, index) => (
          <React.Fragment key={item.key}>
            {renderItem(item, index)}
            <ItemGapDropZone collapsed={collapsed} index={index + 1} />
          </React.Fragment>
        ))}
      </View>
    </SortableContext>
  )

  // New tab is pinned below the list, where the next tab it opens will appear.
  const newTabButton = (
    <View className={collapsed ? 'items-center' : undefined}>
      <div title={`${t('tabs.new')} (${NEW_TAB_SHORTCUT})`}>
        <Pressable
          className={
            collapsed
              ? 'h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
              : 'min-h-8 flex-row items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
          }
          onPress={() => openTabInDesktopGroup(null)}
        >
          {collapsed ? (
            <MaterialIcons name="add" size={20} color={newTabIconColor} />
          ) : (
            <>
              <View className="h-4 w-1 shrink-0" />
              <View className="h-4 w-4 shrink-0 items-center justify-center">
                <MaterialIcons name="add" size={16} color={newTabIconColor} />
              </View>
              <NouText className="min-w-0 flex-1 text-xs font-medium text-zinc-800 dark:text-zinc-200" numberOfLines={1}>
                {t('tabs.new')}
              </NouText>
              <View className="flex-row shrink-0 items-center gap-1">
                {NEW_TAB_SHORTCUT.split('+').map((key) => (
                  <View
                    className="rounded border border-zinc-300 px-1 py-[1px] dark:border-zinc-700"
                    key={key}
                  >
                    <NouText className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{key}</NouText>
                  </View>
                ))}
              </View>
            </>
          )}
        </Pressable>
      </div>
    </View>
  )

  return (
    <DndContext
      collisionDetection={collisionDetection}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <NouContextMenu items={sidebarContextItems}>
        <div className="h-full w-full" {...sidebarDropProps}>
          <View className="h-full w-full flex-col bg-zinc-100 dark:bg-zinc-900">
            <ScrollView
              className="flex-1"
              contentContainerClassName={
                collapsed
                  ? 'min-h-full gap-2 items-center overflow-visible px-1 pb-2 pt-1'
                  : 'min-h-full gap-3 overflow-visible px-2 pb-3 pt-1'
              }
            >
              <SectionDropTarget groupId={null}>
                {/* The wrapper is only as tall as the list, so the sticky row below sits
                    right under the last tab and rides the bottom edge only once the list
                    is long enough to scroll. */}
                <div>
                  {list}
                  <div className="sticky bottom-0 bg-zinc-100 pt-1 dark:bg-zinc-900">{newTabButton}</div>
                </div>
              </SectionDropTarget>
            </ScrollView>
          </View>
        </div>
      </NouContextMenu>
      <DragOverlay dropAnimation={null}>
        {draggingTab ? <TabRowPreview collapsed={collapsed} tab={draggingTab} /> : null}
        {draggingGroup ? (
          <GroupSectionPreview
            collapsed={collapsed}
            group={draggingGroup}
            tabCount={draggingGroup.tabIds.filter(Boolean).length}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
