import React, { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useValue } from '@legendapp/state/react'
import { clsx } from '@/lib/utils'
import { NoraTab } from './NoraTab'
import { Tab, getOrderedTabIds, openDesktopTab, sortTabsByOrder, tabs$ } from '@/states/tabs'
import { settings$ } from '@/states/settings'
import { CustomSavedView, DECK_VIEW_ID, savedViews$ } from '@/states/saved-views'
import { NouMenu } from '../menu/NouMenu'
import { NouText } from '../NouText'
import { t } from 'i18next'
import { Pressable, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { ServiceIcon } from '../service/Services'
import { getProfileColor } from '@/lib/profile'
import { ui$ } from '@/states/ui'
import { AUTO_PROFILE_ID } from '@/lib/site-profile'

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

const getSlotStyle = (layout: CustomSavedView['layout'], slotIndex: number): CSSProperties => {
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

const SlotTabPicker: React.FC<{
  currentTabId: string | null
  isActive: boolean
  onActivate: () => void
  orderedTabs: Tab[]
  slotIndex: number
  tabIdSet: Set<string>
  view: CustomSavedView
}> = ({ currentTabId, isActive, onActivate, orderedTabs, slotIndex, tabIdSet, view }) => {
  const usedTabIds = new Set(view.slotTabIds.filter((tabId): tabId is string => Boolean(tabId)))
  const currentTab = orderedTabs.find((tab) => tab.id === currentTabId) || null
  const availableTabs = orderedTabs.filter((tab) => tab.id === currentTabId || !usedTabIds.has(tab.id))

  const items = [
    ...availableTabs.map((tab) => ({
      label: getTabLabel(tab),
      description: tab.url || t('views.desktop.blankTab'),
      icon: <ServiceIcon url={tab.url} icon={tab.icon} />,
      meta:
        tab.id === currentTabId ? <MaterialIcons name="check" size={16} color={isActive ? '#4f46e5' : '#71717a'} /> : undefined,
      handler: () => {
        onActivate()
        savedViews$.assignSlotTab(view.id, slotIndex, tab.id)
        tabs$.setActiveTabById(tab.id, 'user')
      },
    })),
  ]

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
          <MaterialIcons
            name="unfold-more"
            size={14}
            color={isActive ? '#4f46e5' : '#71717a'}
            className="shrink-0 opacity-80"
          />
        </Pressable>
      }
      items={[
        ...items,
        {
          kind: 'separator',
          label: '',
          handler: () => {},
        },
        {
          label: t('views.desktop.newBlankTab'),
          description: t('views.desktop.createBlankTabInSlot'),
          icon: <MaterialIcons name="add" size={16} color="#f97316" />,
          handler: () => {
            onActivate()
            const tabId = openDesktopTab('')
            if (tabId) {
              savedViews$.assignSlotTab(view.id, slotIndex, tabId)
              tabs$.setActiveTabById(tabId, 'open')
            }
          },
        },
      ]}
    />
  )
}

const EmptySlot: React.FC<{
  isActive: boolean
  onActivate: () => void
  slotIndex: number
  orderedTabs: Tab[]
  tabIdSet: Set<string>
  view: CustomSavedView
  isSplit?: boolean
}> = ({ isActive, onActivate, slotIndex, orderedTabs, tabIdSet, view, isSplit }) => {
  const lastSelectedProfileId = useValue(ui$.lastSelectedProfileId)
  const oneProfilePerSite = useValue(settings$.oneProfilePerSite)
  const selectedProfileId = oneProfilePerSite ? AUTO_PROFILE_ID : lastSelectedProfileId
  const profileColor = getProfileColor(selectedProfileId)
  const canCloseSlot = isSplit && slotIndex >= 2 && view.slotTabIds.length > 2
  const usedTabIds = new Set(view.slotTabIds.filter((tabId): tabId is string => Boolean(tabId)))
  const availableTabs = orderedTabs.filter((tab) => !usedTabIds.has(tab.id) && tabIdSet.has(tab.id))
  const targetLayoutLabel =
    view.layout === 'split-view' ? t('views.desktop.layout.split') : t('views.desktop.layout.grid')

  const createTabInSlot = (url: string, profileId: string) => {
    onActivate()
    const tabId =
      profileId === AUTO_PROFILE_ID
        ? openDesktopTab(url, { profileMode: 'auto' })
        : openDesktopTab(url, { profile: profileId, profileMode: 'manual' })
    if (tabId) {
      savedViews$.assignSlotTab(view.id, slotIndex, tabId)
      tabs$.setActiveTabById(tabId, 'open')
    }
  }

  const assignExistingTab = (tabId: string) => {
    onActivate()
    savedViews$.assignSlotTab(view.id, slotIndex, tabId)
    tabs$.setActiveTabById(tabId, 'user')
  }

  return (
    <div
      className={clsx(
        isSplit
          ? clsx(
              'flex-1 min-w-0 h-full overflow-hidden border transition-all',
              isActive
                ? 'border-indigo-300 bg-indigo-50/40 shadow-[0_0_0_1px_rgba(165,180,252,0.9)] dark:border-indigo-300/40 dark:bg-indigo-400/10'
                : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950',
            )
          : clsx(
              'absolute overflow-hidden border transition-all',
              isActive
                ? 'border-indigo-300 bg-indigo-50/40 shadow-[0_0_0_1px_rgba(165,180,252,0.9)] dark:border-indigo-300/40 dark:bg-indigo-400/10'
                : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950',
            ),
      )}
      style={!isSplit ? getSlotStyle(view.layout, slotIndex) : { flex: 1, minWidth: 0, order: slotIndex }}
      onClick={onActivate}
    >
      <View className="flex h-full min-h-0 min-w-0 flex-col">
        <View
          className={clsx(
            'flex-row items-center justify-between gap-2 pl-2 pr-1 transition-colors',
            isActive ? 'bg-indigo-100 dark:bg-indigo-400/25' : 'bg-zinc-100 dark:bg-zinc-800',
          )}
          style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36 }}
        >
          <View className="flex-row items-center gap-2 shrink-0">
            <ServiceIcon url="" />
          </View>
          <View className="flex-1 min-w-0 flex-row items-center justify-center">
            <NouText
              className={clsx(
                'text-[11px] font-bold tracking-wider text-center px-2',
                isActive ? 'text-indigo-950 dark:text-indigo-50' : 'text-zinc-500 dark:text-zinc-400',
              )}
            >
              {t('tabs.new')}
            </NouText>
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
        <View
          className={clsx(
            'flex-1 min-h-0 overflow-y-auto px-6 py-8 transition-colors',
            isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'bg-zinc-50 dark:bg-zinc-900',
          )}
        >
          <View className="mx-auto w-full max-w-[28rem] items-center">
            <NouText
              className="mb-6 w-full text-center text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50"
              numberOfLines={2}
            >
              {t('views.desktop.chooseTabToAdd', { layout: targetLayoutLabel })}
            </NouText>
            <View className="w-full overflow-hidden rounded-[28px] border border-zinc-200 bg-white/95 shadow-sm shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950/90">
              <Pressable
                className="flex-row items-center gap-3 px-5 py-4 active:bg-zinc-100 dark:active:bg-zinc-900"
                onPress={() => createTabInSlot('', selectedProfileId)}
              >
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <MaterialIcons name="add" size={20} color="#f97316" />
                </View>
                <View className="min-w-0 flex-1">
                  <NouText className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {t('tabs.new')}
                  </NouText>
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
    style = getHiddenTabStyle(settings$.deckTabWidth.get())
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
              ? 'absolute overflow-hidden border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950'
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
      onMouseDown={() => tabs$.setActiveTabIndex(index, 'user')}
      {...(isDeck ? attributes : {})}
      {...(isDeck ? listeners : {})}
    >
      <NoraTab tab={tab} index={index} desktopVariant={isDeck ? 'deck' : 'saved-view'} slotSwitcher={slotSwitcher} />
    </div>
  )
}

export const DesktopWorkspace: React.FC = () => {
  const tabs = useValue(tabs$.tabs)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const orders = useValue(tabs$.orders)
  const activeViewId = useValue(savedViews$.activeViewId)
  const savedViews = useValue(savedViews$.savedViews)
  const [focusedEmptySlotByView, setFocusedEmptySlotByView] = useState<Record<string, number>>({})
  const deckScrollRef = useRef<HTMLDivElement>(null)
  const prevTabCountRef = useRef(tabs.length)
  const activeView = savedViews.find((view) => view.id === activeViewId)
  const isDeck = !activeView || activeViewId === DECK_VIEW_ID
  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabIds = useMemo(() => getOrderedTabIds(tabs, orders), [tabIdsKey, orders])
  const orderedTabs = useMemo(() => sortTabsByOrder(tabs, orders), [tabIdsKey, orders])
  const tabIdSet = useMemo(() => new Set(tabs.map((tab) => tab.id)), [tabIdsKey])
  const visibleSlots = activeView?.slotTabIds ?? []
  const visibleTabIds = visibleSlots.filter((tabId): tabId is string => typeof tabId === 'string' && tabIdSet.has(tabId))
  const activeTabId = tabs[activeTabIndex]?.id

  const ordersRef = useRef(orders)
  ordersRef.current = orders
  useEffect(() => {
    const currentOrders = ordersRef.current
    const currentTabIds = getOrderedTabIds(tabs$.tabs.get(), currentOrders)
    const nextOrders: Record<string, number> = {}
    currentTabIds.forEach((tabId, order) => {
      nextOrders[tabId] = order
    })

    const hasSameSize = Object.keys(nextOrders).length === Object.keys(currentOrders).length
    const hasSameOrder = hasSameSize && currentTabIds.every((tabId, index) => currentOrders[tabId] === index)
    if (!hasSameOrder) {
      tabs$.orders.set(nextOrders)
    }
  }, [tabIdsKey])

  useEffect(() => {
    if (isDeck && tabs.length > prevTabCountRef.current && deckScrollRef.current) {
      requestAnimationFrame(() => {
        deckScrollRef.current?.scrollTo({ left: deckScrollRef.current.scrollWidth, behavior: 'smooth' })
      })
    }
    prevTabCountRef.current = tabs.length
  }, [isDeck, tabs.length])

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
      tabs$.setActiveTabById(fallbackTabId, 'system')
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

  const fallbackEmptySlotIndex =
    activeView?.slotTabIds.findIndex((tabId) => !tabId || !tabIdSet.has(tabId)) ?? -1
  const activeSlotIndex =
    !activeView || isDeck
      ? null
      : activeTabId && slotIndexByTabId.has(activeTabId)
        ? slotIndexByTabId.get(activeTabId) ?? null
        : focusedEmptySlotByView[activeView.id] ?? (fallbackEmptySlotIndex >= 0 ? fallbackEmptySlotIndex : null)

  const isSplit = activeView?.layout === 'split-view'
  const createDeckTab = () => {
    const tabId = openDesktopTab('')
    if (tabId) {
      tabs$.setActiveTabById(tabId, 'open')
    }
  }

  const focusSlot = (viewId: string, slotIndex: number) => {
    setFocusedEmptySlotByView((current) => {
      if (current[viewId] === slotIndex) {
        return current
      }
      return {
        ...current,
        [viewId]: slotIndex,
      }
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedTabIds} strategy={horizontalListSortingStrategy}>
        <div className="relative flex-1 flex flex-col overflow-hidden">
          <div
            ref={isDeck ? deckScrollRef : undefined}
            className={clsx(
              isDeck
                ? 'flex-1 flex gap-2 overflow-x-auto overflow-y-hidden p-2'
                : isSplit
                  ? 'flex-1 min-w-0 flex flex-row gap-2 p-2'
                  : 'relative flex-1 overflow-hidden p-2',
            )}
          >
            {(() => {
              const seen = new Set<string>()
              return tabs.map((tab, index) => {
                if (!tab?.id || seen.has(tab.id)) return null
                seen.add(tab.id)

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
                          isActive={slotIndex === activeSlotIndex}
                          onActivate={() => focusSlot(activeView.id, slotIndex)}
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
              })
            })()}

            {isDeck ? (
              <div style={{ order: tabs.length + 1 }}>
                <Pressable
                  className="flex h-full w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950/40 hover:bg-zinc-200 dark:hover:bg-zinc-900/70"
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
                      isActive={slotIndex === activeSlotIndex}
                      onActivate={() => focusSlot(activeView.id, slotIndex)}
                      slotIndex={slotIndex}
                      orderedTabs={orderedTabs}
                      tabIdSet={tabIdSet}
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
