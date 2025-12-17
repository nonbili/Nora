import React, { memo, useEffect, useState } from 'react'
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

const SortableItem: React.FC<{ tab: Tab; index: number; order: number }> = memo(
  ({ tab, index, order }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      /* order, */
    }

    return (
      <div className="flex" ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <NoraTab tab={tab} index={index} />
      </div>
    )

    return (
      <div className="p-4 border border-gray-100 h-20" ref={setNodeRef} style={style} {...attributes} {...listeners}>
        abc {tab.id}
      </div>
    )
  },
  (props1, props2) => props1.tab.id == props2.tab.id,
)

export const NoraTabContainer: React.FC<{ tabs: Tab[] }> = ({ tabs }) => {
  const [orders, setOrders] = useState<Record<string, number>>({})

  useEffect(() => {
    /* let _orders = orders */
    const stateTabIds = tabs.map((x) => x.id)
    const tabIds = sortBy(Object.entries(orders), [(x) => x[1]]).map((x) => x[0])
    console.log('- tabIds', tabIds, orders)
    for (const tab of tabs) {
      if (!(tab.id in orders)) {
        tabIds.push(tab.id)
      }
    }
    const newOrders: Record<string, number> = {}
    /* _orders = {} */
    let i = 0
    for (const id of tabIds) {
      if (!stateTabIds.includes(id)) {
        continue
      }
      newOrders[id] = i++
    }
    console.log('- newOrders', tabIds, newOrders)
    setOrders(newOrders)
  }, [tabs.length])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      /* https://github.com/clauderic/dnd-kit/issues/591#issuecomment-1017050816 */
      activationConstraint: {
        distance: 1,
      },
    }),
    /* useSensor(KeyboardSensor, {
     *   coordinateGetter: sortableKeyboardCoordinates,
     * }), */
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      /* const entries = sortBy(Object.entries(orders), [(x) => x[1]])
       * const oldIndex = entries.findIndex((x) => x[0] == active.id)
       * const newIndex = entries.findIndex((x) => x[0] == over.id)
       * const newEntries = arrayMove(entries, oldIndex, newIndex)
       * const newOrders: Record<string, number> = {}
       * let i = 0
       * for (const [id] of newEntries) {
       *   newOrders[id] = i++
       * }
       * setOrders(newOrders) */

      const oldIndex = tabs.findIndex((x) => x.id == active.id)
      const newIndex = tabs.findIndex((x) => x.id == over.id)
      tabs$.tabs.set(arrayMove(tabs, oldIndex, newIndex))
      /* console.log('- entries', entries, newEntries, oldIndex, newIndex)
       * setOrders(Object.fromEntries(newEntries)) */

      /* const oldOrder = orders[active.id]
       * const newOrder = orders[over.id]
       * const newOrders = {
       *   ...orders,
       *   [active.id]: newOrder,
       *   [over.id]: oldOrder,
       * }
       * setOrders(newOrders) */

      /* return arrayMove(items, oldIndex, newIndex) */
      /* }) */
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
        <div className="flex-1 flex gap-2 p-2 overflow-x-auto overflow-y-hidden">
          {tabs.map((tab, index) => (
            <SortableItem key={tab.id} tab={tab} index={index} order={orders[tab.id]} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
