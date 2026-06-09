import React, { useEffect, useMemo, useRef } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { DndContext, PointerSensor, rectIntersection, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable'
import { useValue } from '@legendapp/state/react'
import { Pressable } from 'react-native'
import { clsx } from '@/lib/utils'
import { tabGroups$, type TabGroupLayout } from '@/states/tab-groups'
import { getOrderedTabIds, openDesktopTab, sortTabsByOrder, tabs$ } from '@/states/tabs'
import { GroupEmptySlot } from './desktop/GroupEmptySlot'
import { SortableDesktopTab } from './desktop/SortableDesktopTab'
import { desktopWorkspaceState$ } from './desktop/desktopWorkspaceState'

export const DesktopWorkspace: React.FC = () => {
  const tabs = useValue(tabs$.tabs)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const orders = useValue(tabs$.orders)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)
  const focusedEmptySlotByGroup = useValue(desktopWorkspaceState$.focusedEmptySlotByGroup)
  const deckScrollRef = useRef<HTMLDivElement>(null)
  const prevTabCountRef = useRef(tabs.length)

  const activeGroup = groups.find((group) => group.id === activeGroupId) || null
  const groupedTabIds = useMemo(
    () => new Set(groups.flatMap((group) => group.tabIds.filter((tabId): tabId is string => typeof tabId === 'string'))),
    [groups],
  )
  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabs = useMemo(() => sortTabsByOrder(tabs, orders), [tabIdsKey, orders])
  const orderedTabIds = useMemo(() => getOrderedTabIds(tabs, orders), [tabIdsKey, orders])
  const tabIdSet = useMemo(() => new Set(tabs.map((tab) => tab.id)), [tabIdsKey])
  const ungroupedTabIds = orderedTabs.filter((tab) => !groupedTabIds.has(tab.id)).map((tab) => tab.id)
  const activeTabId = tabs[activeTabIndex]?.id
  const isSingle = !activeGroup
  const singleVisibleTabId = isSingle
    ? activeTabId && ungroupedTabIds.includes(activeTabId)
      ? activeTabId
      : ungroupedTabIds[0]
    : undefined
  const visibleSlots = activeGroup ? activeGroup.tabIds : singleVisibleTabId ? [singleVisibleTabId] : []
  const visibleTabIds = visibleSlots.filter((tabId): tabId is string => typeof tabId === 'string' && tabIdSet.has(tabId))
  const visibleTabIdSet = useMemo(() => new Set(visibleTabIds), [visibleTabIds.join('|')])
  const viewLayout: TabGroupLayout = activeGroup?.layout || 'deck'
  const isDeck = viewLayout === 'deck' && !isSingle
  const isSplit = viewLayout === 'split-view' && !isSingle

  useEffect(() => {
    if (isDeck && tabs.length > prevTabCountRef.current && deckScrollRef.current) {
      requestAnimationFrame(() => {
        deckScrollRef.current?.scrollTo({ left: deckScrollRef.current.scrollWidth, behavior: 'smooth' })
      })
    }
    prevTabCountRef.current = tabs.length
  }, [isDeck, tabs.length])

  useEffect(() => {
    if (!tabs.length) {
      return
    }
    if (activeTabId && visibleTabIds.includes(activeTabId)) {
      return
    }
    const fallbackTabId = visibleTabIds.find((tabId) => tabIdSet.has(tabId))
    if (fallbackTabId) {
      tabs$.setActiveTabById(fallbackTabId, 'system')
    }
  }, [activeGroupId, activeTabId, tabIdsKey, visibleTabIds.join('|')])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 1 },
    }),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return
    }

    if ((isSplit || (activeGroup && viewLayout === 'grid-4')) && activeGroup) {
      const fromSlotIndex = activeGroup.tabIds.findIndex((tabId) => tabId === active.id)
      const toSlotIndex = activeGroup.tabIds.findIndex((tabId) => tabId === over.id)
      if (fromSlotIndex !== -1 && toSlotIndex !== -1) {
        tabGroups$.reorderGroupSlots(activeGroup.id, fromSlotIndex, toSlotIndex)
      }
      return
    }

    if (!isDeck) {
      return
    }
    const oldIndex = visibleTabIds.findIndex((tabId) => tabId === active.id)
    const newIndex = visibleTabIds.findIndex((tabId) => tabId === over.id)
    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    if (activeGroup) {
      tabGroups$.moveTabToGroup(active.id as string, activeGroup.id, newIndex)
      return
    }

    const reorderedVisible = arrayMove(visibleTabIds, oldIndex, newIndex)
    const visibleSet = new Set(visibleTabIds)
    const nextTabIds = [...reorderedVisible, ...orderedTabIds.filter((tabId) => !visibleSet.has(tabId))]
    tabs$.orders.set(Object.fromEntries(nextTabIds.map((tabId, index) => [tabId, index])))
  }

  const slotIndexByTabId = new Map<string, number>()
  visibleSlots.forEach((tabId, slotIndex) => {
    if (tabId && tabIdSet.has(tabId)) {
      slotIndexByTabId.set(tabId, slotIndex)
    }
  })

  const fallbackEmptySlotIndex = visibleSlots.findIndex((tabId) => !tabId || !tabIdSet.has(tabId))
  const activeSlotIndex =
    !activeGroup || isDeck
      ? null
      : activeTabId && slotIndexByTabId.has(activeTabId)
        ? slotIndexByTabId.get(activeTabId) ?? null
        : focusedEmptySlotByGroup[activeGroup.id] ?? (fallbackEmptySlotIndex >= 0 ? fallbackEmptySlotIndex : null)

  const createDeckTab = () => {
    const tabId = openDesktopTab('')
    if (tabId && activeGroup) {
      tabGroups$.moveTabToGroup(tabId, activeGroup.id)
    }
    if (tabId) {
      tabs$.setActiveTabById(tabId, 'open')
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleDragEnd}>
      <SortableContext
        items={isDeck || isSplit || (activeGroup && viewLayout === 'grid-4') ? visibleTabIds : []}
        strategy={viewLayout === 'grid-4' ? rectSortingStrategy : horizontalListSortingStrategy}
      >
        <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={isDeck ? deckScrollRef : undefined}
            className={clsx(
              isDeck
                ? 'flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden p-2'
                : isSplit
                  ? 'flex min-h-0 flex-1 min-w-0 flex-row gap-2 overflow-hidden p-2'
                  : 'relative min-h-0 flex-1 overflow-hidden p-2',
            )}
          >
            {tabs.map((tab, index) => {
              const slotIndex = slotIndexByTabId.get(tab.id)
              const isVisible = visibleTabIdSet.has(tab.id)
              const order = isDeck ? visibleTabIds.findIndex((tabId) => tabId === tab.id) : slotIndex ?? index
              return (
                <SortableDesktopTab
                  key={tab.id}
                  index={index}
                  isActive={activeTabId === tab.id}
                  isDeck={isDeck}
                  isSingle={isSingle}
                  isSplit={isSplit}
                  isVisible={isVisible}
                  order={order}
                  slotIndex={slotIndex ?? null}
                  tab={tab}
                  viewLayout={viewLayout}
                />
              )
            })}

            {isDeck ? (
              <div style={{ order: visibleTabIds.length + 1 }}>
                <Pressable
                  className="flex h-full w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:bg-zinc-900/70"
                  onPress={createDeckTab}
                >
                  <MaterialIcons name="add" size={22} color="#a1a1aa" />
                </Pressable>
              </div>
            ) : null}

            {activeGroup && !isDeck
              ? activeGroup.tabIds.map((tabId, slotIndex) =>
                  tabId && tabIdSet.has(tabId) ? null : (
                    <GroupEmptySlot
                      key={`${activeGroup.id}-${slotIndex}`}
                      activeSlotIndex={activeSlotIndex}
                      group={activeGroup}
                      isSplit={isSplit}
                      orderedTabs={orderedTabs}
                      slotIndex={slotIndex}
                      tabIdSet={tabIdSet}
                    />
                  ),
                )
              : null}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  )
}
