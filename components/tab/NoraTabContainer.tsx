import React, { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'

import { CSS } from '@dnd-kit/utilities'
import { Tab, tabs$ } from '@/states/tabs'
import { NoraTab } from './NoraTab'
import { orderBy, sortBy } from 'es-toolkit'
import { clsx } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'

const SortableItem: React.FC<{
  tab: Tab
  index: number
  orders: Record<string, number>
}> = ({ tab, index, orders }) => {
  const { attributes, listeners, setNodeRef, transform, transition, over, isOver, active } = useSortable({
    id: tab.id,
  })

  let overOrder, activeOrder
  if (isOver && active && over) {
  }

  const style = {
    /* transform: CSS.Transform.toString(transform), */
    /* transition, */
    order: orders[tab.id],
  }

  return (
    <div
      className={clsx(
        'flex transition-all',
        over && 'pointer-events-none',
        active?.id == tab.id && 'rotate-[1deg] translate-y-[-16px]',
        isOver &&
          active &&
          over &&
          (orders[active.id] < orders[over.id]
            ? 'border-r-2 border-r-sky-500 pr-2'
            : 'border-l-2 border-l-sky-500 pl-2'),
      )}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <NoraTab tab={tab} index={index} />
    </div>
  )
}

export const NoraTabContainer: React.FC<{ tabs: Tab[] }> = ({ tabs }) => {
  const orders = useValue(tabs$.orders)

  useEffect(() => {
    const stateTabIds = tabs.map((x) => x.id)
    const tabIds = sortBy(Object.entries(orders), [(x) => x[1]]).map((x) => x[0])
    for (const tab of tabs) {
      if (!(tab.id in orders)) {
        tabIds.push(tab.id)
      }
    }
    const newOrders: Record<string, number> = {}
    let i = 0
    for (const id of tabIds) {
      if (!stateTabIds.includes(id)) {
        continue
      }
      newOrders[id] = i++
    }
    tabs$.orders.set(newOrders)
  }, [tabs.length])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      /* https://github.com/clauderic/dnd-kit/issues/591#issuecomment-1017050816 */
      activationConstraint: {
        distance: 1,
      },
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const entries = sortBy(Object.entries(orders), [(x) => x[1]])
      const oldIndex = entries.findIndex((x) => x[0] == active.id)
      const newIndex = entries.findIndex((x) => x[0] == over.id)
      const newEntries = arrayMove(entries, oldIndex, newIndex)
      const newOrders: Record<string, number> = {}
      let i = 0
      for (const [id] of newEntries) {
        newOrders[id] = i++
      }
      tabs$.orders.set(newOrders)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
        <div className="flex-1 flex gap-2 p-2 overflow-x-auto overflow-y-hidden">
          {tabs.map((tab, index) => (
            <SortableItem key={tab.id} tab={tab} index={index} orders={orders} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
