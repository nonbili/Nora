import React from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useValue } from '@legendapp/state/react'
import { Pressable, View } from 'react-native'
import { t } from 'i18next'
import { clsx } from '@/lib/utils'
import { getProfileColor } from '@/lib/profile'
import { NouText } from '@/components/NouText'
import { ServiceIcon } from '@/components/service/Services'
import { type CustomSavedView, savedViews$ } from '@/states/saved-views'
import { openDesktopTab, type Tab, tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { getSlotStyle, getTabLabel } from './desktopWorkspaceShared'
import { AUTO_PROFILE_ID } from '@/lib/site-profile'
import { settings$ } from '@/states/settings'

export const EmptySlot: React.FC<{
  isActive: boolean
  onActivate: () => void
  slotIndex: number
  orderedTabs: Tab[]
  tabIdSet: Set<string>
  view: CustomSavedView
  isSplit?: boolean
}> = ({ isActive, onActivate, slotIndex, orderedTabs, tabIdSet, view, isSplit }) => {
  const lastSelectedProfileId = useValue(ui$.lastSelectedProfileId)
  const oneProfilePerSite = useValue(settings$.oneProfilePerSite)
  const selectedProfileId = oneProfilePerSite ? AUTO_PROFILE_ID : lastSelectedProfileId
  const profileColor = getProfileColor(selectedProfileId)
  const canCloseSlot = isSplit && slotIndex >= 2 && view.slotTabIds.length > 2
  const usedTabIds = new Set(view.slotTabIds.filter((tabId): tabId is string => Boolean(tabId)))
  const availableTabs = orderedTabs.filter((tab) => !usedTabIds.has(tab.id) && tabIdSet.has(tab.id))
  const targetLayoutLabel =
    view.layout === 'split-view' ? t('views.desktop.layout.split') : t('views.desktop.layout.grid')

  const createTabInSlot = (url: string, profileId: string) => {
    onActivate()
    const tabId =
      profileId === AUTO_PROFILE_ID
        ? openDesktopTab(url, { profileMode: 'auto' })
        : openDesktopTab(url, { profile: profileId, profileMode: 'manual' })
    if (tabId) {
      savedViews$.assignSlotTab(view.id, slotIndex, tabId)
      tabs$.setActiveTabById(tabId, 'open')
    }
  }

  const assignExistingTab = (tabId: string) => {
    onActivate()
    savedViews$.assignSlotTab(view.id, slotIndex, tabId)
    tabs$.setActiveTabById(tabId, 'user')
  }

  return (
    <div
      className={clsx(
        isSplit
          ? clsx(
              'flex-1 min-w-0 h-full overflow-hidden border transition-all',
              isActive
                ? 'border-indigo-300 bg-indigo-50/40 shadow-[0_0_0_1px_rgba(165,180,252,0.9)] dark:border-indigo-300/40 dark:bg-indigo-400/10'
                : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950',
            )
          : clsx(
              'absolute overflow-hidden border transition-all',
              isActive
                ? 'border-indigo-300 bg-indigo-50/40 shadow-[0_0_0_1px_rgba(165,180,252,0.9)] dark:border-indigo-300/40 dark:bg-indigo-400/10'
                : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950',
            ),
      )}
      style={!isSplit ? getSlotStyle(view.layout, slotIndex) : { flex: 1, minWidth: 0, order: slotIndex }}
      onClick={onActivate}
    >
      <View className="flex h-full min-h-0 min-w-0 flex-col">
        <View
          className={clsx(
            'flex-row items-center justify-between gap-2 pl-2 pr-1 transition-colors',
            isActive ? 'bg-indigo-100 dark:bg-indigo-400/25' : 'bg-zinc-100 dark:bg-zinc-800',
          )}
          style={{ borderLeftWidth: 4, borderLeftColor: profileColor, height: 36 }}
        >
          <View className="flex-row items-center gap-2 shrink-0">
            <ServiceIcon url="" />
          </View>
          <View className="flex-1 min-w-0 flex-row items-center justify-center">
            <NouText
              className={clsx(
                'text-[11px] font-bold tracking-wider text-center px-2',
                isActive ? 'text-indigo-950 dark:text-indigo-50' : 'text-zinc-500 dark:text-zinc-400',
              )}
            >
              {t('tabs.new')}
            </NouText>
          </View>
          {canCloseSlot ? (
            <Pressable
              className="h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-zinc-700/60"
              onPress={() => savedViews$.removeSplitViewSlot(view.id, slotIndex)}
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
            isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'bg-zinc-50 dark:bg-zinc-900',
          )}
        >
          <View className="mx-auto w-full max-w-[28rem] items-center">
            <NouText
              className="mb-6 w-full text-center text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50"
              numberOfLines={2}
            >
              {t('views.desktop.chooseTabToAdd', { layout: targetLayoutLabel })}
            </NouText>
            <View className="w-full overflow-hidden rounded-[28px] border border-zinc-200 bg-white/95 shadow-sm shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950/90">
              <Pressable
                className="flex-row items-center gap-3 px-5 py-4 active:bg-zinc-100 dark:active:bg-zinc-900"
                onPress={() => createTabInSlot('', selectedProfileId)}
              >
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
}
