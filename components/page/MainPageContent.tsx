import { useValue } from '@legendapp/state/react'
import React, { useEffect } from 'react'
import { createLogger } from '@/lib/log'
import { settings$ } from '@/states/settings'
import { NouHeader } from '../header/NouHeader'
import { AppState, View } from 'react-native'
import { clsx, isAndroid, isWeb } from '@/lib/utils'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { NativeTabHost } from '../tab/NativeTabHost'
import { NavModalContent } from '../modal/NavModal'
import { DesktopWorkspace } from '../tab/DesktopWorkspace'
import { auth$ } from '@/states/auth'
import { useMe } from '@/lib/hooks/useMe'
import { syncSupabase } from '@/lib/supabase/sync'
import { useUsageTracker } from '@/lib/hooks/useUsageTracker'
import { useAccountChoicePrompt } from '@/lib/hooks/useAccountChoicePrompt'
import { UsageLockout } from '../lockout/UsageLockout'
import { SettingsModal } from '../modal/SettingsModal'
import { useDesktopLayout } from '@/lib/hooks/useDesktopLayout'
const logger = createLogger('sync')
// Coming back to the app syncs at most this often.
const returnSyncThrottleMs = 30 * 1000

export const MainPageContent: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const headerPosition = useValue(settings$.headerPosition)
  const settingsModalOpen = useValue(ui$.settingsModalOpen)
  const tabs = useValue(tabs$.tabs)
  const desktopLayout = useDesktopLayout()
  // Android desktop mode gets the same workspace as the desktop app, laid out with
  // native views instead of DOM ones.
  const nativeDesktop = desktopLayout && !isWeb
  const { userId, me } = useMe()
  useUsageTracker()
  useAccountChoicePrompt()

  useEffect(() => {
    let lastRunAt = 0
    const runSync = () => {
      lastRunAt = Date.now()
      void syncSupabase().catch((error) => {
        logger.error('syncSupabase failed', error)
      })
    }
    // Coming back to the app is when another device's changes are most likely waiting.
    const runSyncOnReturn = () => {
      if (Date.now() - lastRunAt >= returnSyncThrottleMs) runSync()
    }

    auth$.plan.set(me?.plan)
    if (userId && me?.plan && me.plan !== 'free') {
      runSync()
      const timer = setInterval(
        () => runSync(),
        10 * 60 * 1000, // 10 minutes
      )
      const appState = AppState.addEventListener('change', (state) => {
        if (state === 'active') runSyncOnReturn()
      })
      if (isWeb) window.addEventListener('focus', runSyncOnReturn)
      return () => {
        clearInterval(timer)
        appState.remove()
        if (isWeb) window.removeEventListener('focus', runSyncOnReturn)
      }
    }
  }, [me?.plan, userId])

  return (
    <View
      collapsable={false}
      importantForAccessibility={isAndroid && settingsModalOpen ? 'no-hide-descendants' : 'auto'}
      className={clsx(
        'flex-1 h-full overflow-hidden bg-zinc-100 dark:bg-zinc-950',
        !nativeDesktop && headerPosition === 'bottom' && 'flex-col-reverse',
        isWeb && 'lg:flex-row',
        nativeDesktop && 'flex-row',
      )}
    >
      <NouHeader />
      {isWeb ? <SettingsModal /> : null}
      {tabs.length ? (
        <View
          className={clsx('relative flex-1', desktopLayout && 'min-h-0 overflow-hidden bg-zinc-200 dark:bg-black')}
        >
          {/* Native keeps one host across both layouts, so a rotation that crosses the
              desktop-layout width threshold never remounts a webview. `isWeb` is a
              constant, so this branch itself never flips at runtime. */}
          {isWeb ? <DesktopWorkspace /> : <NativeTabHost desktopLayout={desktopLayout} />}
          <UsageLockout />
        </View>
      ) : (
        <View className="flex-1 bg-white dark:bg-zinc-900 lg:px-20">
          <NavModalContent />
        </View>
      )}
    </View>
  )
}
