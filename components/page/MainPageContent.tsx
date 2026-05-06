import { useValue } from '@legendapp/state/react'
import { useEffect } from 'react'
import { createLogger } from '@/lib/log'
import { settings$ } from '@/states/settings'
import { NouHeader } from '../header/NouHeader'
import { View } from 'react-native'
import { clsx, isWeb } from '@/lib/utils'
import { tabs$ } from '@/states/tabs'
import { NoraTab } from '../tab/NoraTab'
import { NavModalContent } from '../modal/NavModal'
import { DesktopWorkspace } from '../tab/DesktopWorkspace'
import { auth$ } from '@/states/auth'
import { useMe } from '@/lib/hooks/useMe'
import { syncSupabase } from '@/lib/supabase/sync'
import { useUsageTracker } from '@/lib/hooks/useUsageTracker'
import { UsageLockout } from '../lockout/UsageLockout'
const logger = createLogger('sync')

export const MainPageContent: React.FC<{ contentJs: string }> = ({ contentJs }) => {
  const headerPosition = useValue(settings$.headerPosition)
  const { tabs } = useValue(tabs$)
  const { userId, me } = useMe()
  useUsageTracker()

  useEffect(() => {
    const runSync = () => {
      void syncSupabase().catch((error) => {
        logger.error('syncSupabase failed', error)
      })
    }

    auth$.plan.set(me?.plan)
    if (userId && me?.plan && me.plan !== 'free') {
      runSync()
      const timer = setInterval(
        () => runSync(),
        10 * 60 * 1000, // 10 minutes
      )
      return () => clearInterval(timer)
    }
  }, [me?.plan, userId])

  return (
    <View
      className={clsx(
        'flex-1 h-full overflow-hidden bg-zinc-100 dark:bg-zinc-950',
        headerPosition === 'bottom' && 'flex-col-reverse',
        isWeb && 'lg:flex-row',
      )}
    >
      <NouHeader />
      {isWeb && tabs.length ? (
        <View className="relative flex-1">
          <DesktopWorkspace />
          <UsageLockout />
        </View>
      ) : tabs.length ? (
        <View className="relative flex-1">
          {tabs.map((tab, index) => (
            <NoraTab tab={tab} index={index} key={tab.id || index} />
          ))}
          <UsageLockout />
        </View>
      ) : (
        <View className="flex-1 bg-zinc-100 dark:bg-zinc-950 lg:px-20">
          <NavModalContent />
        </View>
      )}
    </View>
  )
}
