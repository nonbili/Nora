import { Pressable, ScrollView, View, useColorScheme } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { NouSwitch } from '../switch/NouSwitch'
import { ChoicePicker, formatInterval } from '../feed/FeedView'
import { ui$ } from '@/states/ui'
import { watch$ } from '@/states/watch'
import { POSTS_PER_SOURCE_OPTIONS, WATCH_INTERVAL_OPTIONS } from '@/lib/watch'
import { clearWatchMedia, watchMedia$ } from '@/lib/watch-media'
import { confirmDestructiveAction } from '@/lib/confirm'
import { useTwColor } from '@/lib/theme'
import { clsx } from '@/lib/utils'

const MEDIA_LIMIT_OPTIONS_MB = [250, 500, 1024, 2048, 5120]

const formatMegabytes = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)

const Divider = () => <View className="h-px bg-zinc-200 dark:bg-zinc-800" />

const Hint: React.FC<{ children: string }> = ({ children }) => (
  <NouText className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{children}</NouText>
)

/** How often the feed is checked and how many of its posts and how much of its media are kept, for every source. */
export const FeedSettingsModal = () => {
  const tw = useTwColor()
  const isDark = useColorScheme() === 'dark'
  const open = useValue(ui$.feedSettingsModalOpen)
  const defaultInterval = useValue(watch$.checkIntervalMinutes)
  const mediaWifiOnly = useValue(watch$.mediaWifiOnly)
  const mediaLimitMB = useValue(watch$.mediaLimitMB)
  const postsPerSource = useValue(watch$.postsPerSource)
  const mediaUsedBytes = useValue(() =>
    Object.values(watchMedia$.files.get()).reduce((sum, kept) => sum + (kept?.bytes || 0), 0),
  )

  const onClose = () => ui$.feedSettingsModalOpen.set(false)

  if (!open) {
    return null
  }

  const iconColor = isDark ? tw('#f8fafc') : tw('#334155')

  const clearMedia = () => {
    confirmDestructiveAction(t('feed.mediaClear'), t('feed.mediaClearConfirm'), t('feed.mediaClear'), clearWatchMedia)
  }

  return (
    <BaseCenterModal onClose={onClose}>
      {/* On a short screen, as a phone held sideways, the settings scroll between the title and Close. */}
      <View className="w-full p-4" style={{ flexShrink: 1 }}>
        <NouText className="mb-4 text-lg font-bold">{t('feed.settings')}</NouText>
        <ScrollView style={{ flexShrink: 1 }} contentContainerClassName="rounded-xl bg-white px-4 dark:bg-zinc-900">
          <View className="py-3">
            <ChoicePicker
              label={t('feed.checkEvery')}
              value={formatInterval(defaultInterval)}
              options={WATCH_INTERVAL_OPTIONS.map((minutes) => ({ label: formatInterval(minutes), minutes }))}
              onSelect={(minutes) => minutes && watch$.checkIntervalMinutes.set(minutes)}
              iconColor={iconColor}
            />
            <Hint>{t('feed.intervalHint')}</Hint>
          </View>
          <Divider />
          <View className="py-3">
            <ChoicePicker
              label={t('feed.postsPerSource')}
              value={String(postsPerSource)}
              options={POSTS_PER_SOURCE_OPTIONS.map((count) => ({ label: String(count), minutes: count }))}
              onSelect={(count) => count && watch$.postsPerSource.set(count)}
              iconColor={iconColor}
            />
            <Hint>{t('feed.postsPerSourceHint')}</Hint>
          </View>
          <Divider />
          <NouSwitch
            className="py-3"
            label={t('feed.mediaWifiOnly')}
            value={mediaWifiOnly}
            onPress={() => watch$.mediaWifiOnly.set(!mediaWifiOnly)}
          />
          <Divider />
          <View className="py-3">
            <ChoicePicker
              label={t('feed.mediaLimit')}
              value={formatMegabytes(mediaLimitMB)}
              options={MEDIA_LIMIT_OPTIONS_MB.map((mb) => ({ label: formatMegabytes(mb), minutes: mb }))}
              onSelect={(mb) => mb && watch$.mediaLimitMB.set(mb)}
              iconColor={iconColor}
            />
            <Hint>
              {t('feed.mediaUsage', {
                used: formatMegabytes(mediaUsedBytes / 1024 / 1024),
                limit: formatMegabytes(mediaLimitMB),
              })}
            </Hint>
          </View>
          <Divider />
          <Pressable onPress={clearMedia} disabled={!mediaUsedBytes} accessibilityRole="button">
            <View className="py-4">
              <NouText
                className={clsx(
                  'font-medium',
                  mediaUsedBytes ? 'text-red-600 dark:text-red-400' : 'text-zinc-400 dark:text-zinc-600',
                )}
              >
                {t('feed.mediaClear')}
              </NouText>
            </View>
          </Pressable>
        </ScrollView>
        <View className="mt-6 flex-row justify-end">
          <NouButton size="1" onPress={onClose}>
            {t('menus.close')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
