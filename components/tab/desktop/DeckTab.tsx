import React, { memo, type CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clsx } from '@/lib/utils'
import { NoraTab } from '@/components/tab/NoraTab'
import { type Tab, tabs$ } from '@/states/tabs'

export const DeckTab: React.FC<{
  tab: Tab
  index: number
  orders: Record<string, number>
}> = memo(({ tab, index, orders }) => {
  const { attributes, listeners, setNodeRef, transform, transition, active } = useSortable({
    id: tab.id,
  })

  const style: CSSProperties = {
    order: orders[tab.id] ?? index,
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isDragging = active?.id === tab.id

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex h-full cursor-grab active:cursor-grabbing transition-opacity',
        isDragging && 'opacity-30 z-10',
      )}
      style={style}
      onMouseDown={() => tabs$.setActiveTabById(tab.id, 'user')}
      {...attributes}
      {...listeners}
    >
      <NoraTab tab={tab} index={index} desktopVariant="deck" />
    </div>
  )
})
DeckTab.displayName = 'DeckTab'
