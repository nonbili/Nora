import { useEffect, useState } from 'react'
import { Pressable, ScrollView, TextInput } from 'react-native'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { FormModal } from './FormModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { watch$ } from '@/states/watch'
import { feedTabUrl } from '@/lib/feed-tab'
import { watchSiteLabels, watchSourceLabel } from '@/lib/watch'
import { confirmDestructiveAction } from '@/lib/confirm'
import { useTwColor } from '@/lib/theme'
import { isIos } from '@/lib/utils'

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

  useEffect(() => {
    if (!target) return
    const timeline = target.timelineId ? watch$.timelines.peek().find((current) => current.id === target.timelineId) : undefined
    setName(timeline?.name || '')
    setSelectedKeys(timeline?.profileKeys || (target.profileKey ? [target.profileKey] : []))
  }, [target])

  const onClose = () => ui$.timelineModal.set(null)

  if (!target) {
    return null
  }

  const editing = Boolean(target.timelineId)

  const toggle = (key: string) =>
    setSelectedKeys((keys) => (keys.includes(key) ? keys.filter((current) => current !== key) : [...keys, key]))

  const save = () => {
    if (target.timelineId) {
      watch$.updateTimeline(target.timelineId, { name, profileKeys: selectedKeys })
    } else {
      const id = watch$.createTimeline(name, selectedKeys)
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
      title={editing ? t('feed.editTimeline') : t('feed.newTimeline')}
      onClose={onClose}
      onSubmit={save}
      submitLabel={t('buttons.save')}
      submitDisabled={!name.trim()}
      footerAccessory={editing ? (
        <NouButton size="1" variant="outline" textClassName="text-red-600 dark:text-red-400" onPress={remove}>
          {t('feed.deleteTimeline')}
        </NouButton>
      ) : undefined}
    >
      <TextInput
        className="mb-3 rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        value={name}
        onChangeText={setName}
        placeholder={t('feed.timelineNamePlaceholder')}
        placeholderTextColor={tw('#9ca3af')}
        style={isIos ? { minHeight: 44 } : undefined}
        autoFocus={!editing}
      />
      {profiles.length ? (
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {profiles.map((profile) => {
            const checked = selectedKeys.includes(profile.key)
            return (
              <Pressable
                key={profile.key}
                onPress={() => toggle(profile.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                className="flex-row items-center gap-3 py-2"
                style={isIos ? { minHeight: 44 } : undefined}
              >
                <MaterialIcons
                  name={checked ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={checked ? tw('#6366f1') : tw('#a1a1aa')}
                />
                <NouText className="flex-1" numberOfLines={1}>
                  {profile.name ? `${profile.name} ` : ''}
                  <NouText className="text-zinc-600 dark:text-zinc-400">{watchSourceLabel(profile)}</NouText>
                </NouText>
                <NouText className="text-xs text-zinc-500">{watchSiteLabels[profile.site]}</NouText>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : (
        <NouText className="text-sm text-zinc-600 dark:text-zinc-400">{t('feed.empty')}</NouText>
      )}
    </FormModal>
  )
}
