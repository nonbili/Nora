import { useMemo } from 'react'
import { Pressable, ScrollView, View, useColorScheme, useWindowDimensions } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { NouMenu } from '../menu/NouMenu'
import { NouText } from '../NouText'
import { DECK_VIEW_ID, type CustomSavedViewLayout, createDesktopSavedView, savedViews$ } from '@/states/saved-views'
import { sortTabsByOrder, tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { clsx, nIf } from '@/lib/utils'
import { openTabForActiveDesktopView } from '@/lib/desktop-view-actions'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { NouContextMenu, type ContextItem } from '../menu/NouContextMenu'
import { t } from 'i18next'

const getFirstVisibleTabId = (viewId: string, viewTabIds: Record<string, string[]>, orderedTabIds: string[]) => {
  if (viewId === DECK_VIEW_ID) {
    return orderedTabIds[0]
  }
  return viewTabIds[viewId]?.find(Boolean)
}

const ViewTypeIcon = ({ layout, size = 20, color = '#71717a' }: { layout: string; size?: number; color?: string }) => {
  let name: React.ComponentProps<typeof MaterialIcons>['name'] = 'view-column'
  if (layout === 'split-view') name = 'view-week'
  if (layout === 'grid-4') name = 'grid-view'
  if (layout === 'deck') name = 'home'

  return <MaterialIcons name={name} size={size} color={color} />
}

export const SavedViewsPicker = () => {
  const activeViewId = useValue(savedViews$.activeViewId)
  const savedViews = useValue(savedViews$.savedViews)
  const tabs = useValue(tabs$.tabs)
  const orders = useValue(tabs$.orders)
  const { width } = useWindowDimensions()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const activeView = savedViews.find((view) => view.id === activeViewId) || null
  const isVertical = width >= 1024

  const orderedTabs = sortTabsByOrder(tabs, orders)
  const orderedTabIds = orderedTabs.map((tab) => tab.id)
  const tabIdSet = useMemo(() => new Set(orderedTabIds), [orderedTabIds.join('|')])
  const viewTabIds = useMemo(
    () =>
      Object.fromEntries(
        savedViews.map((view) => [
          view.id,
          view.slotTabIds.filter((tabId): tabId is string => typeof tabId === 'string' && tabIdSet.has(tabId)),
        ]),
      ),
    [savedViews, tabIdSet],
  )

  const focusView = (viewId: string) => {
    savedViews$.setActiveView(viewId)
    const tabId = getFirstVisibleTabId(viewId, viewTabIds, orderedTabIds)
    if (tabId) {
      tabs$.setActiveTabById(tabId, 'user')
    }
  }

  const createView = (layout: CustomSavedViewLayout) => {
    const viewId = createDesktopSavedView(layout, orderedTabIds)
    const tabId = getFirstVisibleTabId(viewId, viewTabIds, orderedTabIds) || orderedTabIds[0]
    if (tabId) {
      tabs$.setActiveTabById(tabId, 'system')
    }
  }

  const quickViews = [
    { id: DECK_VIEW_ID, label: '', layout: 'deck', meta: '' },
    ...savedViews.map((view) => ({
      id: view.id,
      label: view.name,
      layout: view.layout,
      meta: view.layout === 'split-view' ? t('views.desktop.layout.split') : t('views.desktop.layout.gridFour'),
    })),
  ]

  return (
    <>
      <View className="items-center w-full">
        <ScrollView
          horizontal={!isVertical}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          className={clsx('w-full flex-grow-0', isVertical && 'max-h-[50vh]')}
          contentContainerClassName={clsx('items-center', isVertical ? 'gap-3' : 'gap-2 px-1')}
        >
          {quickViews.map((view) => {
            const isActive = view.id === activeViewId
            const contextItems: ContextItem[] =
              view.id === DECK_VIEW_ID
                ? []
                : [
                    {
                      label: t('views.rename'),
                      icon: <MaterialIcons name="edit" size={14} color="#71717a" />,
                      handler: () => {
                        ui$.renameViewModalTargetViewId.set(view.id)
                      },
                    },
                    {
                      label: t('menus.delete'),
                      icon: <MaterialIcons name="delete" size={14} color="#f87171" />,
                      color: 'red',
                      handler: () => savedViews$.deleteView(view.id),
                    },
                  ]

            const content = (
              <Pressable onPress={() => focusView(view.id)}>
                <View className="items-center">
                  <View
                    className={clsx(
                      'w-10 h-10 items-center justify-center rounded-xl transition-all duration-200',
                      isActive
                        ? isDark
                          ? 'border border-indigo-400/30 bg-indigo-500/25'
                          : 'border border-indigo-300 bg-indigo-500/12 shadow-sm shadow-indigo-500/10'
                        : isDark
                          ? 'border border-zinc-800/50 bg-zinc-900/50 hover:bg-zinc-800'
                          : 'border border-zinc-300 bg-white hover:bg-zinc-100 shadow-sm shadow-zinc-900/5',
                    )}
                  >
                    <ViewTypeIcon
                      layout={view.layout}
                      color={isActive ? (isDark ? '#f4f4f5' : '#312e81') : isDark ? '#a1a1aa' : '#52525b'}
                      size={22}
                    />
                  </View>
                  {nIf(
                    isVertical && view.label,
                    <NouText
                      className={clsx(
                        'mt-1 max-w-[48px] text-xs text-center',
                        isActive
                          ? isDark
                            ? 'text-zinc-300'
                            : 'text-zinc-700'
                          : isDark
                            ? 'text-zinc-500'
                            : 'text-zinc-500',
                      )}
                      numberOfLines={1}
                    >
                      {view.label}
                    </NouText>,
                  )}
                </View>
              </Pressable>
            )

            if (!contextItems.length) return <View key={view.id}>{content}</View>

            return (
              <NouContextMenu key={view.id} items={contextItems}>
                {content}
              </NouContextMenu>
            )
          })}
          <NouMenu
            trigger={
              <Pressable
                className={clsx(
                  'w-10 h-10 items-center justify-center rounded-xl border',
                  isDark
                    ? 'border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-800'
                    : 'border-zinc-300 bg-white hover:bg-zinc-100 shadow-sm shadow-zinc-900/5',
                  isVertical ? 'mt-2' : 'ml-2',
                )}
              >
                <MaterialIcons name="add" size={20} color={isDark ? '#a1a1aa' : '#52525b'} />
              </Pressable>
            }
            items={[
              ...(activeView?.layout === 'grid-4'
                ? []
                : [
                    {
                      label: t('tabs.new'),
                      icon: <MaterialIcons name="add" size={14} color="#71717a" />,
                      handler: openTabForActiveDesktopView,
                    },
                  ]),
              {
                label: t('views.desktop.newSplitView'),
                icon: <ViewTypeIcon layout="split-view" size={14} />,
                handler: () => createView('split-view'),
              },
              {
                label: t('views.desktop.newGridView'),
                icon: <ViewTypeIcon layout="grid-4" size={14} />,
                handler: () => createView('grid-4'),
              },
            ]}
          />
        </ScrollView>
      </View>
    </>
  )
}
