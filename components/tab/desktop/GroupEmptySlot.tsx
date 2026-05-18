import React from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useValue } from '@legendapp/state/react'
import { Pressable, View } from 'react-native'
import { t } from 'i18next'
import { clsx } from '@/lib/utils'
import { getProfileColor } from '@/lib/profile'
import { AUTO_PROFILE_ID } from '@/lib/site-profile'
import { settings$ } from '@/states/settings'
import { tabGroups$, type TabGroup } from '@/states/tab-groups'
import { openDesktopTab, type Tab, tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { NouText } from '@/components/NouText'
import { ServiceIcon } from '@/components/service/Services'
import { getLayoutLabel, getSlotStyle, getTabLabel } from './desktopWorkspaceShared'
import { focusDesktopGroupSlot } from './desktopWorkspaceState'

export const GroupEmptySlot: React.FC<{
  activeSlotIndex: number | null
  group: TabGroup
  isSplit: boolean
  orderedTabs: Tab[]
  slotIndex: number
  tabIdSet: Set<string>
}> = React.memo(({ activeSlotIndex, group, isSplit, orderedTabs, slotIndex, tabIdSet }) => {
  const lastSelectedProfileId = useValue(ui$.lastSelectedProfileId)
  const oneProfilePerSite = useValue(settings$.oneProfilePerSite)
  const selectedProfileId = oneProfilePerSite ? AUTO_PROFILE_ID : lastSelectedProfileId
  const profileColor = getProfileColor(selectedProfileId)
  const isActive = slotIndex === activeSlotIndex
  const canCloseSlot = isSplit && slotIndex >= 2 && group.tabIds.length > 2
  const usedTabIds = new Set(group.tabIds.filter((tabId): tabId is string => Boolean(tabId)))
  const availableTabs = orderedTabs.filter((tab) => !usedTabIds.has(tab.id) && tabIdSet.has(tab.id))

  const onActivate = () => focusDesktopGroupSlot(group.id, slotIndex)

  const createTabInSlot = () => {
    onActivate()
    const tabId =
      selectedProfileId === AUTO_PROFILE_ID
        ? openDesktopTab('', { profileMode: 'auto' })
        : openDesktopTab('', { profile: selectedProfileId, profileMode: 'manual' })
    if (tabId) {
      tabGroups$.assignGroupSlot(group.id, slotIndex, tabId)
      tabs$.setActiveTabById(tabId, 'open')
    }
  }

  const assignExistingTab = (tabId: string) => {
    onActivate()
    tabGroups$.assignGroupSlot(group.id, slotIndex, tabId)
    tabs$.setActiveTabById(tabId, 'user')
  }

  return (
    <div
      className={clsx(
        isSplit
          ? 'flex-1 min-w-0 min-h-0 overflow-hidden rounded-xl border transition-all'
          : 'absolute overflow-hidden rounded-xl border transition-all',
        isActive
          ? 'border-indigo-400/60 bg-indigo-50/40 shadow-[0_0_0_2px_rgba(165,180,252,0.4)] dark:border-indigo-400/50 dark:bg-indigo-400/10'
          : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900',
      )}
      style={isSplit ? { flex: 1, minWidth: 0, order: slotIndex } : getSlotStyle(group.layout === 'grid-4' ? 'grid-4' : 'split-view', slotIndex)}
      onClick={onActivate}
    >
      <View className="flex h-full min-h-0 min-w-0 flex-col">
        <View
          className={clsx(
            'flex-row items-center justify-between gap-2 pl-2 pr-1 transition-colors border-b',
            isActive
              ? 'bg-indigo-100 border-indigo-200 dark:bg-indigo-400/25 dark:border-indigo-300/40'
              : 'bg-zinc-50 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700/50',
          )}
          style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36 }}
        >
          <ServiceIcon url="" />
          <NouText
            className={clsx(
              'min-w-0 flex-1 px-2 text-center text-[11px] font-bold tracking-wider',
              isActive ? 'text-indigo-950 dark:text-indigo-50' : 'text-zinc-500 dark:text-zinc-400',
            )}
            numberOfLines={1}
          >
            {t('tabs.new')}
          </NouText>
          {canCloseSlot ? (
            <Pressable
              className="h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-zinc-700/60"
              onPress={() => tabGroups$.removeSplitGroupSlot(group.id, slotIndex)}
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
            isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'bg-white dark:bg-zinc-900',
          )}
        >
          <View className="mx-auto w-full max-w-[28rem] items-center">
            <NouText
              className="mb-6 w-full text-center text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50"
              numberOfLines={2}
            >
              {t('views.desktop.chooseTabToAdd', { layout: getLayoutLabel(group.layout) })}
            </NouText>
            <View className="w-full overflow-hidden rounded-[28px] border border-zinc-200 bg-white/95 shadow-sm shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950/90">
              <Pressable className="flex-row items-center gap-3 px-5 py-4 active:bg-zinc-100 dark:active:bg-zinc-900" onPress={createTabInSlot}>
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <MaterialIcons name="add" size={20} color="#f97316" />
                </View>
                <View className="min-w-0 flex-1">
                  <NouText className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t('tabs.new')}</NouText>
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
})

GroupEmptySlot.displayName = 'GroupEmptySlot'
