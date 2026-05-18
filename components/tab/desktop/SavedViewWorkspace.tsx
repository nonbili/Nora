import React from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { clsx } from '@/lib/utils'
import { savedViews$, type CustomSavedView } from '@/states/saved-views'
import { type Tab } from '@/states/tabs'
import { EmptySlot } from './EmptySlot'
import { SavedViewTab } from './SavedViewTab'

export const SavedViewWorkspace: React.FC<{
  activeSlotIndex: number | null
  activeView: CustomSavedView
  focusSlot: (viewId: string, slotIndex: number) => void
  orderedTabs: Tab[]
  tabIdSet: Set<string>
  tabs: Tab[]
}> = ({ activeSlotIndex, activeView, focusSlot, orderedTabs, tabIdSet, tabs }) => {
  const isSplit = activeView.layout === 'split-view'
  const tabById = new Map(tabs.map((tab, index) => [tab.id, { index, tab }] as const))

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 1 },
    }),
  )

  const sortableIds = activeView.slotTabIds.filter(
    (tabId): tabId is string => typeof tabId === 'string' && tabIdSet.has(tabId),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return
    }
    const fromSlotIndex = activeView.slotTabIds.findIndex((tabId) => tabId === active.id)
    const toSlotIndex = activeView.slotTabIds.findIndex((tabId) => tabId === over.id)
    if (fromSlotIndex === -1 || toSlotIndex === -1) {
      return
    }
    savedViews$.reorderSlots(activeView.id, fromSlotIndex, toSlotIndex)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={sortableIds}
        strategy={isSplit ? horizontalListSortingStrategy : rectSortingStrategy}
      >
        <div className={clsx(isSplit ? 'flex-1 min-w-0 flex flex-row gap-2 p-2' : 'relative flex-1 overflow-hidden p-2')}>
          {activeView.slotTabIds.map((tabId, slotIndex) => {
            if (!tabId || !tabIdSet.has(tabId)) {
              return null
            }

            const entry = tabById.get(tabId)
            if (!entry) {
              return null
            }

            const { index, tab } = entry

            return (
              <SavedViewTab
                activeSlotIndex={activeSlotIndex}
                activeView={activeView}
                focusSlot={focusSlot}
                key={tab.id}
                index={index}
                isSplit={isSplit}
                isVisible
                orderedTabs={orderedTabs}
                slotIndex={slotIndex}
                tabIdSet={tabIdSet}
                tab={tab}
                viewLayout={activeView.layout}
              />
            )
          })}

          {activeView.slotTabIds
            .map((tabId, slotIndex) => ({ tabId, slotIndex }))
            .filter(({ tabId }) => !tabId || !tabIdSet.has(tabId))
            .map(({ slotIndex }) => (
              <EmptySlot
                key={`${activeView.id}-${slotIndex}`}
                isActive={slotIndex === activeSlotIndex}
                onActivate={() => focusSlot(activeView.id, slotIndex)}
                slotIndex={slotIndex}
                orderedTabs={orderedTabs}
                tabIdSet={tabIdSet}
                view={activeView}
                isSplit={isSplit}
              />
            ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
