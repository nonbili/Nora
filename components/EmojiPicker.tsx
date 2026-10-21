import { useCallback, useMemo, useState } from 'react'
import { FlatList, Platform, Pressable, Text, TextInput, View, useColorScheme } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { useTwColor } from '@/lib/theme'
import { clsx, iosTouchTarget } from '@/lib/utils'
import groups from '@/lib/emoji-data.json'

// Ones that suit a feed or a part of it, shown first.
const SUGGESTED = [
  '🧵', '📰', '🗞️', '📡', '🔔', '⭐', '❤️', '🔥', '💬', '👥', '🏠', '💼',
  '🎵', '🎬', '🎮', '📷', '🎨', '📚', '💡', '🧪', '💻', '🤖', '🚀', '🌍',
  '✈️', '🏔️', '🍜', '☕', '🐱', '🐶', '🌱', '⚽', '🏀', '🎲', '🛒', '💰',
  '📈', '🗳️', '🎓', '🏥', '🔧', '🎉', '🌈', '🌙',
]

// The newest emoji version the system's font has; newer emojis would show as boxes.
const MAX_EMOJI_VERSION = (() => {
  if (Platform.OS === 'android') {
    const api = Number(Platform.Version)
    return api >= 36 ? 16 : api >= 35 ? 15.1 : api >= 34 ? 15 : api >= 33 ? 14 : api >= 31 ? 13.1 : api >= 30 ? 13 : 12
  }
  if (Platform.OS === 'ios') {
    const [major, minor = 0] = String(Platform.Version).split('.').map(Number)
    const version = major + minor / 10
    return version >= 18.4 ? 16 : version >= 17.4 ? 15.1 : version >= 16.4 ? 15 : version >= 15.4 ? 14 : 13.1
  }
  // The desktop app draws them with the system's font, which a current Windows, macOS or Linux has up to here.
  return 15
})()

const CELL = 40
const HEADER = 32

type IconName = React.ComponentProps<typeof MaterialIcons>['name']

const CATEGORY_ICONS: Record<string, IconName> = {
  suggested: 'auto-awesome',
  smileys_emotion: 'emoji-emotions',
  people_body: 'emoji-people',
  animals_nature: 'emoji-nature',
  food_drink: 'emoji-food-beverage',
  travel_places: 'emoji-transportation',
  activities: 'emoji-events',
  objects: 'emoji-objects',
  symbols: 'emoji-symbols',
  flags: 'emoji-flags',
}

interface Emoji {
  emoji: string
  name: string
  // The words of its name, which a search matches the start of: "cat" finds a cat, not an "application".
  words: string[]
}

const toEmoji = (emoji: string, name = ''): Emoji => ({ emoji, name, words: name.split(/[\s:-]+/).filter(Boolean) })

const categories: { slug: string; emojis: Emoji[] }[] = [
  { slug: 'suggested', emojis: SUGGESTED.map((emoji) => toEmoji(emoji)) },
  ...groups.map((group) => ({
    slug: group.slug,
    emojis: group.emojis
      .filter((emoji) => (emoji[2] as number) <= MAX_EMOJI_VERSION)
      .map((emoji) => toEmoji(emoji[0] as string, emoji[1] as string)),
  })),
]

const allEmojis = categories.slice(1).flatMap((category) => category.emojis)

// A category is the one at the top once its first row there is in full sight, not while the last of the one before still shows.
const VIEWABILITY = { itemVisiblePercentThreshold: 100 }

type Row = { key: string; slug: string; header: true } | { key: string; slug: string; header?: false; emojis: Emoji[] }

const chunk = (emojis: Emoji[], columns: number) =>
  Array.from({ length: Math.ceil(emojis.length / columns) }, (_, i) => emojis.slice(i * columns, (i + 1) * columns))

/** Every category one after another, each under its name; or what a search found, without names. */
const toRows = (columns: number, found?: Emoji[]): Row[] =>
  found
    ? chunk(found, columns).map((emojis, i) => ({ key: `found-${i}`, slug: '', emojis }))
    : categories.flatMap(({ slug, emojis }) => [
        { key: slug, slug, header: true as const },
        ...chunk(emojis, columns).map((row, i) => ({ key: `${slug}-${i}`, slug, emojis: row })),
      ])

/**
 * All the emojis to scroll through, with a tab for each category to jump to it, or found by name.
 * Picking the one chosen takes it away. It scrolls on its own: shown outside the form's scroll.
 */
export const EmojiPicker: React.FC<{ value: string; onSelect: (emoji: string) => void; height?: number }> = ({
  value,
  onSelect,
  height = 320,
}) => {
  const tw = useTwColor()
  const isDark = useColorScheme() === 'dark'
  const [query, setQuery] = useState('')
  const [width, setWidth] = useState(0)
  const [category, setCategory] = useState('suggested')
  // The row a tab jumped to, and how many jumps there were. The list starts over there, on every
  // jump, even to the same tab again: one scrolled far away by hand shows nothing on Android until
  // it is scrolled again.
  const [jump, setJump] = useState({ index: 0, count: 0 })

  const search = query.trim().toLowerCase()
  const columns = Math.max(1, Math.floor(width / CELL))
  const rows = useMemo(() => {
    const words = search.split(/\s+/).filter(Boolean)
    const found = words.length
      ? allEmojis.filter((emoji) => words.every((word) => emoji.words.some((current) => current.startsWith(word))))
      : undefined
    return width ? toRows(columns, found) : []
  }, [search, columns, width])
  const offsets = useMemo(
    () => rows.reduce<number[]>((all, row, i) => [...all, i ? all[i - 1] + (rows[i - 1].header ? HEADER : CELL) : 0], []),
    [rows],
  )

  // The tab of the category at the top of the list is the one marked.
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: Row }[] }) => {
    const first = viewableItems[0]?.item
    if (first?.slug) setCategory(first.slug)
  }, [])

  const jumpTo = (slug: string) => {
    const index = rows.findIndex((row) => row.header && row.slug === slug)
    if (index === -1) return
    setCategory(slug)
    setJump(({ count }) => ({ index, count: count + 1 }))
  }

  const iconColor = isDark ? tw('#a1a1aa') : tw('#71717a')

  return (
    // It shrinks, as its list does, to what the dialog has room for, as with the keyboard up.
    <View style={{ flexShrink: 1 }} className="mb-3 gap-2 rounded-xl border border-zinc-300 p-2 dark:border-zinc-700">
      <TextInput
        className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        value={query}
        onChangeText={setQuery}
        placeholder={t('feed.emojiSearch')}
        placeholderTextColor={tw('#9ca3af')}
        style={iosTouchTarget}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {!search ? (
        <View className="flex-row justify-between border-b border-zinc-200 dark:border-zinc-800">
          {categories.map(({ slug }) => (
            <Pressable
              key={slug}
              onPress={() => jumpTo(slug)}
              accessibilityRole="tab"
              accessibilityLabel={t(`feed.emojiCategories.${slug}`)}
              accessibilityState={{ selected: slug === category }}
              className={clsx('h-9 flex-1 items-center justify-center border-b-2', slug === category ? 'border-indigo-500' : 'border-transparent')}
            >
              <MaterialIcons name={CATEGORY_ICONS[slug] ?? 'emoji-symbols'} size={20} color={slug === category ? tw('#6366f1') : iconColor} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ height, flexShrink: 1, minHeight: CELL * 2 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <FlatList
          key={search ? 'found' : `${columns}-${jump.count}`}
          initialScrollIndex={search ? 0 : Math.min(jump.index, Math.max(0, rows.length - 1))}
          data={rows}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          getItemLayout={(_, index) => ({ length: rows[index]?.header ? HEADER : CELL, offset: offsets[index] ?? 0, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          initialNumToRender={12}
          windowSize={5}
          renderItem={({ item }) =>
            item.header ? (
              <View style={{ height: HEADER }} className="justify-end pb-1">
                <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t(`feed.emojiCategories.${item.slug}`)}</Text>
              </View>
            ) : (
              <View className="flex-row" style={{ height: CELL }}>
                {item.emojis.map(({ emoji, name }) => (
                  <Pressable
                    key={emoji}
                    onPress={() => onSelect(emoji === value ? '' : emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={name || emoji}
                    style={{ width: width / columns, height: CELL }}
                    className={clsx(
                      'items-center justify-center rounded-lg',
                      value === emoji ? 'bg-indigo-100 dark:bg-indigo-500/30' : 'active:bg-zinc-200 dark:active:bg-zinc-800',
                    )}
                  >
                    <Text style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )
          }
          ListEmptyComponent={
            search ? <Text className="p-2 text-sm text-zinc-500 dark:text-zinc-400">{t('feed.emojiNoMatch')}</Text> : undefined
          }
        />
      </View>
    </View>
  )
}

/** The emoji chosen, or the default one faded, which opens the picker. */
export const EmojiButton: React.FC<{ value: string; placeholder: string; open: boolean; onPress: () => void }> = ({
  value,
  placeholder,
  open,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={t('feed.emojiPicker')}
    accessibilityState={{ expanded: open }}
    style={iosTouchTarget}
    className={clsx(
      'h-11 w-11 items-center justify-center rounded-md border',
      open ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/20' : 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900',
    )}
  >
    <Text style={{ fontSize: 22, lineHeight: 28, opacity: value ? 1 : 0.5 }}>{value || placeholder}</Text>
  </Pressable>
)
