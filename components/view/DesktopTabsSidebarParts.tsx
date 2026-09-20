import React, { memo, type ReactNode } from 'react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pressable, View, useColorScheme } from 'react-native'
import { t } from 'i18next'
import { NouContextMenu, type ContextItem } from '@/components/menu/NouContextMenu'
import { NouText } from '@/components/NouText'
import { closeDesktopGroupWithTabs, openTabInDesktopGroup, ungroupDesktopGroup } from '@/lib/desktop-view-actions'
import { groupItemKey } from '@/lib/sidebar-order'
import { clsx } from '@/lib/utils'
import { tabGroups$, type TabGroup, type TabGroupLayout } from '@/states/tab-groups'
import { type Tab } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { TAB_DND_PREFIX } from './DesktopTabsSidebarConstants'
import { TabRow } from './DesktopTabsSidebarTabRow'
import { useUrlDropTarget } from './useUrlDropTarget'

const UNGROUPED_ID = 'ungrouped'
const GAP_DND_PREFIX = 'gap:'

const isMacPlatform = typeof window !== 'undefined' && window.electron?.process?.platform === 'darwin'
export const NEW_TAB_SHORTCUT = isMacPlatform ? '⌘T' : 'Ctrl+T'

const getLayoutLabel = (layout: TabGroupLayout) => {
  if (layout === 'split-view') return t('views.desktop.layout.split')
  if (layout === 'grid-4') return t('views.desktop.layout.grid')
  return t('views.desktop.layout.deck')
}

const ViewTypeIcon = ({ layout, size = 18, color = '#71717a' }: { layout: TabGroupLayout; size?: number; color?: string }) => {
  let name: React.ComponentProps<typeof MaterialIcons>['name'] = 'view-day'
  if (layout === 'split-view') name = 'view-week'
  if (layout === 'grid-4') name = 'grid-view'
  return <MaterialIcons name={name} size={size} color={color} />
}

// The surface the whole list sits on. A tab dropped on it leaves whatever group it was
// in, and a URL dropped on it opens a new ungrouped tab.
export const SectionDropTarget: React.FC<{
  children: ReactNode
  groupId: string | null
}> = ({ children, groupId }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: UNGROUPED_ID,
    data: { type: 'section', groupId },
  })
  const { active, over } = useDndContext()
  const { isUrlOver, dropProps } = useUrlDropTarget((url) => openTabInDesktopGroup(groupId, url))
  const activeGroupId = (active?.data.current?.groupId ?? null) as string | null | undefined
  const overGroupId = (over?.data.current?.groupId ?? null) as string | null | undefined
  const isCrossSectionTarget = !!active && !!over && activeGroupId !== groupId && overGroupId === groupId
  const showHighlight = isOver || isCrossSectionTarget || isUrlOver

  return (
    <div
      ref={setNodeRef}
      className={clsx('flex-1 rounded-md transition-colors', showHighlight && 'bg-indigo-50/80 dark:bg-indigo-400/10')}
      {...dropProps}
    >
      {children}
    </div>
  )
}

// The space between two items of the list. Without it there is nowhere to drop a tab that
// belongs between two groups, and no way to pull a tab out of the last group: every other
// pixel of the list belongs to a section that would swallow the drop.
export const ItemGapDropZone: React.FC<{ collapsed?: boolean; index: number }> = ({ collapsed = false, index }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `${GAP_DND_PREFIX}${index}`,
    data: { type: 'gap', groupId: null, index },
  })
  const { active } = useDndContext()
  const isDragging = active?.data.current?.type === 'tab' || active?.data.current?.type === 'section'

  return (
    <div ref={setNodeRef} className={clsx('flex items-center', collapsed ? 'h-2 w-9' : 'h-2 w-full')}>
      <div
        className={clsx(
          'h-0.5 w-full rounded-full transition-colors',
          isDragging && isOver ? 'bg-indigo-400 dark:bg-indigo-300' : 'bg-transparent',
        )}
      />
    </div>
  )
}

export const GroupHeader = memo<{
  collapsed?: boolean
  group: TabGroup
  isActive: boolean
  onFocus: () => void
}>(({ collapsed = false, group, isActive, onFocus }) => {
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
      handler: () => openTabInDesktopGroup(group.id),
    },
    { kind: 'separator' },
    {
      label: t('views.desktop.renameGroup'),
      icon: <MaterialIcons name="edit" size={14} color={menuIconColor} />,
      handler: () => ui$.renameGroupModalTargetGroupId.set(group.id),
    },
    {
      label: t('views.desktop.ungroup'),
      icon: <MaterialIcons name="layers-clear" size={14} color={menuIconColor} />,
      handler: () => ungroupDesktopGroup(group.id),
    },
    {
      label: t('views.desktop.closeGroup'),
      icon: <MaterialIcons name="delete" size={14} color="#f87171" />,
      color: 'red',
      handler: () => closeDesktopGroupWithTabs(group.id),
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
    // Squat and full width, so the eye reads it as the lid of the card rather than as one
    // more tab in the stack below it.
    const collapsedIconColor = isActive ? (isDark ? '#c7d2fe' : '#4338ca') : isDark ? '#a1a1aa' : '#71717a'
    return (
      <NouContextMenu items={mergedContextItems}>
        <div title={group.name}>
          <Pressable
            className={clsx(
              'h-5 w-9 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-indigo-200/70 dark:bg-indigo-400/25'
                : 'bg-zinc-300/70 hover:bg-zinc-400/60 dark:bg-zinc-800 dark:hover:bg-zinc-700',
            )}
            onPress={onFocus}
          >
            <ViewTypeIcon layout={group.layout} size={14} color={collapsedIconColor} />
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
GroupHeader.displayName = 'GroupHeader'

export const SidebarGroupSection: React.FC<{
  activeGroupId: string | null
  activeTabId?: string
  collapsed?: boolean
  focusSection: (groupId: string | null, tabIds: string[]) => void
  group: TabGroup
  groupTabs: Tab[]
  isDragging?: boolean
}> = ({ activeGroupId, activeTabId, collapsed = false, focusSection, group, groupTabs, isDragging = false }) => {
  // A group section is an item of the sidebar list, so it both sorts among the ungrouped
  // tabs around it and takes tabs dropped into it. Only the header carries the drag
  // listeners -- the rows inside drag on their own.
  const { attributes, listeners, setNodeRef, transform, transition, isOver } = useSortable({
    id: groupItemKey(group.id),
    data: { type: 'section', groupId: group.id },
  })
  const { active, over } = useDndContext()
  const { isUrlOver, dropProps } = useUrlDropTarget((url) => openTabInDesktopGroup(group.id, url))
  const isActiveGroup = group.id === activeGroupId
  const activeDragGroupId = (active?.data.current?.groupId ?? null) as string | null | undefined
  const overGroupId = (over?.data.current?.groupId ?? null) as string | null | undefined
  const isTabDrag = active?.data.current?.type === 'tab'
  const isCrossSectionTarget = isTabDrag && !!over && activeDragGroupId !== group.id && overGroupId === group.id
  const showHighlight = (isTabDrag && isOver) || isCrossSectionTarget || isUrlOver

  const tabRows = groupTabs.map((tab, index) => (
    <TabRow
      collapsed={collapsed}
      groupId={group.id}
      index={index}
      isActive={tab.id === activeTabId}
      key={tab.id}
      tab={tab}
    />
  ))

  return (
    <div
      ref={setNodeRef}
      className={clsx('rounded-xl transition-colors', showHighlight && 'bg-indigo-50/80 dark:bg-indigo-400/10')}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...dropProps}
    >
      <div
        className={clsx(
          'rounded-xl border transition-colors',
          collapsed ? 'px-1 py-1' : 'p-1',
          isActiveGroup
            ? 'border-indigo-300 bg-indigo-100/60 dark:border-indigo-300/50 dark:bg-indigo-400/10'
            : 'border-zinc-300 bg-zinc-200/60 dark:border-zinc-700 dark:bg-zinc-950/50',
        )}
      >
        <View className={clsx(collapsed && 'gap-1 items-center')}>
          <div className="cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
            <GroupHeader
              collapsed={collapsed}
              group={group}
              isActive={isActiveGroup}
              onFocus={() => focusSection(group.id, groupTabs.map((tab) => tab.id))}
            />
          </div>
          {groupTabs.length > 0 && (
            <SortableContext items={groupTabs.map((tab) => `${TAB_DND_PREFIX}${tab.id}`)} strategy={verticalListSortingStrategy}>
              <View
                className={clsx(
                  'border-t pt-1',
                  collapsed ? 'mt-1 gap-1 items-center' : 'mt-1 gap-1',
                  isActiveGroup ? 'border-indigo-200/70 dark:border-indigo-300/25' : 'border-zinc-300/80 dark:border-zinc-800',
                )}
              >
                {tabRows}
              </View>
            </SortableContext>
          )}
        </View>
      </div>
    </div>
  )
}

// What follows the cursor while a whole group is being dragged. The list shows where it
// will land; this shows what is being moved.
export const GroupSectionPreview: React.FC<{ collapsed?: boolean; group: TabGroup; tabCount: number }> = ({
  collapsed = false,
  group,
  tabCount,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: collapsed ? '4px 6px' : '6px 10px',
      borderRadius: 10,
      background: '#ffffff',
      boxShadow: '0 10px 20px rgba(0,0,0,0.18)',
      cursor: 'grabbing',
      zIndex: 9999,
    }}
  >
    <ViewTypeIcon layout={group.layout} size={14} color="#52525b" />
    {collapsed ? null : (
      <span style={{ fontSize: 12, fontWeight: 700, color: '#18181b', whiteSpace: 'nowrap' }}>{group.name}</span>
    )}
    <span style={{ fontSize: 11, fontWeight: 500, color: '#71717a' }}>{tabCount}</span>
  </div>
)
