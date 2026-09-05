import React, { useEffect, useMemo, useRef, useState } from 'react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { Animated, LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native'
import { settings$ } from '@/states/settings'
import { getGroupedTabIds, getTabGroupsKey } from '@/lib/tab-groups'
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

// The phone layout does not place tabs by measured rects: the active tab simply fills the
// host, so it is laid out before the first onLayout lands and never flickers at 0x0.
const FILL = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const

/**
 * The single host every native tab lives in, in both the phone layout and the desktop
 * workspace. The two layouts differ only in the style of each tab's slot and in the
 * chrome around it, so switching between them -- a rotation crossing the desktop-layout
 * width threshold, or the setting -- never reparents a tab. Reparenting would remount the
 * native webview and reload the page, restarting video and losing the scroll position.
 */
export const NativeTabHost: React.FC<{ desktopLayout: boolean }> = ({ desktopLayout }) => {
  const tabs = useValue(tabs$.tabs)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const orders = useValue(tabs$.orders)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)
  const deckTabWidth = useValue(settings$.deckTabWidth)
  const focusedEmptySlotByGroup = useValue(desktopWorkspaceState$.focusedEmptySlotByGroup)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const scrollRef = useRef<ScrollView>(null)
  const workspaceViewportRef = useRef<View>(null)
  const prevTabCountRef = useRef(tabs.length)
  const deckScrollX = useRef(new Animated.Value(0)).current

  const activeGroup = (desktopLayout && groups.find((group) => group.id === activeGroupId)) || null
  const groupsKey = getTabGroupsKey(groups)
  const groupedTabIds = useMemo(() => getGroupedTabIds(groups), [groupsKey])
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
  const deckScrolling = desktopLayout && isDeck

  // The tab layer only borrows the deck's offset, so an offset left behind by another deck
  // would place every tab off screen in a layout that has no way to scroll it back.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false })
    deckScrollX.setValue(0)
  }, [activeGroupId, deckScrolling])

  useEffect(() => {
    if (desktopLayout && isDeck && tabs.length > prevTabCountRef.current) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
    }
    prevTabCountRef.current = tabs.length
  }, [desktopLayout, isDeck, tabs.length])

  useEffect(() => {
    if (!desktopLayout || !tabs.length) {
      return
    }
    if (activeTabId && visibleTabIds.includes(activeTabId)) {
      return
    }
    const fallbackTabId = visibleTabIds.find((tabId) => tabIdSet.has(tabId))
    if (fallbackTabId) {
      tabs$.setActiveTabById(fallbackTabId, 'system')
    }
  }, [activeGroupId, activeTabId, desktopLayout, tabIdsKey, visibleTabIds.join('|')])

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
  const contentStyle = desktopLayout
    ? { width: contentWidth, height: size.height }
    : ({ width: '100%', height: '100%' } as const)

  return (
    <View ref={workspaceViewportRef} className="flex-1 overflow-hidden" onLayout={onLayout}>
      {/* The deck scrolls this empty surface rather than the tabs themselves. A webview
          inside a horizontal ScrollView never sees a mouse wheel: ReactHorizontalScrollView
          drops every generic motion event while scrolling is disabled, and steals horizontal
          drags from the page while it is enabled. The tabs sit in the sibling layer below,
          which only borrows this surface's offset. */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={deckScrolling}
        showsHorizontalScrollIndicator={deckScrolling}
        // The tab layer covers the viewport, so only the gaps around the deck reach this
        // surface: a tap that lands here must never dismiss a keyboard the page owns, and
        // the iOS inset adjustment must not shift the offset the tabs are placed from.
        keyboardShouldPersistTaps="always"
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: deckScrollX } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        style={FILL}
      >
        <View style={{ width: contentWidth, height: size.height }} />
      </Animated.ScrollView>

      <Animated.View
        // Transparent to touches itself, so a drag in the gaps between deck tabs falls
        // through to the scroll surface while a drag on a tab stays with the page.
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          ...contentStyle,
          transform: deckScrolling ? [{ translateX: Animated.multiply(deckScrollX, -1) }] : [],
        }}
      >
        {tabs.map((tab, index) => {
          const rectIndex = isDeck ? deckOrderByTabId.get(tab.id) : slotIndexByTabId.get(tab.id)
          const rect = rectIndex == null ? undefined : rects[rectIndex]
          const isVisible = desktopLayout ? Boolean(rect) : activeTabId === tab.id
          return (
            <View
              key={tab.id}
              pointerEvents={isVisible ? 'auto' : 'none'}
              style={
                desktopLayout
                  ? {
                      position: 'absolute',
                      ...(rect ?? hiddenRect),
                      opacity: isVisible ? 1 : 0,
                      zIndex: isVisible ? 1 : 0,
                    }
                  : { ...FILL, opacity: isVisible ? 1 : 0, zIndex: isVisible ? 1 : 0 }
              }
              onStartShouldSetResponderCapture={() => {
                if (desktopLayout && isVisible && activeTabId !== tab.id) {
                  tabs$.setActiveTabById(tab.id, 'user')
                }
                return false
              }}
            >
              <NoraTab
                tab={tab}
                index={index}
                isActive={activeTabId === tab.id}
                desktopChrome={desktopLayout}
                desktopClipRef={workspaceViewportRef}
                desktopVisible={isVisible}
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

        {desktopLayout && isDeck ? (
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
      </Animated.View>
    </View>
  )
}
