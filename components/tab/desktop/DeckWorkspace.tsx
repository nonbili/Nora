import React, { useEffect, useRef, useState } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  rectIntersection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Pressable } from 'react-native'
import { type Tab, openDesktopTab, tabs$ } from '@/states/tabs'
import { DeckTab } from './DeckTab'

export const DeckWorkspace: React.FC<{
  orderedTabIds: string[]
  orders: Record<string, number>
  tabs: Tab[]
}> = ({ orderedTabIds, orders, tabs }) => {
  const deckScrollRef = useRef<HTMLDivElement>(null)
  const prevTabCountRef = useRef(tabs.length)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (tabs.length > prevTabCountRef.current && deckScrollRef.current) {
      requestAnimationFrame(() => {
        deckScrollRef.current?.scrollTo({ left: deckScrollRef.current.scrollWidth, behavior: 'smooth' })
      })
    }
    prevTabCountRef.current = tabs.length
  }, [tabs.length])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1,
      },
    }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = orderedTabIds.findIndex((tabId) => tabId === active.id)
    const newIndex = orderedTabIds.findIndex((tabId) => tabId === over.id)
    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    const nextOrders: Record<string, number> = {}
    arrayMove(orderedTabIds, oldIndex, newIndex).forEach((tabId, index) => {
      nextOrders[tabId] = index
    })
    tabs$.orders.set(nextOrders)
  }

  const createDeckTab = () => {
    const tabId = openDesktopTab('')
    if (tabId) {
      tabs$.setActiveTabById(tabId, 'open')
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={orderedTabIds} strategy={horizontalListSortingStrategy}>
        <div ref={deckScrollRef} className="flex-1 flex gap-2 overflow-x-auto overflow-y-hidden p-2">
          {(() => {
            const seen = new Set<string>()
            return tabs.map((tab, index) => {
              if (!tab?.id || seen.has(tab.id)) return null
              seen.add(tab.id)
              return <DeckTab key={tab.id} tab={tab} index={index} orders={orders} />
            })
          })()}

          <div key="deck-add-tab" style={{ order: 9999 }}>
            <Pressable
              className="flex h-full w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950/40 hover:bg-zinc-200 dark:hover:bg-zinc-900/70"
              onPress={createDeckTab}
            >
              <MaterialIcons name="add" size={22} color="#a1a1aa" />
            </Pressable>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  )
}
