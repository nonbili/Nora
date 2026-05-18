import React, { useMemo, useRef, useState } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { DndContext, DragOverlay, PointerSensor, rectIntersection, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { batch } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import { Pressable, ScrollView, View, useColorScheme } from 'react-native'
import { t } from 'i18next'
import { NouText } from '@/components/NouText'
import { colors } from '@/lib/colors'
import { tabGroups$, type TabGroup } from '@/states/tab-groups'
import { sortTabsByOrder, tabs$, type Tab } from '@/states/tabs'
import {
  NEW_TAB_SHORTCUT,
  SectionDropTarget,
  SidebarGroupSection,
  reorderUngroupedTabs,
} from './DesktopTabsSidebarParts'
import { TAB_DND_PREFIX } from './DesktopTabsSidebarConstants'
import { TabRow, TabRowPreview } from './DesktopTabsSidebarTabRow'

const sameIds = (left: (string | null)[], right: (string | null)[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])

const samePreviewState = (
  left: { groups: TabGroup[]; ungroupedTabs: Tab[] },
  right: { groups: TabGroup[]; ungroupedTabs: Tab[] },
) =>
  sameIds(left.ungroupedTabs.map((tab) => tab.id), right.ungroupedTabs.map((tab) => tab.id)) &&
  left.groups.length === right.groups.length &&
  left.groups.every((group, index) => group.id === right.groups[index]?.id && sameIds(group.tabIds, right.groups[index].tabIds))

export const DesktopTabsSidebar: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const tabs = useValue(tabs$.tabs)
  const orders = useValue(tabs$.orders)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)

  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{
    groups: TabGroup[]
    ungroupedTabs: Tab[]
  } | null>(null)

  const lastTarget = useRef<{ groupId: string | null; index: number | undefined } | null>(null)
  const lastUpdateAt = useRef<number>(0)

  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabs = useMemo(() => sortTabsByOrder(tabs, orders), [tabIdsKey, orders])
  const activeTabId = tabs[activeTabIndex]?.id
  const draggingTab = draggingTabId ? tabs.find((tab) => tab.id === draggingTabId) ?? null : null
  const groupedTabIds = useMemo(
    () => new Set(groups.flatMap((group) => group.tabIds.filter((tabId): tabId is string => typeof tabId === 'string'))),
    [groups],
  )
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabIdsKey])
  const ungroupedTabs = useMemo(() => orderedTabs.filter((tab) => !groupedTabIds.has(tab.id)), [orderedTabs, groupedTabIds])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  )

  const focusSection = (groupId: string | null, tabIds: string[]) => {
    batch(() => {
      tabGroups$.setActiveGroup(groupId)
      const firstTabId = tabIds.find(Boolean)
      if (firstTabId) {
        tabs$.setActiveTabById(firstTabId, 'user')
      }
    })
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    const tabId = active.data.current?.tabId as string | undefined
    setDraggingTabId(tabId ?? null)
    setDragState({
      groups: JSON.parse(JSON.stringify(groups)),
      ungroupedTabs: [...ungroupedTabs],
    })
    lastTarget.current = null
    lastUpdateAt.current = 0
  }

  const getDropTarget = (over: DragOverEvent['over']) => {
    const overData = over?.data.current
    const groupId = (overData?.type === 'section' ? overData.groupId : overData?.groupId) as string | null | undefined
    if (typeof groupId === 'undefined') {
      return null
    }
    return {
      groupId,
      index: overData?.type === 'tab' ? (overData.index as number) : undefined,
    }
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const tabId = active.data.current?.tabId as string | undefined
    if (!tabId || !over || over.id === active.id) {
      return
    }

    const now = Date.now()
    if (now - lastUpdateAt.current < 100) {
      return
    }

    const target = getDropTarget(over)
    if (!target) {
      return
    }
    const { groupId: targetGroupId, index: targetIndex } = target

    if (lastTarget.current?.groupId === targetGroupId && lastTarget.current?.index === targetIndex) {
      return
    }

    const tab = tabs.find((currentTab) => currentTab.id === tabId)
    if (!tab) {
      return
    }

    lastUpdateAt.current = now
    lastTarget.current = { groupId: targetGroupId, index: targetIndex }

    setDragState((current) => {
      if (!current) {
        return current
      }

      let nextGroups = current.groups.map((group) => ({
        ...group,
        tabIds:
          group.layout === 'grid-4'
            ? group.tabIds.map((currentTabId) => (currentTabId === tabId ? null : currentTabId))
            : group.tabIds.filter((currentTabId) => currentTabId !== tabId),
      }))
      let nextUngrouped = current.ungroupedTabs.filter((currentTab) => currentTab.id !== tabId)

      if (targetGroupId) {
        nextGroups = nextGroups.map((group) => {
          if (group.id !== targetGroupId) return group
          const tabIds = group.tabIds.filter((currentTabId): currentTabId is string => typeof currentTabId === 'string')
          const boundedIndex = typeof targetIndex === 'number' ? Math.max(0, Math.min(targetIndex, tabIds.length)) : tabIds.length
          return {
            ...group,
            tabIds: [...tabIds.slice(0, boundedIndex), tabId, ...tabIds.slice(boundedIndex)],
          }
        })
      } else {
        const boundedIndex = typeof targetIndex === 'number' ? Math.max(0, Math.min(targetIndex, nextUngrouped.length)) : nextUngrouped.length
        nextUngrouped = [...nextUngrouped.slice(0, boundedIndex), tab, ...nextUngrouped.slice(boundedIndex)]
      }

      const next = { groups: nextGroups, ungroupedTabs: nextUngrouped }
      if (samePreviewState(current, next)) {
        return current
      }

      return next
    })
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const tabId = active.data.current?.tabId as string | undefined
    const target = over?.id === active.id ? lastTarget.current : getDropTarget(over) ?? lastTarget.current

    if (!tabId || !target) {
      setDraggingTabId(null)
      setDragState(null)
      lastTarget.current = null
      lastUpdateAt.current = 0
      return
    }

    const { groupId: targetGroupId, index: targetIndex } = target

    batch(() => {
      tabGroups$.moveTabToGroup(tabId, targetGroupId, targetIndex)
      if (!targetGroupId) {
        const ungroupedIds = ungroupedTabs.map((tab) => tab.id)
        reorderUngroupedTabs(tabId, ungroupedIds, targetIndex)
      }
      setDraggingTabId(null)
      setDragState(null)
      lastTarget.current = null
      lastUpdateAt.current = 0
    })
  }

  const currentGroups = dragState?.groups ?? groups
  const currentUngrouped = dragState?.ungroupedTabs ?? ungroupedTabs

  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const newTabIconColor = isDark ? colors.icon : colors.iconLightStrong

  if (collapsed) {
    return (
      <DndContext
        collisionDetection={rectIntersection}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setDraggingTabId(null)
          setDragState(null)
          lastTarget.current = null
          lastUpdateAt.current = 0
        }}
      >
        <View className="h-full w-full flex-col bg-zinc-100 dark:bg-zinc-900">
          <ScrollView className="flex-1" contentContainerClassName="gap-2 items-center px-1 pb-2 pt-1">
            <SectionDropTarget groupId={null}>
              <View className="items-center mb-1">
                <div title={`${t('tabs.new')} (${NEW_TAB_SHORTCUT})`}>
                  <Pressable
                    className="h-9 w-9 items-center justify-center rounded-md border border-transparent hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900"
                    onPress={() => {
                      tabGroups$.setActiveGroup(null)
                      tabs$.openTab('')
                    }}
                  >
                    <MaterialIcons name="add" size={20} color={newTabIconColor} />
                  </Pressable>
                </div>
              </View>
              <SortableContext items={currentUngrouped.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
                <View className="gap-1 items-center">
                  {currentUngrouped.map((tab, index) => (
                    <TabRow collapsed groupId={null} index={index} isActive={tab.id === activeTabId} key={tab.id} tab={tab} />
                  ))}
                </View>
              </SortableContext>
            </SectionDropTarget>

            {currentGroups.map((group) => {
              const groupTabs = group.tabIds
                .filter((tabId): tabId is string => typeof tabId === 'string')
                .map((tabId) => tabById.get(tabId))
                .filter((tab): tab is Tab => tab != null)
              return (
                <SidebarGroupSection
                  activeGroupId={activeGroupId}
                  activeTabId={activeTabId}
                  collapsed
                  focusSection={focusSection}
                  group={group}
                  groupTabs={groupTabs}
                  key={group.id}
                />
              )
            })}
          </ScrollView>
        </View>
        <DragOverlay dropAnimation={null}>
          {draggingTab ? <TabRowPreview collapsed tab={draggingTab} /> : null}
        </DragOverlay>
      </DndContext>
    )
  }

  return (
    <DndContext
      collisionDetection={rectIntersection}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDraggingTabId(null)
        setDragState(null)
        lastTarget.current = null
        lastUpdateAt.current = 0
      }}
    >
      <View className="h-full w-full flex-col bg-zinc-100 dark:bg-zinc-900">
        <ScrollView className="flex-1" contentContainerClassName="gap-3 px-2 pb-3 pt-1">
          <SectionDropTarget groupId={null}>
            <View className="flex-row items-center justify-between px-2 py-1 mb-1">
              <NouText className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                {t('views.desktop.ungrouped')}
              </NouText>
              <div title={`${t('tabs.new')} (${NEW_TAB_SHORTCUT})`}>
                <Pressable
                  className="h-5 w-5 items-center justify-center rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  onPress={() => {
                    tabGroups$.setActiveGroup(null)
                    tabs$.openTab('')
                  }}
                >
                  <MaterialIcons name="add" size={16} color="#71717a" />
                </Pressable>
              </div>
            </View>
            <SortableContext items={currentUngrouped.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
              <View className="gap-1">
                {currentUngrouped.map((tab, index) => (
                  <TabRow groupId={null} index={index} isActive={tab.id === activeTabId} key={tab.id} tab={tab} />
                ))}
              </View>
            </SortableContext>
          </SectionDropTarget>

          {currentGroups.map((group) => {
            const groupTabs = group.tabIds
              .filter((tabId): tabId is string => typeof tabId === 'string')
              .map((tabId) => tabById.get(tabId))
              .filter((tab): tab is Tab => tab != null)
            return (
              <SidebarGroupSection
                activeGroupId={activeGroupId}
                activeTabId={activeTabId}
                focusSection={focusSection}
                group={group}
                groupTabs={groupTabs}
                key={group.id}
              />
            )
          })}
        </ScrollView>
      </View>
      <DragOverlay dropAnimation={null}>
        {draggingTab ? <TabRowPreview tab={draggingTab} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
