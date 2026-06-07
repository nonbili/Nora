import { useTabContextMenuItems } from '@/lib/hooks/useTabContextMenuItems'
import React, { memo } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pressable, View } from 'react-native'
import { t } from 'i18next'
import { NouContextMenu } from '@/components/menu/NouContextMenu'
import { NouText } from '@/components/NouText'
import { ServiceIcon } from '@/components/service/Services'
import { clsx } from '@/lib/utils'
import { getProfileColor } from '@/lib/profile'
import { tabGroups$ } from '@/states/tab-groups'
import { tabs$, type Tab } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { TAB_DND_PREFIX } from './DesktopTabsSidebarConstants'

const getTabLabel = (tab?: Pick<Tab, 'title' | 'url'> | null) => tab?.title || tab?.url || t('tabs.new')

export const TabRow = memo<{
  collapsed?: boolean
  groupId: string | null
  index: number
  isActive: boolean
  tab: Tab
}>(({ collapsed = false, groupId, index, isActive, tab }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${TAB_DND_PREFIX}${tab.id}`,
    data: { type: 'tab', tabId: tab.id, groupId, index },
  })
  const profileColor = getProfileColor(tab.profile)
  const tabLabel = getTabLabel(tab)
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
  const row = collapsed ? (
    <div className="group relative">
      <Pressable
        className={clsx(
          'h-9 w-9 items-center justify-center rounded-lg transition-colors',
          isActive
            ? 'bg-white shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-700 dark:ring-zinc-500/70'
            : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800',
        )}
        onPress={() => {
          tabGroups$.setActiveGroup(groupId)
          tabs$.setActiveTabById(tab.id, 'user')
        }}
      >
        <View style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, backgroundColor: profileColor }} />
        {favicon}
      </Pressable>
      <div
        title={t('menus.close')}
        className="absolute -right-1 -top-1 hidden group-hover:block"
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
      >
        <Pressable
          className="h-4 w-4 items-center justify-center rounded-full bg-zinc-200 shadow-sm hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          onPress={() => tabs$.closeTab(tabs$.tabs.get().findIndex((currentTab) => currentTab.id === tab.id))}
        >
          <MaterialIcons name="close" size={10} color="#a1a1aa" />
        </Pressable>
      </div>
    </div>
  ) : (
    <Pressable
      className={clsx(
        'min-h-8 flex-row items-center gap-2 rounded-md px-2 py-1 transition-colors',
        isActive
          ? 'bg-white shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-700 dark:ring-zinc-500/70'
          : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800',
      )}
      onPress={() => {
        tabGroups$.setActiveGroup(groupId)
        tabs$.setActiveTabById(tab.id, 'user')
      }}
    >
      <View className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: profileColor }} />
      <View className="h-4 w-4 shrink-0 items-center justify-center">{favicon}</View>
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
      <div title={t('menus.close')}>
        <Pressable
          className="h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800"
          onPress={() => tabs$.closeTab(tabs$.tabs.get().findIndex((currentTab) => currentTab.id === tab.id))}
        >
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
  const items = useTabContextMenuItems(tab, { runWebviewAction })
  const titleAttr = collapsed ? [tabLabel, tab.url].filter(Boolean).join('\n') : tab.url || undefined

  return (
    <div
      ref={setNodeRef}
      title={titleAttr}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <NouContextMenu items={items}>{row}</NouContextMenu>
    </div>
  )
})
TabRow.displayName = 'TabRow'

export const TabRowPreview: React.FC<{ tab: Tab; collapsed?: boolean }> = ({ tab, collapsed = false }) => {
  const profileColor = getProfileColor(tab.profile)
  if (collapsed) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 36,
          width: 36,
          borderRadius: 8,
          background: '#ffffff',
          boxShadow: '0 10px 20px rgba(0,0,0,0.18)',
          cursor: 'grabbing',
          zIndex: 9999,
        }}
      >
        <span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, backgroundColor: profileColor }} />
        <ServiceIcon url={tab.url} icon={tab.icon} />
      </div>
    )
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 32,
        padding: '4px 8px',
        borderRadius: 6,
        background: '#ffffff',
        boxShadow: '0 10px 20px rgba(0,0,0,0.18)',
        cursor: 'grabbing',
        zIndex: 9999,
      }}
    >
      <span style={{ width: 4, height: 20, borderRadius: 999, backgroundColor: profileColor, flexShrink: 0 }} />
      <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <ServiceIcon url={tab.url} icon={tab.icon} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          fontWeight: 500,
          color: '#18181b',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {getTabLabel(tab)}
      </span>
    </div>
  )
}
