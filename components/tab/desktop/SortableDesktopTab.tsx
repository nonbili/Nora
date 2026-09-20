import React, { type CSSProperties, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clsx } from '@/lib/utils'
import { claimsHostDrop, readDraggedUrl } from '@/lib/drag-url'
import { type TabGroupLayout } from '@/states/tab-groups'
import { type Tab, tabs$ } from '@/states/tabs'
import { NoraTab } from '@/components/tab/NoraTab'
import { getHiddenTabStyle, getSlotStyle } from './desktopWorkspaceShared'

export const SortableDesktopTab: React.FC<{
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
  onDropUrl?: (tabId: string, url: string) => void
}> = React.memo(
  ({
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
    onDropUrl,
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
      style = getHiddenTabStyle()
    }

    const isDraggable = isVisible && (isDeck || isSplit || isGrid)

    // The page fills most of the tab and forwards its own drops, so what reaches here is
    // a drop on the tab chrome around it -- the header and the border. It still means
    // "open this URL in this tab", and must not fall through to the workspace, which
    // would open a new tab instead.
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (!isVisible || !onDropUrl || !claimsHostDrop(e.dataTransfer)) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      if (!isVisible || !onDropUrl) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const url = readDraggedUrl(e.dataTransfer)
      if (url) {
        onDropUrl(tab.id, url)
      }
    }

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
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        {...(isDraggable ? attributes : {})}
        {...(isDraggable ? listeners : {})}
      >
        <NoraTab
          tab={tab}
          index={index}
          isActive={isActive}
          desktopVariant={!isVisible || isSingle ? 'single' : isDeck ? 'deck' : 'saved-view'}
          slotSwitcher={slotSwitcher}
        />
      </div>
    )
  },
)

SortableDesktopTab.displayName = 'SortableDesktopTab'
