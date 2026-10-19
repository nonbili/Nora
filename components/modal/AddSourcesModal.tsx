import { useEffect, useState } from 'react'
import { Pressable, ScrollView, TextInput, View, useColorScheme } from 'react-native'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { ui$ } from '@/states/ui'
import { getTimeline, watch$ } from '@/states/watch'
import { watchKey, watchSiteLabels, watchSourceLabel } from '@/lib/watch'
import { refreshWatched } from '@/lib/watch-feed'
import { applyWatchBackup, parseSourceList, sourceFromUrl } from '@/lib/watch-transfer'
import { showToast } from '@/lib/toast'
import { useTwColor } from '@/lib/theme'

/** The links in what was typed or pasted, each with the source it is of, if any. */
const readLinks = (text: string) =>
  text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((link) => ({ link, target: sourceFromUrl(link) }))

/** Puts the profiles in a timeline, after those it has. */
const addToTimeline = (timelineId: string | undefined, keys: string[]) => {
  const timeline = getTimeline(timelineId)
  if (!timeline) return
  for (const key of keys) {
    if (!timeline.profileKeys.includes(key)) watch$.setInTimeline(timeline.id, key, true)
  }
}

/** Adds the sources of an OPML file or of a list of links, with the OPML folders as timelines, and all to the timeline given. */
const importSources = async (timelineId?: string) => {
  // OPML files have no type of their own on most systems.
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' })
  const asset = result.assets?.[0]
  if (!asset) return false
  try {
    const list = parseSourceList(await (await fetch(asset.uri)).text())
    if (!list.profiles.length) {
      showToast(t('feed.importSourcesEmpty'))
      return true
    }
    const { added, existing } = applyWatchBackup(list)
    addToTimeline(timelineId, list.profiles.map(watchKey))
    showToast(t('feed.importSourcesDone', { added, existing, unrecognized: list.unrecognized }))
    if (added) void refreshWatched('foreground')
  } catch (e) {
    console.error('[Feed] source import failed', e)
    showToast(t('feed.importSourcesFailed', { message: (e as Error).message }))
  }
  return true
}

/** Adds sources by their links, without opening them, or from a file; into the timeline it was opened from, if any. */
export const AddSourcesModal = () => {
  const tw = useTwColor()
  const isDark = useColorScheme() === 'dark'
  const target = useValue(ui$.addSourcesModal)
  const profiles = useValue(watch$.profiles)
  const timelines = useValue(watch$.timelines)
  const [text, setText] = useState('')

  useEffect(() => {
    setText('')
    if (!target) return
    // A profile link just copied is likely the one to add.
    Clipboard.getStringAsync()
      .then((copied) => {
        const links = readLinks(copied)
        if (links.length && links.every((link) => link.target)) setText((current) => current || copied.trim())
      })
      .catch(() => {})
  }, [target])

  const onClose = () => ui$.addSourcesModal.set(null)

  if (!target) {
    return null
  }

  const watched = new Set(profiles.map((profile) => profile.key))
  // Already added: in the timeline it was opened from, or watched at all for the whole feed.
  const timeline = timelines.find((current) => current.id === target.timelineId)
  const added = timeline ? new Set(timeline.profileKeys) : watched
  const links = readLinks(text)
  const toAdd = [...new Map(links.flatMap(({ target }) => (target && !added.has(watchKey(target)) ? [[watchKey(target), target]] : []))).entries()]

  const save = () => {
    const newKeys = toAdd.filter(([key]) => !watched.has(key)).map(([key]) => key)
    for (const [key, source] of toAdd) {
      if (!watched.has(key)) watch$.watch(source)
    }
    addToTimeline(timeline?.id, toAdd.map(([key]) => key))
    showToast(t('feed.addSourcesDone', { count: toAdd.length }))
    if (newKeys.length) void refreshWatched('manual', newKeys)
    onClose()
  }

  const importFile = async () => {
    if (await importSources(timeline?.id)) onClose()
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="w-full p-4">
        <NouText className="mb-4 text-lg font-bold">{t('feed.addSources')}</NouText>
        <TextInput
          // A few lines tall, as it takes a link on each.
          className="mb-3 max-h-40 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          style={{ minHeight: 96, textAlignVertical: 'top' }}
          value={text}
          onChangeText={setText}
          placeholder={t('feed.addSourcesPlaceholder')}
          placeholderTextColor={tw('#9ca3af')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          multiline
          autoFocus
        />
        {links.length ? (
          <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
            {links.map(({ link, target: source }, index) => {
              const already = source ? added.has(watchKey(source)) : false
              return (
                <View key={`${index}:${link}`} className="flex-row items-center gap-3 py-1.5">
                  <MaterialIcons
                    name={source ? (already ? 'check-circle-outline' : 'add-circle-outline') : 'error-outline'}
                    size={20}
                    color={source ? (already ? tw('#a1a1aa') : tw('#6366f1')) : tw('#f59e0b')}
                  />
                  {source ? (
                    <>
                      <NouText className="flex-1" numberOfLines={1}>
                        {watchSourceLabel(source)}
                      </NouText>
                      <NouText className="text-xs text-zinc-500">
                        {already ? t('feed.addSourcesAlready') : watchSiteLabels[source.site]}
                      </NouText>
                    </>
                  ) : (
                    <View className="flex-1">
                      <NouText className="text-sm" numberOfLines={1}>
                        {link}
                      </NouText>
                      <NouText className="text-xs text-zinc-500">{t('feed.addSourcesUnrecognized')}</NouText>
                    </View>
                  )}
                </View>
              )
            })}
          </ScrollView>
        ) : (
          <NouText className="text-sm leading-5 text-zinc-500 dark:text-zinc-400">{t('feed.addSourcesHint')}</NouText>
        )}
        {/* Importing is the lesser way in, so it is a link rather than a button beside Add. */}
        <View className="mt-6 flex-row flex-wrap items-center justify-end gap-3">
          <View className="grow items-start">
            <Pressable onPress={() => void importFile()} accessibilityRole="button" className="h-9 flex-row items-center gap-1.5">
              <MaterialIcons name="upload-file" size={18} color={tw(isDark ? '#818cf8' : '#4f46e5')} />
              <NouText className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{t('feed.importSources')}</NouText>
            </Pressable>
          </View>
          <View className="flex-row gap-3">
            <NouButton size="1" variant="outline" onPress={onClose}>
              {t('buttons.cancel')}
            </NouButton>
            <NouButton size="1" disabled={!toAdd.length} onPress={save}>
              {toAdd.length ? t('feed.addSourcesSubmit', { count: toAdd.length }) : t('feed.add')}
            </NouButton>
          </View>
        </View>
      </View>
    </BaseCenterModal>
  )
}
