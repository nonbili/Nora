import React, { useEffect, useMemo, useRef, useState } from 'react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native'
import { settings$ } from '@/states/settings'
import { tabGroups$, type TabGroupLayout } from '@/states/tab-groups'
import { openDesktopTab, sortTabsByOrder, tabs$ } from '@/states/tabs'
import { NoraTab } from './NoraTab'
import { NativeEmptySlot } from './desktop/NativeEmptySlot'
import { desktopWorkspaceState$ } from './desktop/desktopWorkspaceState'
import {
  DECK_NEW_TAB_WIDTH,
  WORKSPACE_GAP,
  WORKSPACE_PADDING,
  getWorkspaceContentWidth,
  getWorkspaceSlotRects,
} from './desktop/nativeWorkspaceLayout'

export const DesktopWorkspace: React.FC = () => {
  const tabs = useValue(tabs$.tabs)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const orders = useValue(tabs$.orders)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)
  const deckTabWidth = useValue(settings$.deckTabWidth)
  const focusedEmptySlotByGroup = useValue(desktopWorkspaceState$.focusedEmptySlotByGroup)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const scrollRef = useRef<ScrollView>(null)
  const prevTabCountRef = useRef(tabs.length)

  const activeGroup = groups.find((group) => group.id === activeGroupId) || null
  const groupedTabIds = useMemo(
    () => new Set(groups.flatMap((group) => group.tabIds.filter((tabId): tabId is string => typeof tabId === 'string'))),
    [groups],
  )
  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabs = useMemo(() => sortTabsByOrder(tabs, orders), [tabIdsKey, orders])
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
  const viewLayout: TabGroupLayout = activeGroup?.layout || 'deck'
  const isDeck = viewLayout === 'deck' && !isSingle

  // A deck only lays out the tabs it shows, so the slot of a tab is its position
  // among the visible ones; the other layouts keep empty slots, so the slot index
  // is the position inside the group.
  const deckOrderByTabId = new Map(visibleTabIds.map((tabId, index) => [tabId, index]))
  const slotIndexByTabId = new Map<string, number>()
  visibleSlots.forEach((tabId, slotIndex) => {
    if (tabId && tabIdSet.has(tabId)) {
      slotIndexByTabId.set(tabId, slotIndex)
    }
  })

  const slotCount = isDeck ? visibleTabIds.length : visibleSlots.length
  const rects = getWorkspaceSlotRects({
    deckTabWidth,
    isSingle,
    layout: viewLayout,
    size,
    slotCount,
  })
  const contentWidth = getWorkspaceContentWidth({ deckTabWidth, isDeck, size, slotCount })

  useEffect(() => {
    if (isDeck && tabs.length > prevTabCountRef.current) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
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

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((current) =>
      Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1 ? current : { width, height },
    )
  }

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

  // Hidden tabs stay mounted at full size behind the workspace so their webview
  // keeps its page, its scroll position and its media state.
  const hiddenRect = { left: 0, top: 0, width: size.width, height: size.height }

  return (
    <View className="flex-1" onLayout={onLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={isDeck}
        showsHorizontalScrollIndicator={isDeck}
        contentContainerStyle={{ width: contentWidth, height: size.height }}
      >
        <View style={{ width: contentWidth, height: size.height }}>
          {tabs.map((tab, index) => {
            const rectIndex = isDeck ? deckOrderByTabId.get(tab.id) : slotIndexByTabId.get(tab.id)
            const rect = rectIndex == null ? undefined : rects[rectIndex]
            const isVisible = Boolean(rect)
            return (
              <View
                key={tab.id}
                pointerEvents={isVisible ? 'auto' : 'none'}
                style={{
                  position: 'absolute',
                  ...(rect ?? hiddenRect),
                  opacity: isVisible ? 1 : 0,
                  zIndex: isVisible ? 1 : 0,
                }}
                onStartShouldSetResponderCapture={() => {
                  if (isVisible && activeTabId !== tab.id) {
                    tabs$.setActiveTabById(tab.id, 'user')
                  }
                  return false
                }}
              >
                <NoraTab
                  tab={tab}
                  index={index}
                  isActive={activeTabId === tab.id}
                  desktopChrome
                  desktopVariant={!isVisible || isSingle ? 'single' : isDeck ? 'deck' : 'saved-view'}
                />
              </View>
            )
          })}

          {activeGroup && !isDeck
            ? activeGroup.tabIds.map((tabId, slotIndex) =>
                tabId && tabIdSet.has(tabId) ? null : (
                  <NativeEmptySlot
                    key={`${activeGroup.id}-${slotIndex}`}
                    group={activeGroup}
                    isActive={slotIndex === activeSlotIndex}
                    orderedTabs={orderedTabs}
                    rect={rects[slotIndex] ?? hiddenRect}
                    slotIndex={slotIndex}
                    tabIdSet={tabIdSet}
                  />
                ),
              )
            : null}

          {isDeck ? (
            <Pressable
              className="items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950/40"
              style={{
                position: 'absolute',
                left: WORKSPACE_PADDING + slotCount * (deckTabWidth + WORKSPACE_GAP),
                top: WORKSPACE_PADDING,
                width: DECK_NEW_TAB_WIDTH - WORKSPACE_GAP,
                height: Math.max(0, size.height - WORKSPACE_PADDING * 2),
              }}
              onPress={createDeckTab}
            >
              <MaterialIcons name="add" size={22} color="#a1a1aa" />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}
