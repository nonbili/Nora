import { Pressable, Text, View } from 'react-native'
import { clsx } from '@/lib/utils'

// Ones that suit a feed or a part of it; any other can be typed in the field next to the grid.
const EMOJIS = [
  '🧵', '📰', '🗞️', '📡', '🔔', '⭐', '❤️', '🔥', '💬', '👥', '🏠', '💼',
  '🎵', '🎬', '🎮', '📷', '🎨', '📚', '💡', '🧪', '💻', '🤖', '🚀', '🌍',
  '✈️', '🏔️', '🍜', '☕', '🐱', '🐶', '🌱', '⚽', '🏀', '🎲', '🛒', '💰',
  '📈', '🗳️', '🎓', '🏥', '🔧', '🎉', '🌈', '🌙',
]

/** A few emojis to pick from. */
export const EmojiGrid: React.FC<{ value: string; onSelect: (emoji: string) => void }> = ({ value, onSelect }) => (
  <View className="mb-3 flex-row flex-wrap gap-1">
    {EMOJIS.map((emoji) => (
      <Pressable
        key={emoji}
        onPress={() => onSelect(emoji)}
        accessibilityRole="button"
        accessibilityLabel={emoji}
        className={clsx(
          'h-10 w-10 items-center justify-center rounded-lg',
          value === emoji ? 'bg-indigo-100 dark:bg-indigo-500/30' : 'active:bg-zinc-200 dark:active:bg-zinc-800',
        )}
      >
        <Text style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</Text>
      </Pressable>
    ))}
  </View>
)
