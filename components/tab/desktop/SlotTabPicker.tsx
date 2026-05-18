import React from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Pressable, View } from 'react-native'
import { t } from 'i18next'
import { clsx } from '@/lib/utils'
import { ServiceIcon } from '@/components/service/Services'
import { NouMenu } from '@/components/menu/NouMenu'
import { NouText } from '@/components/NouText'
import { type CustomSavedView, savedViews$ } from '@/states/saved-views'
import { openDesktopTab, type Tab, tabs$ } from '@/states/tabs'
import { getTabLabel } from './desktopWorkspaceShared'

export const SlotTabPicker: React.FC<{
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

  const items = availableTabs.map((tab) => ({
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
  }))

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
          label: t('tabs.new'),
          description: t('views.desktop.createBlankTabInSlot'),
          icon: <MaterialIcons name="add" size={16} color="#f97316" />,
          handler: () => {
            onActivate()
            const tabId = openDesktopTab('')
            if (tabId) {
              view$.slotTabIds[slotIndex].set(tabId)
              tabs$.setActiveTabById(tabId, 'open')
            }
          },
        },
        ]}
        />
        )
        }
