import React, { type CSSProperties, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clsx } from '@/lib/utils'
import { type TabGroupLayout } from '@/states/tab-groups'
import { type Tab, tabs$ } from '@/states/tabs'
import { NoraTab } from '@/components/tab/NoraTab'
import { getHiddenTabStyle, getSlotStyle } from './desktopWorkspaceShared'

export const SortableDesktopTab: React.FC<{
  hiddenTabWidth: number | string
  index: number
  isActive: boolean
  isDeck: boolean
  isSingle: boolean
  isSplit: boolean
  isVisible: boolean
  order: number
  slotIndex: number | null
  slotSwitcher?: ReactNode
  tab: Tab
  viewLayout: TabGroupLayout
}> = React.memo(
  ({
    hiddenTabWidth,
    index,
    isActive,
    isDeck,
    isSingle,
    isSplit,
    isVisible,
    order,
    slotIndex,
    slotSwitcher,
    tab,
    viewLayout,
  }) => {
    const { attributes, listeners, setNodeRef, transform, transition, active } = useSortable({ id: tab.id })

    const isGrid = isVisible && viewLayout === 'grid-4' && slotIndex != null
    const sortableTransform = CSS.Transform.toString(transform)
    let style: CSSProperties
    if (isDeck && isVisible) {
      style = {
        order,
        transform: sortableTransform,
        transition,
      }
    } else if (isSingle && isVisible) {
      style = { position: 'absolute', inset: 0 }
    } else if (isSplit && isVisible) {
      style = {
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        order: slotIndex ?? 0,
        transform: sortableTransform,
        transition,
      }
    } else if (isGrid) {
      style = {
        ...getSlotStyle(viewLayout, slotIndex),
        transform: sortableTransform,
        transition,
      }
    } else if (isVisible && viewLayout !== 'deck' && slotIndex != null) {
      style = getSlotStyle(viewLayout, slotIndex)
    } else {
      style = getHiddenTabStyle(hiddenTabWidth)
    }

    const isDraggable = isVisible && (isDeck || isSplit || isGrid)

    return (
      <div
        ref={setNodeRef}
        className={clsx(
          isDeck && isVisible
            ? 'flex min-h-0 cursor-grab active:cursor-grabbing transition-opacity rounded-xl'
            : isSingle && isVisible
              ? 'overflow-hidden rounded-xl'
              : isSplit && isVisible
                ? 'flex-1 min-w-0 min-h-0 overflow-hidden rounded-xl'
                : isVisible && viewLayout !== 'deck'
                  ? 'absolute overflow-hidden border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl'
                  : 'absolute overflow-hidden',
          active?.id === tab.id && 'opacity-30 z-10',
        )}
        style={style}
        onMouseDown={() => tabs$.setActiveTabById(tab.id, 'user')}
        {...(isDraggable ? attributes : {})}
        {...(isDraggable ? listeners : {})}
      >
        <NoraTab
          tab={tab}
          index={index}
          isActive={isActive}
          desktopVariant={isSingle ? 'single' : isDeck ? 'deck' : 'saved-view'}
          slotSwitcher={slotSwitcher}
        />
      </div>
    )
  },
)

SortableDesktopTab.displayName = 'SortableDesktopTab'
