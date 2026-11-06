import { useEffect, useRef } from 'react'
import { BackHandler, Keyboard, KeyboardAvoidingView, View, type ViewInstance } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useFeedTabScope } from '../feed/FeedTabScope'
import { feedOverlayHandlesKey } from '@/lib/feed-overlays'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { isWeb } from '@/lib/utils'
import { SourcesList } from '../feed/SourcesList'

const close = () => {
  Keyboard.dismiss()
  ui$.sourcesScreen.set(null)
}

/** Source management fills the workspace while leaving the feed mounted underneath. */
export const SourcesScreen = () => {
  const scope = useFeedTabScope()
  const requested = useValue(ui$.sourcesScreen)
  const target = isWeb && requested?.tabId !== scope?.tabId ? null : requested
  const screenRef = useRef<ViewInstance>(null)

  useEffect(() => {
    if (!target) return
    if (isWeb) {
      const screen = screenRef.current as unknown as HTMLElement | null
      screen?.focus()
      screen?.querySelector<HTMLElement>('[role="button"]')?.focus()
    }
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      close()
      return true
    })
    const onKeyDown = (event: KeyboardEvent) => {
      const activeTabId = tabs$.tabs.peek()[tabs$.activeTabIndex.peek()]?.id
      if (event.key === 'Escape' && !event.defaultPrevented &&
        feedOverlayHandlesKey(target.tabId, activeTabId, screenRef.current as unknown as HTMLElement | null, event.target)) close()
    }
    if (isWeb) window.addEventListener('keydown', onKeyDown)
    return () => {
      back.remove()
      if (isWeb) window.removeEventListener('keydown', onKeyDown)
    }
  }, [target])

  if (!target) return null

  return (
    <View ref={screenRef} tabIndex={isWeb ? 0 : undefined} accessibilityViewIsModal className="absolute inset-0 z-20 bg-zinc-100 dark:bg-zinc-950">
      <KeyboardAvoidingView behavior={isWeb ? undefined : 'height'} className="flex-1 min-h-0">
        <View className="w-full max-w-5xl flex-1 min-h-0 self-center">
          <SourcesList tabId={target.tabId} onClose={close} />
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
