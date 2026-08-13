import React, { useEffect, useMemo, useRef } from 'react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { batch } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import { DeviceEventEmitter, Pressable, ScrollView, View, useColorScheme } from 'react-native'
import { t } from 'i18next'
import { NouText } from '@/components/NouText'
import { NouMenu } from '@/components/menu/NouMenu'
import type { Item, NouMenuHandle } from '@/components/menu/NouMenu'
import { ServiceIcon } from '@/components/service/Services'
import { MaterialButton } from '@/components/button/IconButtons'
import { colors } from '@/lib/colors'
import { clsx, isIos } from '@/lib/utils'
import { getTabWebview } from '@/lib/webview'
import { NouLongPressMenu } from '@/components/menu/NouLongPressMenu'
import { getProfileColor } from '@/lib/profile'
import { useTabContextMenuItems } from '@/lib/hooks/useTabContextMenuItems'
import { createDesktopTabGroup, tabGroups$, type TabGroup, type TabGroupLayout } from '@/states/tab-groups'
import { openDesktopTab, sortTabsByOrder, tabs$, type Tab } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { getLayoutLabel, getTabLabel } from '@/components/tab/desktop/desktopWorkspaceShared'

const layoutIconName = (layout: TabGroupLayout) => {
  if (layout === 'split-view') return 'view-week' as const
  if (layout === 'grid-4') return 'grid-view' as const
  return 'view-day' as const
}

type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void
}

const containsPoint = (x: number, y: number, left: number, top: number, width: number, height: number) =>
  x >= left && x <= left + width && y >= top && y <= top + height

const openTabInGroup = (group: TabGroup) => {
  tabGroups$.setActiveGroup(group.id)
  const tabId = openDesktopTab('')
  if (!tabId) {
    return
  }
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

const TabRow: React.FC<{
  collapsed: boolean
  groupId: string | null
  groups: TabGroup[]
  isActive: boolean
  clipRef: React.RefObject<Measurable | null>
  openMenu: (items: Item[], x: number, y: number) => void
  tab: Tab
}> = ({ collapsed, groupId, groups, isActive, clipRef, openMenu, tab }) => {
  const profileColor = getProfileColor(tab.profile)
  const rowRef = useRef<View>(null)
  const itemsRef = useRef<Item[]>([])
  const openMenuRef = useRef(openMenu)
  const webviewActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The webview of a background tab is not the one the shared menu talks to, so
  // focus the tab first and let the action run once it is the active one.
  const runWebviewAction = (action: (webview: any) => void) => {
    const performIfActive = () => {
      const currentIndex = tabs$.activeTabIndex.get()
      if (tabs$.tabs.get()[currentIndex]?.id !== tab.id) return
      const webview = getTabWebview(tab.id) || ui$.webview.get()
      if (webview) action(webview)
    }
    const activeIndex = tabs$.activeTabIndex.get()
    const activeId = tabs$.tabs.get()[activeIndex]?.id
    if (activeId === tab.id) {
      performIfActive()
      return
    }
    tabs$.setActiveTabById(tab.id, 'user')
    if (webviewActionTimerRef.current) clearTimeout(webviewActionTimerRef.current)
    webviewActionTimerRef.current = setTimeout(() => {
      webviewActionTimerRef.current = null
      performIfActive()
    }, 80)
  }

  const contextItems = useTabContextMenuItems(tab, { runWebviewAction })
  const moveTargets: Item[] = [
    ...(groupId
      ? [
          {
            label: t('views.desktop.moveToUngrouped'),
            icon: <MaterialIcons name="north-east" size={18} color={colors.iconSubtle} />,
            handler: () => tabGroups$.moveTabToGroup(tab.id, null),
          },
        ]
      : []),
    ...groups
      .filter((group) => group.id !== groupId)
      .map((group) => ({
        label: t('views.desktop.moveToGroup', { name: group.name }),
        icon: <MaterialIcons name={layoutIconName(group.layout)} size={18} color={colors.iconSubtle} />,
        handler: () => {
          tabGroups$.moveTabToGroup(tab.id, group.id)
          tabs$.setActiveTabById(tab.id, 'user')
        },
      })),
  ]
  const items: Item[] = [
    ...contextItems
      .filter((item) => item.kind === 'separator' || item.label)
      .map((item) => ({
        label: item.label || '',
        handler: item.handler || (() => {}),
        icon: item.icon,
        kind: item.kind,
      })),
    ...(moveTargets.length ? [{ label: '', handler: () => {}, kind: 'separator' as const }, ...moveTargets] : []),
  ]
  useEffect(() => {
    itemsRef.current = items
    openMenuRef.current = openMenu
  })
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('noraSecondaryMouseClick', ({ x, y }) => {
      clipRef.current?.measureInWindow((clipLeft, clipTop, clipWidth, clipHeight) => {
        if (!containsPoint(x, y, clipLeft, clipTop, clipWidth, clipHeight)) return
        rowRef.current?.measureInWindow((left, top, width, height) => {
          if (containsPoint(x, y, left, top, width, height)) {
            openMenuRef.current(itemsRef.current, x, y)
          }
        })
      })
    })
    return () => subscription.remove()
  }, [clipRef])
  useEffect(
    () => () => {
      if (webviewActionTimerRef.current) clearTimeout(webviewActionTimerRef.current)
    },
    [],
  )

  const openRowMenu = () => {
    rowRef.current?.measureInWindow((left, top, width, height) => {
      openMenuRef.current(itemsRef.current, left + width / 2, top + height / 2)
    })
  }

  const activate = () => {
    batch(() => {
      tabGroups$.setActiveGroup(groupId)
      tabs$.setActiveTabById(tab.id, 'user')
    })
  }

  const favicon = (
    <View className="relative">
      <View className={clsx(tab.isPaused && 'opacity-40')}>
        <ServiceIcon url={tab.url} icon={tab.icon} />
      </View>
      {tab.isPaused ? (
        <View className="absolute -bottom-1 -right-1 rounded-full bg-zinc-100 dark:bg-zinc-700">
          <MaterialIcons name="pause-circle-filled" size={10} color="#a1a1aa" />
        </View>
      ) : null}
    </View>
  )

  if (collapsed) {
    const button = (
      <Pressable
        className={clsx(
          'h-10 w-10 items-center justify-center rounded-lg',
          isActive ? 'bg-white dark:bg-zinc-700' : 'active:bg-zinc-200/70 dark:active:bg-zinc-800',
        )}
        onPress={activate}
        onLongPress={isIos ? undefined : openRowMenu}
      >
        <View
          style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, backgroundColor: profileColor }}
        />
        {favicon}
      </Pressable>
    )
    return (
      <View ref={rowRef} collapsable={false}>
        <NouLongPressMenu items={items}>{button}</NouLongPressMenu>
      </View>
    )
  }

  return (
    <View
      ref={rowRef}
      collapsable={false}
      className={clsx(
        'min-h-9 flex-row items-center gap-2 rounded-md px-2 py-1',
        isActive && 'bg-white dark:bg-zinc-700',
      )}
    >
      <NouLongPressMenu items={items}>
        <Pressable
          className="min-w-0 flex-1 flex-row items-center gap-2"
          onPress={activate}
          onLongPress={isIos ? undefined : openRowMenu}
        >
          <View className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: profileColor }} />
          <View className="mx-1 h-4 w-4 shrink-0 items-center justify-center">{favicon}</View>
          <View className="min-w-0 flex-1">
            <NouText
              className={clsx(
                'text-xs font-medium',
                isActive ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-800 dark:text-zinc-200',
                tab.isPaused && 'italic opacity-60',
              )}
              numberOfLines={1}
            >
              {getTabLabel(tab)}
            </NouText>
          </View>
        </Pressable>
      </NouLongPressMenu>
      <Pressable
        className="h-6 w-6 shrink-0 items-center justify-center rounded-md"
        onPress={() => tabs$.closeTab(tabs$.tabs.get().findIndex((currentTab) => currentTab.id === tab.id))}
      >
        <MaterialIcons name="close" size={14} color="#a1a1aa" />
      </Pressable>
    </View>
  )
}

const GroupSection: React.FC<{
  activeGroupId: string | null
  activeTabId?: string
  collapsed: boolean
  group: TabGroup
  groups: TabGroup[]
  groupTabs: Tab[]
  clipRef: React.RefObject<Measurable | null>
  openMenu: (items: Item[], x: number, y: number) => void
}> = ({ activeGroupId, activeTabId, collapsed, group, groups, groupTabs, clipRef, openMenu }) => {
  const isActiveGroup = group.id === activeGroupId
  const colorScheme = useColorScheme()
  const iconColor = colorScheme === 'light' ? colors.iconLightStrong : colors.icon

  const focusGroup = () => {
    batch(() => {
      tabGroups$.setActiveGroup(group.id)
      const firstTabId = group.tabIds.find((tabId): tabId is string => Boolean(tabId))
      if (firstTabId) {
        tabs$.setActiveTabById(firstTabId, 'user')
      }
    })
  }

  const items: Item[] = [
    ...(['deck', 'split-view', 'grid-4'] as const).map((layout) => ({
      label: getLayoutLabel(layout),
      icon: <MaterialIcons name={layoutIconName(layout)} size={18} color={iconColor} />,
      metaLabel: layout === group.layout ? '✓' : undefined,
      handler: () => {
        tabGroups$.setGroupLayout(group.id, layout)
        focusGroup()
      },
    })),
    { label: '', handler: () => {}, kind: 'separator' as const },
    {
      label: t('tabs.new'),
      icon: <MaterialIcons name="add" size={18} color={iconColor} />,
      handler: () => openTabInGroup(group),
    },
    {
      label: t('views.desktop.renameGroup'),
      icon: <MaterialIcons name="edit" size={18} color={iconColor} />,
      handler: () => ui$.renameGroupModalTargetGroupId.set(group.id),
    },
    {
      label: t('menus.delete'),
      icon: <MaterialIcons name="delete" size={18} color="#f87171" />,
      handler: () => tabGroups$.deleteGroup(group.id),
    },
  ]

  if (collapsed) {
    return (
      <View
        className={clsx(
          'items-center gap-1 rounded-xl border px-1 py-1',
          isActiveGroup ? 'border-indigo-200 dark:border-indigo-300/45' : 'border-zinc-200/80 dark:border-zinc-700/80',
        )}
      >
        <Pressable className="h-10 w-10 items-center justify-center rounded-md" onPress={focusGroup}>
          <MaterialIcons name={layoutIconName(group.layout)} size={20} color={iconColor} />
        </Pressable>
        {groupTabs.map((tab) => (
          <TabRow
            collapsed
            groupId={group.id}
            groups={groups}
            isActive={tab.id === activeTabId}
            key={`${group.id}:${tab.id}`}
            clipRef={clipRef}
            openMenu={openMenu}
            tab={tab}
          />
        ))}
      </View>
    )
  }

  return (
    <View
      className={clsx(
        'rounded-xl border p-1',
        isActiveGroup ? 'border-indigo-200 dark:border-indigo-300/45' : 'border-zinc-200/80 dark:border-zinc-700/80',
      )}
    >
      <View className="flex-row items-center gap-2 rounded-md px-2 py-1">
        <Pressable className="min-w-0 flex-1 flex-row items-center gap-2" onPress={focusGroup}>
          <View className="h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/70 dark:bg-zinc-950/50">
            <MaterialIcons name={layoutIconName(group.layout)} size={14} color={iconColor} />
          </View>
          <View className="min-w-0 flex-1">
            <NouText className="text-xs font-bold text-zinc-900 dark:text-zinc-100" numberOfLines={1}>
              {group.name}
            </NouText>
          </View>
        </Pressable>
        <NouMenu trigger={<MaterialButton name="more-vert" size={16} style={{ padding: 4 }} />} items={items} />
      </View>
      {groupTabs.length ? (
        <View className="mt-1 gap-1">
          {groupTabs.map((tab) => (
            <TabRow
              collapsed={false}
              groupId={group.id}
              groups={groups}
              isActive={tab.id === activeTabId}
              key={`${group.id}:${tab.id}`}
              clipRef={clipRef}
              openMenu={openMenu}
              tab={tab}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

export const DesktopTabsSidebar: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const tabs = useValue(tabs$.tabs)
  const orders = useValue(tabs$.orders)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const activeGroupId = useValue(tabGroups$.activeGroupId)
  const groups = useValue(tabGroups$.groups)
  const menuRef = useRef<NouMenuHandle>(null)
  const sidebarViewportRef = useRef<Measurable | null>(null)
  const setSidebarViewportRef = (scrollView: ScrollView | null) => {
    sidebarViewportRef.current = scrollView?.getNativeScrollRef() ?? null
  }
  const colorScheme = useColorScheme()
  const iconColor = colorScheme === 'light' ? colors.iconLightStrong : colors.icon

  const tabIdsKey = tabs.map((tab) => tab.id).join('|')
  const orderedTabs = useMemo(() => sortTabsByOrder(tabs, orders), [tabIdsKey, orders])
  const activeTabId = tabs[activeTabIndex]?.id
  const groupedTabIds = useMemo(
    () =>
      new Set(groups.flatMap((group) => group.tabIds.filter((tabId): tabId is string => typeof tabId === 'string'))),
    [groups],
  )
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabIdsKey])
  const ungroupedTabs = orderedTabs.filter((tab) => !groupedTabIds.has(tab.id))

  const openMenu = (items: Item[], x: number, y: number) => {
    setTimeout(() => {
      menuRef.current?.openAt(x, y, items)
    }, 0)
  }

  const newTab = () => {
    tabGroups$.setActiveGroup(null)
    tabs$.openTab('')
  }

  const newGroupItems: Item[] = [
    { layout: 'deck' as TabGroupLayout, label: t('views.desktop.newDeckView') },
    { layout: 'split-view' as TabGroupLayout, label: t('views.desktop.newSplitView') },
    { layout: 'grid-4' as TabGroupLayout, label: t('views.desktop.newGridView') },
  ].map(({ layout, label }) => ({
    label,
    icon: <MaterialIcons name={layoutIconName(layout)} size={18} color={iconColor} />,
    handler: () => createDesktopTabGroup(layout),
  }))

  const groupSections = groups.map((group) => {
    const groupTabs = group.tabIds
      .filter((tabId): tabId is string => typeof tabId === 'string')
      .map((tabId) => tabById.get(tabId))
      .filter((tab): tab is Tab => tab != null)
    return (
      <GroupSection
        activeGroupId={activeGroupId}
        activeTabId={activeTabId}
        collapsed={collapsed}
        group={group}
        groups={groups}
        groupTabs={groupTabs}
        key={group.id}
        clipRef={sidebarViewportRef}
        openMenu={openMenu}
      />
    )
  })

  if (collapsed) {
    return (
      <View className="h-full w-full flex-col bg-zinc-100 dark:bg-zinc-900">
        <ScrollView
          ref={setSidebarViewportRef}
          className="flex-1"
          contentContainerClassName="gap-2 items-center px-1 pb-2 pt-1"
        >
          <Pressable className="h-10 w-10 items-center justify-center rounded-md" onPress={newTab}>
            <MaterialIcons name="add" size={20} color={iconColor} />
          </Pressable>
          <View className="gap-1 items-center">
            {ungroupedTabs.map((tab) => (
              <TabRow
                collapsed
                groupId={null}
                groups={groups}
                isActive={tab.id === activeTabId}
                key={`ungrouped:${tab.id}`}
                clipRef={sidebarViewportRef}
                openMenu={openMenu}
                tab={tab}
              />
            ))}
          </View>
          {groupSections}
          <NouMenu
            trigger={
              <View className="h-10 w-10 items-center justify-center rounded-md">
                <MaterialIcons name="create-new-folder" size={20} color={iconColor} />
              </View>
            }
            items={newGroupItems}
          />
        </ScrollView>
        <NouMenu ref={menuRef} items={[]} hideTrigger />
      </View>
    )
  }

  return (
    <View className="h-full w-full flex-col bg-zinc-100 dark:bg-zinc-900">
      <ScrollView
        ref={setSidebarViewportRef}
        className="flex-1"
        contentContainerClassName="gap-3 px-2 pb-3 pt-1"
      >
        <View>
          <View className="mb-1 flex-row items-center justify-between px-2 py-1">
            <NouText className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {t('views.desktop.ungrouped')}
            </NouText>
            <Pressable className="h-7 w-7 items-center justify-center rounded-md" onPress={newTab}>
              <MaterialIcons name="add" size={18} color="#71717a" />
            </Pressable>
          </View>
          <View className="gap-1">
            {ungroupedTabs.map((tab) => (
              <TabRow
                collapsed={false}
                groupId={null}
                groups={groups}
                isActive={tab.id === activeTabId}
                key={`ungrouped:${tab.id}`}
                clipRef={sidebarViewportRef}
                openMenu={openMenu}
                tab={tab}
              />
            ))}
          </View>
        </View>

        {groupSections}

        <NouMenu
          trigger={
            <View className="flex-row items-center gap-2 rounded-md border border-dashed border-zinc-300 px-2 py-2 dark:border-zinc-700">
              <MaterialIcons name="create-new-folder" size={16} color="#71717a" />
              <NouText className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {t('views.desktop.newGroup')}
              </NouText>
            </View>
          }
          items={newGroupItems}
        />
      </ScrollView>
      <NouMenu ref={menuRef} items={[]} hideTrigger />
    </View>
  )
}
