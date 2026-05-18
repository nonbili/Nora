import React, { memo, type CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clsx } from '@/lib/utils'
import { NoraTab } from '@/components/tab/NoraTab'
import { settings$ } from '@/states/settings'
import { type CustomSavedView } from '@/states/saved-views'
import { type Tab, tabs$ } from '@/states/tabs'
import { getHiddenTabStyle, getSlotStyle } from './desktopWorkspaceShared'
import { SlotTabPicker } from './SlotTabPicker'

export const SavedViewTab: React.FC<{
  activeSlotIndex: number | null
  activeView: CustomSavedView
  index: number
  isSplit: boolean
  isVisible: boolean
  orderedTabs: Tab[]
  slotIndex: number | null
  focusSlot: (viewId: string, slotIndex: number) => void
  tabIdSet: Set<string>
  tab: Tab
  viewLayout: CustomSavedView['layout']
}> = memo(({ activeSlotIndex, activeView, index, isSplit, isVisible, orderedTabs, slotIndex, focusSlot, tabIdSet, tab, viewLayout }) => {
  const { attributes, listeners, setNodeRef, transform, transition, active } = useSortable({ id: tab.id })
  const sortableTransform = CSS.Transform.toString(transform)
  const isGrid = isVisible && viewLayout === 'grid-4' && slotIndex != null

  let style: CSSProperties
  if (isSplit && isVisible) {
    style = {
      flex: 1,
      minWidth: 0,
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
  } else if (slotIndex != null) {
    style = getSlotStyle(viewLayout, slotIndex)
  } else {
    style = getHiddenTabStyle(settings$.deckTabWidth.get())
  }

  const isDraggable = isVisible && (isSplit || isGrid)

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        isSplit && isVisible
          ? 'flex-1 min-w-0 h-full overflow-hidden'
          : slotIndex != null
            ? 'absolute overflow-hidden border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950'
            : 'absolute overflow-hidden',
        active?.id === tab.id && 'opacity-30 z-10',
      )}
      style={style}
      onMouseDown={() => tabs$.setActiveTabIndex(index, 'user')}
      {...(isDraggable ? attributes : {})}
      {...(isDraggable ? listeners : {})}
    >
      <NoraTab
        tab={tab}
        index={index}
        desktopVariant="saved-view"
        slotSwitcher={
          slotIndex == null ? undefined : (
            <SlotTabPicker
              currentTabId={tab.id}
              isActive={slotIndex === activeSlotIndex}
              onActivate={() => focusSlot(activeView.id, slotIndex)}
              orderedTabs={orderedTabs}
              slotIndex={slotIndex}
              tabIdSet={tabIdSet}
              view={activeView}
            />
          )
        }
      />
    </div>
  )
})
