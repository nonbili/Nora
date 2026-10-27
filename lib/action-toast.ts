import { observable } from '@legendapp/state'
import { AccessibilityInfo } from 'react-native'

// How long a toast to tap stays, long enough to read it and tap it.
const ACTION_TOAST_MS = 8000

/** The toast to tap that is shown, drawn by the app, as the system's can't be tapped. */
export const actionToast$ = observable<{ id: number; msg: string; onPress: () => void } | null>(null)

let nextId = 1

export function showActionToast(msg: string, onPress: () => void) {
  const id = nextId++
  AccessibilityInfo.announceForAccessibility(msg)
  actionToast$.set({ id, msg, onPress })
  setTimeout(() => {
    if (actionToast$.peek()?.id === id) actionToast$.set(null)
  }, ACTION_TOAST_MS)
}
