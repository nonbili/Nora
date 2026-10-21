import { useState } from 'react'
import { Pressable, ScrollView, TextInput, View, useColorScheme } from 'react-native'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { BottomSheet, RNHostView } from '@expo/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { EmojiGrid } from '../EmojiGrid'
import { NouText } from '../NouText'
import { NouSwitch } from '../switch/NouSwitch'
import { ChoicePicker, formatInterval } from '../feed/FeedView'
import { ui$ } from '@/states/ui'
import { watch$ } from '@/states/watch'
import { settings$ } from '@/states/settings'
import {
  DEFAULT_TIMELINE_EMOJI,
  POSTS_PER_SOURCE_OPTIONS,
  WATCH_ACCOUNT_SITES,
  WATCH_INTERVAL_OPTIONS,
  cleanEmoji,
  watchSiteLabels,
} from '@/lib/watch'
import { isAnonymousProfile } from '@/lib/anonymous'
import { clearWatchMedia, watchMedia$ } from '@/lib/watch-media'
import { confirmDestructiveAction } from '@/lib/confirm'
import { useTwColor } from '@/lib/theme'
import { clsx, isWeb } from '@/lib/utils'

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
  const insets = useSafeAreaInsets()
  const defaultInterval = useValue(watch$.checkIntervalMinutes)
  const mediaWifiOnly = useValue(watch$.mediaWifiOnly)
  const mediaLimitMB = useValue(watch$.mediaLimitMB)
  const postsPerSource = useValue(watch$.postsPerSource)
  const useAccounts = useValue(watch$.useAccounts)
  const feedPinned = useValue(watch$.feedPinned)
  const feedEmoji = useValue(watch$.feedEmoji)
  const [pickingEmoji, setPickingEmoji] = useState(false)
  const accountProfiles = useValue(watch$.accountProfiles)
  const profiles = useValue(() =>
    settings$.profiles.get().filter((profile) => profile && !isAnonymousProfile(profile.id)),
  )
  const mediaUsedBytes = useValue(() =>
    Object.values(watchMedia$.files.get()).reduce((sum, kept) => sum + (kept?.bytes || 0), 0),
  )

  const onClose = () => ui$.feedSettingsModalOpen.set(false)

  // A phone's sheet stays there while it slides away; the desktop's dialog goes at once.
  if (!open && isWeb) {
    return null
  }

  const iconColor = isDark ? tw('#f8fafc') : tw('#334155')

  const clearMedia = () => {
    confirmDestructiveAction(t('feed.mediaClear'), t('feed.mediaClearConfirm'), t('feed.mediaClear'), clearWatchMedia)
  }

  const list = (
    <ScrollView style={{ flexShrink: 1 }} contentContainerClassName="rounded-xl bg-white px-4 dark:bg-zinc-900">
      <NouSwitch
        className="py-3"
        label={t('feed.showOnNewTab')}
        value={feedPinned}
        onPress={() => watch$.feedPinned.set(!feedPinned)}
      />
      <Divider />
      <View className="flex-row items-center justify-between gap-3 py-3">
        <NouText className="flex-1">{t('feed.emoji')}</NouText>
        <Pressable
          onPress={() => setPickingEmoji((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={t('feed.emojiPicker')}
          accessibilityState={{ expanded: pickingEmoji }}
          className="h-10 w-10 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700"
        >
          <MaterialIcons name={pickingEmoji ? 'expand-less' : 'emoji-emotions'} size={22} color={iconColor} />
        </Pressable>
        <TextInput
          className="w-16 rounded-md border border-zinc-300 bg-zinc-100 px-2 py-2 text-center text-lg text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          value={feedEmoji}
          onChangeText={(value) => watch$.feedEmoji.set(cleanEmoji(value) ?? '')}
          placeholder={DEFAULT_TIMELINE_EMOJI}
          placeholderTextColor={tw('#9ca3af')}
          maxLength={16}
          autoCorrect={false}
          accessibilityLabel={t('feed.emoji')}
        />
      </View>
      {pickingEmoji ? (
        <EmojiGrid value={feedEmoji} onSelect={(selected) => watch$.feedEmoji.set(selected === feedEmoji ? '' : selected)} />
      ) : null}
      <Divider />
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
      <View className="py-3">
        <NouSwitch
          label={t('feed.useAccounts')}
          value={useAccounts}
          onPress={() => watch$.useAccounts.set(!useAccounts)}
        />
        <Hint>
          {t('feed.useAccountsHint', {
            sites: WATCH_ACCOUNT_SITES.map((site) => watchSiteLabels[site]).join(', '),
          })}
        </Hint>
      </View>
      {useAccounts && profiles.length > 1
        ? WATCH_ACCOUNT_SITES.map((site) => {
            // The menu gives back a number: the place of the profile in the list, or none for any.
            const chosen = profiles.find((profile) => profile.id === accountProfiles[site])
            return (
              <View key={site} className="pb-3">
                <ChoicePicker
                  label={t('feed.accountFrom', { site: watchSiteLabels[site] })}
                  value={chosen?.name ?? t('feed.accountAnyProfile')}
                  options={[
                    { label: t('feed.accountAnyProfile'), minutes: undefined },
                    ...profiles.map((profile, index) => ({ label: profile.name, minutes: index })),
                  ]}
                  onSelect={(index) =>
                    watch$.accountProfiles[site].set(index === undefined ? undefined : profiles[index].id)
                  }
                  iconColor={iconColor}
                />
              </View>
            )
          })
        : null}
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
  )

  if (!isWeb) {
    return (
      <BottomSheet
        isPresented={open}
        onDismiss={onClose}
        snapPoints={['half', 'full']}
        // Material's own handle has a wide margin above and below: a tighter one is drawn instead.
        showDragIndicator={false}
        // The sheet's own inset would not narrow the views inside it: they are padded themselves.
        contentPadding={0}
        containerColor={isDark ? tw('#030712') : tw('#f4f4f5')}
      >
        {/* Hosted, so that touches reach the views inside: a native switch works without, a Pressable not.
            It fills the sheet, whose full height bounds the list: on a short screen the list scrolls. */}
        <RNHostView>
          <View className="flex-1 px-4" style={{ paddingBottom: insets.bottom + 16 }}>
            <View
              style={{ width: 32, height: 4, borderRadius: 2, marginTop: 16, marginBottom: 16, alignSelf: 'center', backgroundColor: isDark ? tw('#52525b') : tw('#a1a1aa') }}
            />
            <NouText className="mb-3 text-lg font-bold">{t('feed.settings')}</NouText>
            {list}
          </View>
        </RNHostView>
      </BottomSheet>
    )
  }

  return (
    <BaseCenterModal onClose={onClose}>
      {/* On a short screen, the settings scroll between the title and Close. */}
      <View className="w-full p-4" style={{ flexShrink: 1 }}>
        <NouText className="mb-4 text-lg font-bold">{t('feed.settings')}</NouText>
        {list}
        <View className="mt-6 flex-row justify-end">
          <NouButton size="1" onPress={onClose}>
            {t('menus.close')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
