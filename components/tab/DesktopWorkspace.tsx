import React, { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useValue } from '@legendapp/state/react'
import { Pressable, View } from 'react-native'
import { t } from 'i18next'
import { NouMenu } from '../menu/NouMenu'
import { NouText } from '../NouText'
import { ServiceIcon } from '../service/Services'
import { clsx } from '@/lib/utils'
import { getProfileColor } from '@/lib/profile'
import { AUTO_PROFILE_ID } from '@/lib/site-profile'
import { settings$ } from '@/states/settings'
import { tabGroups$, type TabGroup, type TabGroupLayout } from '@/states/tab-groups'
import { type Tab, getOrderedTabIds, openDesktopTab, sortTabsByOrder, tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { NoraTab } from './NoraTab'

const SLOT_GAP = 8

const getHiddenTabStyle = (width: number | string): CSSProperties => ({
  position: 'absolute',
  left: '-200vw',
  top: 0,
  width,
  height: '100%',
  opacity: 0,
  pointerEvents: 'none',
})

const getTabLabel = (tab?: Pick<Tab, 'title' | 'url'> | null) => tab?.title || tab?.url || t('tabs.new')

const getSlotStyle = (layout: Exclude<TabGroupLayout, 'deck'>, slotIndex: number): CSSProperties => {
  const half = `calc((100% - ${SLOT_GAP}px) / 2)`
  if (layout === 'split-view') {
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

const getLayoutLabel = (layout: TabGroupLayout) => {
  if (layout === 'split-view') return t('views.desktop.layout.split')
  if (layout === 'grid-4') return t('views.desktop.layout.grid')
  return t('views.desktop.layout.deck')
}

const SlotTabPicker: React.FC<{
  currentTabId: string | null
  group: TabGroup
  isActive: boolean
  onActivate: () => void
  orderedTabs: Tab[]
  slotIndex: number
  tabIdSet: Set<string>
}> = ({ currentTabId, group, isActive, onActivate, orderedTabs, slotIndex, tabIdSet }) => {
  const usedTabIds = new Set(group.tabIds.filter((tabId): tabId is string => Boolean(tabId)))
  const currentTab = orderedTabs.find((tab) => tab.id === currentTabId) || null
  const availableTabs = orderedTabs.filter((tab) => tab.id === currentTabId || !usedTabIds.has(tab.id))

  return (
    <NouMenu
      trigger={
        <Pressable
          className={clsx(
            'flex max-w-[15rem] min-w-0 h-7 flex-row items-center gap-2 rounded-full border px-2.5 transition-all overflow-hidden',
            isActive
              ? 'border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-500/10 dark:border-indigo-300/40 dark:bg-indigo-400/20'
              : 'border-zinc-300/80 bg-white/90 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900/65 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80',
          )}
          onPress={onActivate}
        >
          <View
            className={clsx(
              'h-5 w-5 items-center justify-center rounded-full shrink-0',
              isActive ? 'bg-indigo-100 dark:bg-indigo-200/20' : 'bg-zinc-100 dark:bg-zinc-800',
            )}
          >
            <ServiceIcon url={currentTab?.url || ''} icon={currentTab?.icon} />
          </View>
          <NouText
            className={clsx(
              'text-xs font-semibold flex-1 tracking-tight',
              isActive ? 'text-indigo-950 dark:text-indigo-50' : 'text-zinc-700 dark:text-zinc-200',
            )}
            numberOfLines={1}
          >
            {currentTabId && tabIdSet.has(currentTabId) ? getTabLabel(currentTab) : t('tabs.new')}
          </NouText>
          <MaterialIcons name="unfold-more" size={14} color={isActive ? '#4f46e5' : '#71717a'} />
        </Pressable>
      }
      items={[
        ...availableTabs.map((tab) => ({
          label: getTabLabel(tab),
          description: tab.url || t('views.desktop.blankTab'),
          icon: <ServiceIcon url={tab.url} icon={tab.icon} />,
          meta:
            tab.id === currentTabId ? (
              <MaterialIcons name="check" size={16} color={isActive ? '#4f46e5' : '#71717a'} />
            ) : undefined,
          handler: () => {
            onActivate()
            tabGroups$.assignGroupSlot(group.id, slotIndex, tab.id)
            tabs$.setActiveTabById(tab.id, 'user')
          },
        })),
        {
          kind: 'separator' as const,
          label: '',
          handler: () => {},
        },
        {
          label: t('tabs.new'),
          description: t('views.desktop.createBlankTabInSlot'),
          icon: <MaterialIcons name="add" size={16} color="#f97316" />,
          handler: () => {
            onActivate()
            const tabId = openDesktopTab('')
            if (tabId) {
              tabGroups$.assignGroupSlot(group.id, slotIndex, tabId)
              tabs$.setActiveTabById(tabId, 'open')
            }
          },
        },
      ]}
    />
  )
}

const EmptySlot: React.FC<{
  group: TabGroup
  isActive: boolean
  isSplit: boolean
  onActivate: () => void
  orderedTabs: Tab[]
  slotIndex: number
  tabIdSet: Set<string>
}> = React.memo(({ group, isActive, isSplit, onActivate, orderedTabs, slotIndex, tabIdSet }) => {
  const lastSelectedProfileId = useValue(ui$.lastSelectedProfileId)
  const oneProfilePerSite = useValue(settings$.oneProfilePerSite)
  const selectedProfileId = oneProfilePerSite ? AUTO_PROFILE_ID : lastSelectedProfileId
  const profileColor = getProfileColor(selectedProfileId)
  const canCloseSlot = isSplit && slotIndex >= 2 && group.tabIds.length > 2
  const usedTabIds = new Set(group.tabIds.filter((tabId): tabId is string => Boolean(tabId)))
  const availableTabs = orderedTabs.filter((tab) => !usedTabIds.has(tab.id) && tabIdSet.has(tab.id))

  const createTabInSlot = () => {
    onActivate()
    const tabId =
      selectedProfileId === AUTO_PROFILE_ID
        ? openDesktopTab('', { profileMode: 'auto' })
        : openDesktopTab('', { profile: selectedProfileId, profileMode: 'manual' })
    if (tabId) {
      tabGroups$.assignGroupSlot(group.id, slotIndex, tabId)
      tabs$.setActiveTabById(tabId, 'open')
    }
  }

  const assignExistingTab = (tabId: string) => {
    onActivate()
    tabGroups$.assignGroupSlot(group.id, slotIndex, tabId)
    tabs$.setActiveTabById(tabId, 'user')
  }

  return (
    <div
      className={clsx(
        isSplit
          ? 'flex-1 min-w-0 min-h-0 overflow-hidden rounded-xl border transition-all'
          : 'absolute overflow-hidden rounded-xl border transition-all',
        isActive
          ? 'border-indigo-400/60 bg-indigo-50/40 shadow-[0_0_0_2px_rgba(165,180,252,0.4)] dark:border-indigo-400/50 dark:bg-indigo-400/10'
          : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900',
      )}
      style={
        isSplit
          ? { flex: 1, minWidth: 0, order: slotIndex }
          : getSlotStyle(group.layout === 'grid-4' ? 'grid-4' : 'split-view', slotIndex)
      }
      onClick={onActivate}
    >
      <View className="flex h-full min-h-0 min-w-0 flex-col">
        <View
          className={clsx(
            'flex-row items-center justify-between gap-2 pl-2 pr-1 transition-colors border-b',
            isActive
              ? 'bg-indigo-100 border-indigo-200 dark:bg-indigo-400/25 dark:border-indigo-300/40'
              : 'bg-zinc-50 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700/50',
          )}
          style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36 }}
        >
          <ServiceIcon url="" />
          <NouText
            className={clsx(
              'min-w-0 flex-1 px-2 text-center text-[11px] font-bold tracking-wider',
              isActive ? 'text-indigo-950 dark:text-indigo-50' : 'text-zinc-500 dark:text-zinc-400',
            )}
            numberOfLines={1}
          >
            {t('tabs.new')}
          </NouText>
          {canCloseSlot ? (
            <Pressable
              className="h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-zinc-700/60"
              onPress={() => tabGroups$.removeSplitGroupSlot(group.id, slotIndex)}
            >
              <MaterialIcons name="close" size={16} color="#a1a1aa" />
            </Pressable>
          ) : (
            <View className="w-7 shrink-0" />
          )}
        </View>
        <View
          className={clsx(
            'flex-1 min-h-0 overflow-y-auto px-6 py-8 transition-colors',
            isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'bg-white dark:bg-zinc-900',
          )}
        >
          <View className="mx-auto w-full max-w-[28rem] items-center">
            <NouText
              className="mb-6 w-full text-center text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50"
              numberOfLines={2}
            >
              {t('views.desktop.chooseTabToAdd', { layout: getLayoutLabel(group.layout) })}
            </NouText>
            <View className="w-full overflow-hidden rounded-[28px] border border-zinc-200 bg-white/95 shadow-sm shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950/90">
              <Pressable className="flex-row items-center gap-3 px-5 py-4 active:bg-zinc-100 dark:active:bg-zinc-900" onPress={createTabInSlot}>
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <MaterialIcons name="add" size={20} color="#f97316" />
                </View>
                <View className="min-w-0 flex-1">
                  <NouText className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t('tabs.new')}</NouText>
                  <NouText className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t('views.desktop.createBlankTabInSlot')}
                  </NouText>
                </View>
              </Pressable>
              {availableTabs.length ? <View className="mx-5 h-px bg-zinc-200 dark:bg-zinc-800" /> : null}
              {availableTabs.map((tab, index) => (
                <Pressable
                  key={tab.id}
                  className={clsx(
                    'flex-row items-center gap-3 px-5 py-4 active:bg-zinc-100 dark:active:bg-zinc-900',
                    index !== availableTabs.length - 1 && 'border-b border-zinc-200 dark:border-zinc-800',
                  )}
                  onPress={() => assignExistingTab(tab.id)}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                    <ServiceIcon url={tab.url} icon={tab.icon} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <NouText className="text-lg font-semibold text-zinc-900 dark:text-zinc-50" numberOfLines={1}>
                      {getTabLabel(tab)}
                    </NouText>
                    <NouText className="text-sm text-zinc-500 dark:text-zinc-400" numberOfLines={1}>
                      {tab.url || t('views.desktop.blankTab')}
                    </NouText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    </div>
  )
})
EmptySlot.displayName = 'EmptySlot'

const SortableDesktopTab: React.FC<{
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
  hiddenTabWidth: number | string
}> = React.memo(({
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
  hiddenTabWidth,
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
      ...getSlotStyle(viewLayout as Exclude<TabGroupLayout, 'deck'>, slotIndex),
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
})
SortableDesktopTab.displayName = 'SortableDesktopTab'

export const DesktopWorkspace: React.FC = () => {
  const tabs = useValue(tabs$.tabs)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const orders = useValue(tabs$.orders)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)
  const [focusedEmptySlotByGroup, setFocusedEmptySlotByGroup] = useState<Record<string, number>>({})
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
  const deckTabWidth = useValue(settings$.deckTabWidth)

  const hiddenTabWidth = useMemo(() => {
    if (isSingle) return '100%'
    if (isSplit) return `calc((100% - ${SLOT_GAP}px) / 2)`
    return deckTabWidth
  }, [isSingle, isSplit, deckTabWidth])

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
      if (fromSlotIndex === -1 || toSlotIndex === -1) {
        return
      }
      tabGroups$.reorderGroupSlots(activeGroup.id, fromSlotIndex, toSlotIndex)
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

    const nextOrders: Record<string, number> = {}
    const reorderedVisible = arrayMove(visibleTabIds, oldIndex, newIndex)
    const visibleSet = new Set(visibleTabIds)
    const nextTabIds = [...reorderedVisible, ...orderedTabIds.filter((tabId) => !visibleSet.has(tabId))]
    nextTabIds.forEach((tabId, index) => {
      nextOrders[tabId] = index
    })
    tabs$.orders.set(nextOrders)
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

  const focusSlot = (groupId: string, slotIndex: number) => {
    setFocusedEmptySlotByGroup((current) => (current[groupId] === slotIndex ? current : { ...current, [groupId]: slotIndex }))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
              const isActive = activeTabId === tab.id
              const order = isDeck ? visibleTabIds.findIndex((tabId) => tabId === tab.id) : slotIndex ?? index
              return (
                <SortableDesktopTab
                  key={tab.id}
                  index={index}
                  isDeck={isDeck}
                  isSingle={isSingle}
                  isSplit={isSplit}
                  isVisible={isVisible}
                  isActive={isActive}
                  order={order}
                  slotIndex={slotIndex ?? null}
                  tab={tab}
                  viewLayout={viewLayout}
                  hiddenTabWidth={hiddenTabWidth}
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
                    <EmptySlot
                      key={`${activeGroup.id}-${slotIndex}`}
                      group={activeGroup}
                      isActive={slotIndex === activeSlotIndex}
                      isSplit={isSplit}
                      onActivate={() => focusSlot(activeGroup.id, slotIndex)}
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
