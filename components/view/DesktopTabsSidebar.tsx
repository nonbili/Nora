import React, { memo, useMemo, type ReactNode } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { closestCenter, DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { batch } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import { Pressable, ScrollView, View, useColorScheme } from 'react-native'
import { t } from 'i18next'
import { NouContextMenu, type ContextItem } from '@/components/menu/NouContextMenu'
import { NouMenu } from '@/components/menu/NouMenu'
import { NouText } from '@/components/NouText'
import { ServiceIcon } from '@/components/service/Services'
import { clsx } from '@/lib/utils'
import { getProfileColor } from '@/lib/profile'
import { addBookmark } from '@/lib/bookmark'
import { share } from '@/lib/share'
import { executeWebviewJavaScriptQuietly } from '@/lib/webview'
import { createDesktopTabGroupFromTab, tabGroups$, type TabGroup, type TabGroupLayout } from '@/states/tab-groups'
import { sortTabsByOrder, tabs$, type Tab } from '@/states/tabs'
import { ui$ } from '@/states/ui'

const UNGROUPED_ID = 'ungrouped'
const TAB_DND_PREFIX = 'tab:'
const GROUP_DND_PREFIX = 'group:'

const getTabLabel = (tab?: Pick<Tab, 'title' | 'url'> | null) => tab?.title || tab?.url || t('tabs.new')

const getLayoutLabel = (layout: TabGroupLayout) => {
  if (layout === 'split-view') return t('views.desktop.layout.split')
  if (layout === 'grid-4') return t('views.desktop.layout.grid')
  return t('views.desktop.layout.deck')
}

const ViewTypeIcon = ({ layout, size = 18, color = '#71717a' }: { layout: TabGroupLayout; size?: number; color?: string }) => {
  let name: React.ComponentProps<typeof MaterialIcons>['name'] = 'view-carousel'
  if (layout === 'split-view') name = 'view-week'
  if (layout === 'grid-4') name = 'grid-view'
  return <MaterialIcons name={name} size={size} color={color} />
}

const getGlobalOrderedTabIds = (tabs: Tab[], orders: Record<string, number>) => sortTabsByOrder(tabs, orders).map((tab) => tab.id)

const reorderUngroupedTabs = (tabId: string, ungroupedIds: string[], targetIndex?: number) => {
  const withoutTab = ungroupedIds.filter((currentTabId) => currentTabId !== tabId)
  const boundedIndex = typeof targetIndex === 'number' ? Math.max(0, Math.min(targetIndex, withoutTab.length)) : withoutTab.length
  const nextUngrouped = [...withoutTab.slice(0, boundedIndex), tabId, ...withoutTab.slice(boundedIndex)]
  const globalIds = getGlobalOrderedTabIds(tabs$.tabs.get(), tabs$.orders.get())
  const ungroupedSet = new Set(ungroupedIds.concat([tabId]))
  const nextQueue = [...nextUngrouped]
  const nextGlobal = globalIds.map((currentTabId) => {
    if (currentTabId === tabId) return null
    if (ungroupedSet.has(currentTabId)) return nextQueue.shift() ?? currentTabId
    return currentTabId
  }).filter((id): id is string => id !== null)
  // append any leftover ungrouped ids (e.g. tabId that wasn't previously ungrouped)
  while (nextQueue.length) {
    const id = nextQueue.shift()
    if (id) nextGlobal.push(id)
  }
  tabs$.orders.set(Object.fromEntries(nextGlobal.map((currentTabId, index) => [currentTabId, index])))
}

const SectionDropTarget: React.FC<{
  children: ReactNode
  groupId: string | null
}> = ({ children, groupId }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: groupId ? `${GROUP_DND_PREFIX}${groupId}` : UNGROUPED_ID,
    data: { type: 'section', groupId },
  })

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'rounded-md transition-colors',
        isOver && 'bg-indigo-50/80 dark:bg-indigo-400/10',
      )}
    >
      {children}
    </div>
  )
}

const TabRow = memo<{
  groupId: string | null
  index: number
  isActive: boolean
  tab: Tab
  collapsed?: boolean
}>(({ groupId, index, isActive, tab, collapsed = false }) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${TAB_DND_PREFIX}${tab.id}`,
    data: { type: 'tab', tabId: tab.id, groupId, index },
  })
  const profileColor = getProfileColor(tab.profile)
  const menuIconColor = isDark ? '#a1a1aa' : '#52525b'
  const tabLabel = getTabLabel(tab)
  const row = collapsed ? (
    <Pressable
      className={clsx(
        'h-9 w-9 items-center justify-center rounded-md border transition-colors',
        isActive
          ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-300/40 dark:bg-indigo-400/20'
          : 'border-transparent hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900',
      )}
      onPress={() => {
        tabGroups$.setActiveGroup(groupId)
        tabs$.setActiveTabById(tab.id, 'user')
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, backgroundColor: profileColor }} />
      <ServiceIcon url={tab.url} icon={tab.icon} />
    </Pressable>
  ) : (
    <Pressable
      className={clsx(
        'min-h-8 flex-row items-center gap-2 rounded-md border px-2 py-1 transition-colors',
        isActive
          ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-300/40 dark:bg-indigo-400/20'
          : 'border-transparent hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900',
      )}
      onPress={() => {
        tabGroups$.setActiveGroup(groupId)
        tabs$.setActiveTabById(tab.id, 'user')
      }}
    >
      <View className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: profileColor }} />
      <View className="h-4 w-4 shrink-0 items-center justify-center">
        <ServiceIcon url={tab.url} icon={tab.icon} />
      </View>
      <View className="min-w-0 flex-1">
        <NouText
          className={clsx('text-xs font-medium', isActive ? 'text-indigo-950 dark:text-indigo-50' : 'text-zinc-800 dark:text-zinc-200')}
          numberOfLines={1}
        >
          {getTabLabel(tab)}
        </NouText>
      </View>
      <div title={t('menus.close')}>
        <Pressable className="h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800" onPress={() => tabs$.closeTab(tabs$.tabs.get().findIndex((currentTab) => currentTab.id === tab.id))}>
          <MaterialIcons name="close" size={14} color="#a1a1aa" />
        </Pressable>
      </div>
    </Pressable>
  )

  const runWebviewAction = (action: (webview: any) => void) => {
    const performIfActive = () => {
      const webview = ui$.webview.get()
      if (webview) action(webview)
    }
    const activeIndex = tabs$.activeTabIndex.get()
    const activeId = tabs$.tabs.get()[activeIndex]?.id
    if (activeId === tab.id) {
      performIfActive()
      return
    }
    tabs$.setActiveTabById(tab.id, 'user')
    setTimeout(performIfActive, 80)
  }
  const items: ContextItem[] = [
    {
      label: t('views.desktop.newGroupFromTab'),
      icon: <MaterialIcons name="create-new-folder" size={14} color={menuIconColor} />,
      handler: () => {
        const groupId = createDesktopTabGroupFromTab(tab.id)
        tabGroups$.setActiveGroup(groupId)
        tabs$.setActiveTabById(tab.id, 'system')
      },
    },
    {
      label: t('menus.reload'),
      icon: <MaterialIcons name="refresh" size={14} color={menuIconColor} />,
      handler: () =>
        runWebviewAction((webview) => {
          if (typeof webview.reload === 'function') {
            webview.reload()
          } else {
            void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
          }
        }),
    },
    {
      label: t('menus.editUrl'),
      icon: <MaterialIcons name="edit" size={14} color={menuIconColor} />,
      handler: () => {
        ui$.assign({ urlModalOpen: true, urlModalMode: 'editTab', urlModalTargetTabId: tab.id })
      },
    },
    {
      label: t('menus.openInProfile'),
      icon: <MaterialIcons name="account-circle" size={14} color={menuIconColor} />,
      handler: () => {
        if (tab.url) {
          ui$.profileLinkUrl.set(tab.url)
        }
      },
    },
    {
      label: t('menus.duplicate'),
      icon: <MaterialIcons name="content-copy" size={14} color={menuIconColor} />,
      handler: () => tabs$.duplicateTab(tab.id),
    },
    {
      label: t('menus.scroll'),
      icon: <MaterialIcons name="vertical-align-top" size={14} color={menuIconColor} />,
      handler: () =>
        runWebviewAction((webview) => {
          void executeWebviewJavaScriptQuietly(webview, `window.scrollTo(0, 0, {behavior: 'smooth'})`)
        }),
    },
    {
      label: t('menus.addBookmark'),
      icon: <MaterialIcons name="bookmark-add" size={14} color={menuIconColor} />,
      handler: () => addBookmark(tab),
    },
    {
      label: t('menus.share'),
      icon: <MaterialIcons name="share" size={14} color={menuIconColor} />,
      handler: () => share(tab.url || ''),
    },
    {
      label: t('menus.close'),
      icon: <MaterialIcons name="close" size={14} color="#f87171" />,
      color: 'red',
      handler: () => tabs$.closeTab(tabs$.tabs.get().findIndex((currentTab) => currentTab.id === tab.id)),
    },
    {
      label: t('buttons.closeAll'),
      icon: <MaterialIcons name="tab-unselected" size={14} color={menuIconColor} />,
      handler: () => tabs$.closeAll(),
    },
  ]

  const titleAttr = collapsed
    ? tabLabel
    : tab.url || undefined

  return (
    <div
      ref={setNodeRef}
      title={titleAttr}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <NouContextMenu items={items}>{row}</NouContextMenu>
    </div>
  )
})

const GroupHeader = memo<{
  group: TabGroup
  isActive: boolean
  onFocus: () => void
  collapsed?: boolean
}>(({ group, isActive, onFocus, collapsed = false }) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const iconColor = isActive ? (isDark ? '#e0e7ff' : '#312e81') : isDark ? '#a1a1aa' : '#52525b'
  const menuIconColor = isDark ? '#a1a1aa' : '#52525b'
  const layoutItems = (['deck', 'split-view', 'grid-4'] as const).map((layout) => ({
    label: getLayoutLabel(layout),
    icon: <ViewTypeIcon layout={layout} size={14} color={menuIconColor} />,
    meta: layout === group.layout ? <MaterialIcons name="check" size={14} color="#4f46e5" /> : undefined,
    handler: () => tabGroups$.setGroupLayout(group.id, layout),
  }))
  const contextItems: ContextItem[] = [
    {
      label: t('tabs.new'),
      icon: <MaterialIcons name="add" size={14} color={menuIconColor} />,
      handler: () => {
        tabGroups$.setActiveGroup(group.id)
        const tabId = openDesktopTab('')
        if (tabId) {
          if (group.layout === 'split-view') {
            const emptySlotIndex = group.tabIds.findIndex((slotTabId) => !slotTabId)
            if (emptySlotIndex >= 0) {
              tabGroups$.assignGroupSlot(group.id, emptySlotIndex, tabId)
            } else {
              const newSlotIndex = group.tabIds.length
              tabGroups$.appendSplitGroupSlot(group.id)
              tabGroups$.assignGroupSlot(group.id, newSlotIndex, tabId)
            }
          } else {
            tabGroups$.moveTabToGroup(tabId, group.id)
          }
          tabs$.setActiveTabById(tabId, 'open')
        }
      },
    },
    { kind: 'separator' },
    {
      label: t('views.desktop.renameGroup'),
      icon: <MaterialIcons name="edit" size={14} color={menuIconColor} />,
      handler: () => ui$.renameGroupModalTargetGroupId.set(group.id),
    },
    {
      label: t('menus.delete'),
      icon: <MaterialIcons name="delete" size={14} color="#f87171" />,
      color: 'red',
      handler: () => tabGroups$.deleteGroup(group.id),
    },
  ]

  const mergedContextItems: ContextItem[] = [
    ...layoutItems.map((item) => ({
      ...item,
      handler: () => {
        item.handler()
        onFocus()
      },
    })),
    { kind: 'separator' },
    ...contextItems,
  ]

  if (collapsed) {
    const collapsedIconColor = isDark ? '#a1a1aa' : '#52525b'
    return (
      <NouContextMenu items={mergedContextItems}>
        <div title={group.name}>
          <Pressable
            className={clsx(
              'h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900',
            )}
            onPress={onFocus}
          >
            <ViewTypeIcon layout={group.layout} size={20} color={collapsedIconColor} />
          </Pressable>
        </div>
      </NouContextMenu>
    )
  }

  return (
    <NouContextMenu items={mergedContextItems}>
      <Pressable
        className={clsx(
          'flex-row items-center gap-2 rounded-md border px-2 py-1 transition-colors',
          'border-transparent hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900',
        )}
        onPress={onFocus}
      >
        <View className="h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/70 dark:bg-zinc-950/50">
          <ViewTypeIcon layout={group.layout} size={14} color={iconColor} />
        </View>
        <View className="min-w-0 flex-1">
          <NouText className="text-xs font-bold text-zinc-900 dark:text-zinc-100" numberOfLines={1}>
            {group.name}
          </NouText>
        </View>
      </Pressable>
    </NouContextMenu>
  )
})

export const DesktopTabsSidebar: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const tabs = useValue(tabs$.tabs)
  const orders = useValue(tabs$.orders)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)

  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabs = useMemo(() => sortTabsByOrder(tabs, orders), [tabIdsKey, orders])
  const activeTabId = tabs[activeTabIndex]?.id
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

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const tabId = active.data.current?.tabId as string | undefined
    if (!tabId || !over) {
      return
    }
    const overData = over.data.current
    const targetGroupId = (overData?.type === 'section' ? overData.groupId : overData?.groupId) as string | null | undefined
    const targetIndex = overData?.type === 'tab' ? (overData.index as number) : undefined
    if (typeof targetGroupId === 'undefined') {
      return
    }

    batch(() => {
      tabGroups$.moveTabToGroup(tabId, targetGroupId, targetIndex)
      if (!targetGroupId) {
        const ungroupedIds = ungroupedTabs.map((tab) => tab.id)
        reorderUngroupedTabs(tabId, ungroupedIds, targetIndex)
      }
    })
  }

  if (collapsed) {
    return (
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
        <View className="h-full w-full flex-col bg-zinc-50 dark:bg-zinc-900">
          <ScrollView className="flex-1" contentContainerClassName="gap-2 items-center px-1 pb-2 pt-1">
            <SectionDropTarget groupId={null}>
              <View className="items-center mb-1">
                <div title={t('tabs.new')}>
                  <Pressable
                    className="h-9 w-9 items-center justify-center rounded-md border border-transparent hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-800 dark:hover:bg-zinc-900"
                    onPress={() => {
                      tabGroups$.setActiveGroup(null)
                      tabs$.openTab('')
                    }}
                  >
                    <MaterialIcons name="add" size={20} color="#71717a" />
                  </Pressable>
                </div>
              </View>
              <SortableContext items={ungroupedTabs.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
                <View className="gap-1 items-center">
                  {ungroupedTabs.map((tab, index) => (
                    <TabRow collapsed groupId={null} index={index} isActive={tab.id === activeTabId} key={tab.id} tab={tab} />
                  ))}
                </View>
              </SortableContext>
            </SectionDropTarget>

            {groups.map((group) => {
              const groupTabs = group.tabIds
                .filter((tabId): tabId is string => typeof tabId === 'string')
                .map((tabId) => tabById.get(tabId))
                .filter((tab): tab is Tab => tab != null)
              const isActiveGroup = group.id === activeGroupId

              return (
                <SectionDropTarget groupId={group.id} key={group.id}>
                  <div
                    className={clsx(
                      'rounded-xl border px-1 py-1 transition-colors',
                      isActiveGroup
                        ? 'border-indigo-200 dark:border-indigo-300/20'
                        : 'border-zinc-200/80 dark:border-zinc-800/80',
                    )}
                  >
                    <View className="gap-1 items-center">
                      <GroupHeader
                        collapsed
                        group={group}
                        isActive={isActiveGroup}
                        onFocus={() => focusSection(group.id, groupTabs.map((tab) => tab.id))}
                      />
                      <SortableContext items={groupTabs.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
                        <View className="gap-1 items-center">
                          {groupTabs.map((tab, index) => (
                            <TabRow collapsed groupId={group.id} index={index} isActive={tab.id === activeTabId} key={tab.id} tab={tab} />
                          ))}
                        </View>
                      </SortableContext>
                    </View>
                  </div>
                </SectionDropTarget>
              )
            })}
          </ScrollView>
        </View>
      </DndContext>
    )
  }

  return (
    <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
      <View className="h-full w-full flex-col bg-zinc-50 dark:bg-zinc-900">
        <ScrollView className="flex-1" contentContainerClassName="gap-3 px-2 pb-3 pt-1">
          <SectionDropTarget groupId={null}>
            <View className="flex-row items-center justify-between px-2 py-1 mb-1">
              <NouText className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                {t('views.desktop.ungrouped')}
              </NouText>
              <div title={t('tabs.new')}>
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
            <SortableContext items={ungroupedTabs.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
              <View className="gap-1">
                {ungroupedTabs.map((tab, index) => (
                  <TabRow groupId={null} index={index} isActive={tab.id === activeTabId} key={tab.id} tab={tab} />
                ))}
              </View>
            </SortableContext>
          </SectionDropTarget>

          {groups.map((group) => {
            const groupTabs = group.tabIds
              .filter((tabId): tabId is string => typeof tabId === 'string')
              .map((tabId) => tabById.get(tabId))
              .filter((tab): tab is Tab => tab != null)
            const isActiveGroup = group.id === activeGroupId

            return (
              <SectionDropTarget groupId={group.id} key={group.id}>
                <div
                  className={clsx(
                    'rounded-xl border p-1 transition-colors',
                    isActiveGroup
                      ? 'border-indigo-200 dark:border-indigo-300/20'
                      : 'border-zinc-200/80 dark:border-zinc-800/80',
                  )}
                >
                  <GroupHeader
                    group={group}
                    isActive={isActiveGroup}
                    onFocus={() => focusSection(group.id, groupTabs.map((tab) => tab.id))}
                  />
                  <SortableContext items={groupTabs.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
                    <View className="mt-1 gap-1">
                      {groupTabs.map((tab, index) => (
                        <TabRow groupId={group.id} index={index} isActive={tab.id === activeTabId} key={tab.id} tab={tab} />
                      ))}
                    </View>
                  </SortableContext>
                </div>
              </SectionDropTarget>
            )
          })}
        </ScrollView>
      </View>
    </DndContext>
  )
}
