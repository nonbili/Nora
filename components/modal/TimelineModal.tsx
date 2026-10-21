import { useEffect, useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { FormModal } from './FormModal'
import { NouButton } from '../button/NouButton'
import { EmojiButton, EmojiPicker } from '../EmojiPicker'
import { NouText } from '../NouText'
import { Avatar } from '../feed/FeedView'
import { NouSwitch } from '../switch/NouSwitch'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { watch$ } from '@/states/watch'
import { feedTabUrl } from '@/lib/feed-tab'
import { DEFAULT_TIMELINE_EMOJI, cleanEmoji, watchSourceLabel } from '@/lib/watch'
import { confirmDestructiveAction } from '@/lib/confirm'
import { enableTimelineNotifications } from '@/lib/watch-feed'
import { showToast } from '@/lib/toast'
import { useTwColor } from '@/lib/theme'
import { androidHitSlop, iosTouchTarget } from '@/lib/utils'

/** Shows a timeline in the feed tab it was asked for from, or the whole feed when it is gone. */
const showInTab = (tabId: string | undefined, timelineId?: string) => {
  const index = tabId ? tabs$.tabs.peek().findIndex((tab) => tab?.id === tabId) : -1
  if (index !== -1) tabs$.tabs[index].url.set(feedTabUrl(timelineId))
}

/** Makes a timeline, or changes one: its name and which of the watched profiles it shows. */
export const TimelineModal = () => {
  const tw = useTwColor()
  const target = useValue(ui$.timelineModal)
  const profiles = useValue(watch$.profiles)
  const [name, setName] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [emoji, setEmoji] = useState('')
  const [notify, setNotify] = useState(false)
  const [pickingEmoji, setPickingEmoji] = useState(false)

  useEffect(() => {
    if (!target) return
    const timeline = target.timelineId ? watch$.timelines.peek().find((current) => current.id === target.timelineId) : undefined
    setName(timeline?.name || '')
    setEmoji(timeline?.emoji || '')
    setNotify(Boolean(timeline && watch$.notifyTimelineIds.peek().includes(timeline.id)))
    setPickingEmoji(false)
    setSelectedKeys(timeline?.profileKeys || (target.profileKey ? [target.profileKey] : []))
  }, [target])

  const onClose = () => ui$.timelineModal.set(null)

  if (!target) {
    return null
  }

  const editing = Boolean(target.timelineId)
  const sourcesOnly = Boolean(target.sourcesOnly)
  const timelineName = watch$.timelines.peek().find((current) => current.id === target.timelineId)?.name ?? ''

  const toggle = (key: string) =>
    setSelectedKeys((keys) => (keys.includes(key) ? keys.filter((current) => current !== key) : [...keys, key]))

  // Turned on only once the system allows it to notify.
  const saveNotify = async (id: string) => {
    if (notify === watch$.notifyTimelineIds.peek().includes(id)) return
    if (!notify) watch$.setTimelineNotify(id, false)
    else if (!(await enableTimelineNotifications(id))) showToast(t('feed.notificationPermissionDenied'))
  }

  const save = () => {
    if (target.timelineId) {
      watch$.updateTimeline(
        target.timelineId,
        sourcesOnly ? { profileKeys: selectedKeys } : { name, profileKeys: selectedKeys, emoji: cleanEmoji(emoji) },
      )
      if (!sourcesOnly) void saveNotify(target.timelineId)
    } else {
      const id = watch$.createTimeline(name, selectedKeys)
      if (cleanEmoji(emoji)) watch$.updateTimeline(id, { emoji: cleanEmoji(emoji) })
      void saveNotify(id)
      showInTab(target.tabId, id)
    }
    onClose()
  }

  const remove = () => {
    const timelineId = target.timelineId
    if (!timelineId) return
    confirmDestructiveAction(t('feed.deleteTimeline'), t('feed.deleteTimelineConfirm', { name }), t('feed.deleteTimeline'), () => {
      watch$.deleteTimeline(timelineId)
      // Every tab that showed it shows the whole feed from now on.
      tabs$.tabs.peek().forEach((tab, index) => {
        if (tab?.url === feedTabUrl(timelineId)) tabs$.tabs[index].url.set(feedTabUrl())
      })
      onClose()
    })
  }

  return (
    <FormModal
      title={sourcesOnly ? t('feed.chooseSources') : editing ? t('feed.editTimeline') : t('feed.newTimeline')}
      onClose={onClose}
      onSubmit={save}
      submitLabel={t('buttons.save')}
      submitDisabled={!sourcesOnly && !name.trim()}
      footerAccessory={editing && !sourcesOnly ? (
        <NouButton size="1" variant="outline" textClassName="text-red-600 dark:text-red-400" onPress={remove}>
          {t('feed.deleteTimeline')}
        </NouButton>
      ) : undefined}
    >
      {!sourcesOnly ? (
        <View className="mb-3 flex-row gap-2">
          <EmojiButton value={cleanEmoji(emoji) ?? ''} placeholder={DEFAULT_TIMELINE_EMOJI} open={pickingEmoji} onPress={() => setPickingEmoji((value) => !value)} />
          <TextInput
            className="flex-1 rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            value={name}
            onChangeText={setName}
            placeholder={t('feed.timelineNamePlaceholder')}
            placeholderTextColor={tw('#9ca3af')}
            style={iosTouchTarget}
            autoFocus={!editing}
          />
        </View>
      ) : null}
      {/* The picker scrolls its own list, so it takes the place of the rest while it is open. */}
      {pickingEmoji && !sourcesOnly ? (
        <EmojiPicker
          value={emoji}
          onSelect={(selected) => {
            setEmoji(selected)
            setPickingEmoji(false)
          }}
        />
      ) : (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          {!sourcesOnly ? (
            <>
              <NouSwitch className="mb-1" label={t('feed.notifyTimeline')} value={notify} onPress={() => setNotify((value) => !value)} />
              <NouText className="mb-3 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{t('feed.notifyTimelineHint')}</NouText>
            </>
          ) : null}
          <NouText className="mb-2 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
            {t('feed.timelineSourcesHint', { name: sourcesOnly ? timelineName : name || t('feed.timelineThis') })}
          </NouText>
          {profiles.length ? (
            <View>
              {profiles.map((profile) => {
                const checked = selectedKeys.includes(profile.key)
                return (
                  <Pressable
                    key={profile.key}
                    onPress={() => toggle(profile.key)}
                    hitSlop={androidHitSlop}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    className="flex-row items-center gap-3 py-2"
                    style={iosTouchTarget}
                  >
                    <MaterialIcons
                      name={checked ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={checked ? tw('#6366f1') : tw('#a1a1aa')}
                    />
                    <Avatar uri={profile.avatar} size={32} site={profile.site} />
                    <NouText className="flex-1" numberOfLines={1}>
                      {profile.name ? `${profile.name} ` : ''}
                      <NouText className="text-zinc-600 dark:text-zinc-400">{watchSourceLabel(profile)}</NouText>
                    </NouText>
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('feed.empty')}</NouText>
          )}
        </ScrollView>
      )}
    </FormModal>
  )
}
