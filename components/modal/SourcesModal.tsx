import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { NouMenu } from '../menu/NouMenu'
import { Avatar, profileStatus } from '../feed/FeedView'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { watch$, type WatchedProfile } from '@/states/watch'
import {
  WATCH_SOURCE_SORTS,
  formatPostAge,
  sortWatchSources,
  watchProfileUrl,
  watchSiteLabels,
  watchSourceLabel,
  type WatchSourceSort,
} from '@/lib/watch'
import { confirmDestructiveAction } from '@/lib/confirm'
import { useTwColor } from '@/lib/theme'
import { clsx } from '@/lib/utils'

const sortLabelKeys = {
  name: 'feed.sortName',
  updated: 'feed.sortUpdated',
  added: 'feed.sortAdded',
  synced: 'feed.sortSynced',
} as const satisfies Record<WatchSourceSort, string>

/** Every watched source in one list, in the order chosen, to open or to stop watching. */
export const SourcesModal = () => {
  const target = useValue(ui$.sourcesModal)
  // Mounted only while open, so that ages are told from when the list was opened.
  return target ? <SourcesList tabId={target.tabId} /> : null
}

const SourcesList: React.FC<{ tabId?: string }> = ({ tabId }) => {
  const tw = useTwColor()
  const profiles = useValue(watch$.profiles)
  const posts = useValue(watch$.posts)
  const sort = useValue(watch$.sourcesSort)
  const reversed = useValue(watch$.sourcesSortReversed)
  const [now] = useState(() => Date.now())

  const onClose = () => ui$.sourcesModal.set(null)

  const iconColor = tw('#71717a')
  const sorted = sortWatchSources(profiles, posts, sort, reversed)

  // Back in the opened tab comes back to the feed.
  const open = (profile: WatchedProfile) => {
    tabs$.openTab(watchProfileUrl(profile), { source: 'child', parentTabId: tabId })
    onClose()
  }

  const unwatch = (profile: WatchedProfile) => {
    const source = watchSourceLabel(profile)
    confirmDestructiveAction(
      t('feed.unwatch'),
      t('feed.unwatchConfirm', { handle: profile.handle, source, interpolation: { escapeValue: false } }),
      t('feed.unwatch'),
      () => watch$.unwatch(profile.key),
    )
  }

  const details = (profile: WatchedProfile) => {
    const list = posts[profile.key]
    const newest = list?.length ? Math.max(...list.map((post) => post.createdAtMs)) : undefined
    return [
      watchSiteLabels[profile.site],
      newest ? t('feed.lastPost', { age: formatPostAge(newest, now) }) : t('feed.noPostsYet'),
      profile.lastSuccessAt ? t('feed.syncedAgo', { age: formatPostAge(profile.lastSuccessAt, now) }) : t('feed.neverSynced'),
    ].join(' · ')
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="w-full p-4">
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <View className="shrink">
            <NouText className="text-lg font-bold">{t('feed.manageSources')}</NouText>
            <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('feed.sourcesCount', { count: profiles.length })}</NouText>
          </View>
          <View className="flex-row items-center gap-2">
            <NouMenu
              trigger={
                <View className="h-9 flex-row items-center gap-1 rounded-full border border-zinc-300 pl-3 pr-2 dark:border-zinc-700">
                  <NouText className="text-sm">{t(sortLabelKeys[sort])}</NouText>
                  <MaterialIcons name="arrow-drop-down" size={18} color={iconColor} />
                </View>
              }
              items={[
                { label: t('feed.sortBy'), handler: () => {}, kind: 'label' as const },
                ...WATCH_SOURCE_SORTS.map((current) => ({
                  label: t(sortLabelKeys[current]),
                  icon: current === sort ? <MaterialIcons name="check" size={18} color={iconColor} /> : undefined,
                  systemImage: current === sort ? 'checkmark' : undefined,
                  handler: () => watch$.sourcesSort.set(current),
                })),
              ]}
            />
            <Pressable
              onPress={() => watch$.sourcesSortReversed.set(!reversed)}
              accessibilityRole="switch"
              accessibilityLabel={t('feed.sortReversed')}
              accessibilityState={{ checked: reversed }}
              className={clsx(
                'h-9 w-9 items-center justify-center rounded-full border',
                reversed
                  ? 'border-indigo-300 bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/20'
                  : 'border-zinc-300 dark:border-zinc-700',
              )}
            >
              <MaterialIcons name="swap-vert" size={18} color={iconColor} />
            </Pressable>
          </View>
        </View>
        {sorted.length ? (
          <ScrollView style={{ maxHeight: 420 }}>
            {sorted.map((profile) => {
              const status = profileStatus(profile)
              return (
                <View key={profile.key} className="flex-row items-center gap-3 py-2">
                  <Pressable onPress={() => open(profile)} className="min-w-0 flex-1 flex-row items-center gap-3">
                    <Avatar uri={profile.avatar} size={32} site={profile.site} />
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <NouText className="shrink" numberOfLines={1}>
                          {profile.name ? `${profile.name} ` : ''}
                          <NouText className="text-zinc-600 dark:text-zinc-400">{watchSourceLabel(profile)}</NouText>
                        </NouText>
                        {status?.warn ? <View className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
                      </View>
                      <NouText className="text-xs text-zinc-500" numberOfLines={1}>
                        {details(profile)}
                      </NouText>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => unwatch(profile)}
                    accessibilityRole="button"
                    accessibilityLabel={t('feed.unwatch')}
                    className="h-9 w-9 items-center justify-center rounded-full"
                  >
                    <MaterialIcons name="remove-circle-outline" size={20} color={tw('#dc2626')} />
                  </Pressable>
                </View>
              )
            })}
          </ScrollView>
        ) : (
          <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('feed.empty')}</NouText>
        )}
        <View className="mt-4 flex-row justify-end">
          <NouButton size="1" variant="outline" onPress={onClose}>
            {t('menus.close')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
