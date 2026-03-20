import React, { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useValue } from '@legendapp/state/react'
import { clsx } from '@/lib/utils'
import { NoraTab } from './NoraTab'
import { Tab, getOrderedTabIds, openDesktopTab, sortTabsByOrder, tabs$ } from '@/states/tabs'
import { CustomSavedView, DECK_VIEW_ID, savedViews$ } from '@/states/saved-views'
import { NouMenu } from '../menu/NouMenu'
import { NouText } from '../NouText'
import { t } from 'i18next'
import { Pressable, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { ServiceIcon } from '../service/Services'
import { NavModalContent } from '../modal/NavModal'
import { getProfileColor } from '@/lib/profile'
import { ui$ } from '@/states/ui'

const SLOT_GAP = 8
const hiddenTabStyle: CSSProperties = {
  position: 'absolute',
  left: '-200vw',
  top: 0,
  width: '25rem',
  height: '100%',
  opacity: 0,
  pointerEvents: 'none',
}

const getTabLabel = (tab?: Pick<Tab, 'title' | 'url'> | null) => tab?.title || tab?.url || t('tabs.new')

const getSlotStyle = (layout: CustomSavedView['layout'], slotIndex: number): CSSProperties => {
  const half = `calc((100% - ${SLOT_GAP}px) / 2)`
  if (layout === 'two-col') {
    return {
      position: 'absolute',
      top: 0,
      left: slotIndex === 0 ? 0 : `calc(${half} + ${SLOT_GAP}px)`,
      width: half,
      height: '100%',
    }
  }

  const row = Math.floor(slotIndex / 2)
  const column = slotIndex % 2
  return {
    position: 'absolute',
    top: row === 0 ? 0 : `calc(${half} + ${SLOT_GAP}px)`,
    left: column === 0 ? 0 : `calc(${half} + ${SLOT_GAP}px)`,
    width: half,
    height: half,
  }
}

const SlotTabPicker: React.FC<{
  currentTabId: string | null
  orderedTabs: Tab[]
  slotIndex: number
  tabIdSet: Set<string>
  view: CustomSavedView
}> = ({ currentTabId, orderedTabs, slotIndex, tabIdSet, view }) => {
  const usedTabIds = new Set(view.slotTabIds.filter((tabId): tabId is string => Boolean(tabId)))
  const currentTab = orderedTabs.find((tab) => tab.id === currentTabId) || null
  const availableTabs = orderedTabs.filter((tab) => tab.id === currentTabId || !usedTabIds.has(tab.id))

  const items = [
    ...availableTabs.map((tab) => ({
      label: getTabLabel(tab),
      handler: () => {
        savedViews$.assignSlotTab(view.id, slotIndex, tab.id)
        tabs$.setActiveTabById(tab.id)
      },
    })),
  ]

  return (
    <NouMenu
      trigger={
        <div className="flex max-w-[14rem] min-w-0 h-[22px] flex-row items-center justify-center px-3 gap-1 bg-zinc-950/40 hover:bg-zinc-900/60 border border-zinc-700/30 rounded-full transition-all group cursor-pointer overflow-hidden">
          <NouText
            className="text-xs font-bold text-zinc-500 group-hover:text-zinc-300 flex-1 text-center uppercase tracking-tight"
            numberOfLines={1}
          >
            {currentTabId && tabIdSet.has(currentTabId) ? getTabLabel(currentTab) : t('tabs.new')}
          </NouText>
          <MaterialIcons name="expand-more" size={14} color="#52525b" className="opacity-50 shrink-0" />
        </div>
      }
      items={items}
    />
  )
}

const EmptySlot: React.FC<{
  slotIndex: number
  slotSwitcher?: ReactNode
  view: CustomSavedView
  isSplit?: boolean
}> = ({ slotIndex, slotSwitcher, view, isSplit }) => {
  const lastSelectedProfileId = useValue(ui$.lastSelectedProfileId)
  const [selectedProfileId, setSelectedProfileId] = useState(lastSelectedProfileId)
  const profileColor = getProfileColor(selectedProfileId)
  const canCloseSlot = isSplit && slotIndex >= 2 && view.slotTabIds.length > 2

  const createTabInSlot = (url: string, profileId: string) => {
    const tabId = openDesktopTab(url, profileId)
    if (tabId) {
      savedViews$.assignSlotTab(view.id, slotIndex, tabId)
      tabs$.setActiveTabById(tabId)
    }
  }

  return (
    <div
      className={clsx(
        isSplit
          ? 'flex-1 min-w-0 h-full overflow-hidden'
          : 'absolute overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950',
      )}
      style={!isSplit ? getSlotStyle(view.layout, slotIndex) : { flex: 1, minWidth: 0, order: slotIndex }}
    >
      <View className="flex h-full min-h-0 min-w-0 flex-col">
        <View
          className="flex-row items-center justify-between gap-2 bg-zinc-800 pl-2 pr-1"
          style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36 }}
        >
          <View className="flex-row items-center gap-2 shrink-0">
            <ServiceIcon url="" />
          </View>
          <View className="flex-1 min-w-0 flex-row items-center justify-center">
            {slotSwitcher || (
              <NouText className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-center px-2">
                {t('tabs.new')}
              </NouText>
            )}
          </View>
          {canCloseSlot ? (
            <Pressable
              className="h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-zinc-700/60"
              onPress={() => savedViews$.removeSplitViewSlot(view.id, slotIndex)}
            >
              <MaterialIcons name="close" size={16} color="#a1a1aa" />
            </Pressable>
          ) : (
            <View className="w-7 shrink-0" />
          )}
        </View>
        <NavModalContent
          profileId={selectedProfileId}
          onOpenUrl={createTabInSlot}
          onSelectProfile={setSelectedProfileId}
          showOpenUrl={false}
        />
      </View>
    </div>
  )
}

const SortableDesktopTab: React.FC<{
  isDeck: boolean
  isVisible: boolean
  orders: Record<string, number>
  slotIndex: number | null
  slotSwitcher?: ReactNode
  tab: Tab
  index: number
  viewLayout?: CustomSavedView['layout']
  isSplit?: boolean
}> = ({ isDeck, isVisible, orders, slotIndex, slotSwitcher, tab, index, viewLayout, isSplit }) => {
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const { attributes, listeners, setNodeRef, transform, transition, over, isOver, active } = useSortable({
    id: tab.id,
  })

  let style: CSSProperties
  if (isDeck) {
    style = {
      order: orders[tab.id] ?? index,
      transform: CSS.Transform.toString(transform),
      transition,
    }
  } else if (isSplit && isVisible) {
    style = { flex: 1, minWidth: 0, order: slotIndex ?? 0 }
  } else if (viewLayout && slotIndex != null) {
    style = getSlotStyle(viewLayout, slotIndex)
  } else {
    style = hiddenTabStyle
  }

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        isDeck
          ? 'flex h-full transition-all'
          : isSplit && isVisible
            ? 'flex-1 min-w-0 h-full overflow-hidden'
            : viewLayout && slotIndex != null
              ? 'absolute overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950'
              : 'absolute overflow-hidden',
        isDeck && over && 'pointer-events-none',
        isDeck && active?.id === tab.id && 'rotate-[1deg] translate-y-[-16px]',
        isDeck &&
          isOver &&
          active &&
          over &&
          (orders[active.id as string] < orders[over.id as string]
            ? 'border-r-2 border-r-sky-500 pr-2'
            : 'border-l-2 border-l-sky-500 pl-2'),
      )}
      style={style}
      onMouseDown={() => tabs$.activeTabIndex.set(index)}
      {...(isDeck ? attributes : {})}
      {...(isDeck ? listeners : {})}
    >
      <NoraTab tab={tab} index={index} desktopVariant={isDeck ? 'deck' : 'saved-view'} slotSwitcher={slotSwitcher} />
    </div>
  )
}

export const DesktopWorkspace: React.FC = () => {
  const { tabs, activeTabIndex, orders } = useValue(tabs$)
  const { activeViewId, savedViews } = useValue(savedViews$)
  const activeView = savedViews.find((view) => view.id === activeViewId)
  const isDeck = !activeView || activeViewId === DECK_VIEW_ID
  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabIds = getOrderedTabIds(tabs, orders)
  const orderedTabs = sortTabsByOrder(tabs, orders)
  const tabIdSet = new Set(tabs.map((tab) => tab.id))
  const visibleSlots = activeView?.slotTabIds ?? []
  const visibleTabIds = visibleSlots.filter((tabId): tabId is string => typeof tabId === 'string' && tabIdSet.has(tabId))

  useEffect(() => {
    const nextOrders: Record<string, number> = {}
    orderedTabIds.forEach((tabId, order) => {
      nextOrders[tabId] = order
    })

    const hasSameSize = Object.keys(nextOrders).length === Object.keys(orders).length
    const hasSameOrder = hasSameSize && orderedTabIds.every((tabId, index) => orders[tabId] === index)
    if (!hasSameOrder) {
      tabs$.orders.set(nextOrders)
    }
  }, [orderedTabIds.join('|'), orders, tabIdsKey])

  useEffect(() => {
    if (isDeck || !tabs.length) {
      return
    }

    const activeTabId = tabs[activeTabIndex]?.id
    if (activeTabId && visibleTabIds.includes(activeTabId)) {
      return
    }

    const fallbackTabId = visibleTabIds.find((tabId) => tabIdSet.has(tabId))
    if (fallbackTabId) {
      tabs$.setActiveTabById(fallbackTabId)
    }
  }, [activeTabIndex, activeViewId, isDeck, savedViews, tabIdsKey, visibleTabIds.join('|')])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1,
      },
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isDeck) {
      return
    }

    const { active, over } = event
    if (over && active.id !== over.id) {
      const entries = orderedTabIds.map((tabId) => [tabId, orders[tabId] ?? 0] as const)
      const oldIndex = entries.findIndex(([tabId]) => tabId === active.id)
      const newIndex = entries.findIndex(([tabId]) => tabId === over.id)
      const newEntries = arrayMove(entries, oldIndex, newIndex)
      const nextOrders: Record<string, number> = {}
      newEntries.forEach(([tabId], index) => {
        nextOrders[tabId] = index
      })
      tabs$.orders.set(nextOrders)
    }
  }

  const slotIndexByTabId = new Map<string, number>()
  if (activeView) {
    activeView.slotTabIds.forEach((tabId, slotIndex) => {
      if (tabId && tabIdSet.has(tabId)) {
        slotIndexByTabId.set(tabId, slotIndex)
      }
    })
  }

  const isSplit = activeView?.layout === 'two-col'
  const createDeckTab = () => {
    const tabId = openDesktopTab('')
    if (tabId) {
      tabs$.setActiveTabById(tabId)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
        <div className="relative flex-1 flex flex-col overflow-hidden">
          <div
            className={clsx(
              isDeck
                ? 'flex-1 flex gap-2 overflow-x-auto overflow-y-hidden p-2'
                : isSplit
                  ? 'flex-1 min-w-0 flex flex-row gap-2 p-2'
                  : 'relative flex-1 overflow-hidden p-2',
            )}
          >
            {tabs.map((tab, index) => {
              const slotIndex = slotIndexByTabId.get(tab.id)
              const isVisible = isDeck || slotIndex != null

              return (
                <SortableDesktopTab
                  key={tab.id}
                  isDeck={isDeck}
                  isSplit={isSplit}
                  isVisible={isVisible}
                  orders={orders}
                  slotIndex={slotIndex ?? null}
                  slotSwitcher={
                    !isDeck && activeView && slotIndex != null ? (
                      <SlotTabPicker
                        currentTabId={tab.id}
                        orderedTabs={orderedTabs}
                        slotIndex={slotIndex}
                        tabIdSet={tabIdSet}
                        view={activeView}
                      />
                    ) : undefined
                  }
                  tab={tab}
                  index={index}
                  viewLayout={activeView?.layout}
                />
              )
            })}

            {isDeck ? (
              <div style={{ order: tabs.length + 1 }}>
                <Pressable
                  className="flex h-full w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/70"
                  onPress={createDeckTab}
                >
                  <MaterialIcons name="add" size={22} color="#a1a1aa" />
                </Pressable>
              </div>
            ) : null}

            {activeView
              ? activeView.slotTabIds.map((tabId, slotIndex) =>
                  tabId && tabIdSet.has(tabId) ? null : (
                    <EmptySlot
                      key={`${activeView.id}-${slotIndex}`}
                      slotIndex={slotIndex}
                      slotSwitcher={
                        <SlotTabPicker
                          currentTabId={null}
                          orderedTabs={orderedTabs}
                          slotIndex={slotIndex}
                          tabIdSet={tabIdSet}
                          view={activeView}
                        />
                      }
                      view={activeView}
                      isSplit={isSplit}
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
