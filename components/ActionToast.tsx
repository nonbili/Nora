import { Pressable, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NouText } from './NouText'
import { actionToast$ } from '@/lib/action-toast'

/** The toast to tap, over whatever is shown, under the header as the other toasts are. */
export const ActionToast = () => {
  const toast = useValue(actionToast$)
  const insets = useSafeAreaInsets()
  if (!toast) return null
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        actionToast$.set(null)
        toast.onPress?.()
      }}
      className="rounded-[20px] border border-zinc-300 bg-zinc-100 px-5 py-3 dark:border-zinc-700 dark:bg-zinc-800"
      style={{ position: 'absolute', top: insets.top + 56, left: 16, right: 16, zIndex: 1001, elevation: 1001 }}
    >
      {toast.label ? (
        <View className="flex-row items-center gap-3">
          <NouText className="flex-1 text-zinc-900 dark:text-zinc-50">{toast.msg}</NouText>
          <NouText className="font-semibold text-indigo-600 dark:text-indigo-400">{toast.label}</NouText>
        </View>
      ) : (
        <NouText className="text-center text-zinc-900 dark:text-zinc-50">{toast.msg}</NouText>
      )}
    </Pressable>
  )
}
