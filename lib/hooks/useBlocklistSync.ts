import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useObserveEffect } from '@legendapp/state/react'
import { applyBlocklist, refreshBlocklistIfDue, supportsRuntimeBlocklist, waitForBlocklistPersist } from '@/lib/blocklist'
import { blocklist$ } from '@/states/blocklist'
import { settings$ } from '@/states/settings'
import { autoProfiles$ } from '@/states/auto-profiles'

const REFRESH_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Applies the persisted blocklist on startup and keeps it up to date. The app
 * can stay open for weeks, so re-check whether the weekly refresh is due on an
 * interval and whenever the app comes back to the foreground, instead of only
 * checking once at startup.
 */
export function useBlocklistSync() {
  useEffect(() => {
    if (!supportsRuntimeBlocklist()) {
      return
    }

    let active = true

    const refreshIfDue = () => {
      if (!active) {
        return
      }
      void refreshBlocklistIfDue()
    }

    const init = async () => {
      await waitForBlocklistPersist()
      if (!active) {
        return
      }
      await applyBlocklist()
      refreshIfDue()
    }

    void init()

    const intervalId = setInterval(refreshIfDue, REFRESH_CHECK_INTERVAL_MS)
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshIfDue()
      }
    })

    return () => {
      active = false
      clearInterval(intervalId)
      appStateSubscription.remove()
    }
  }, [])

  useObserveEffect(() => {
    blocklist$.enabled.get()
    blocklist$.hasSnapshot.get()
    blocklist$.revision.get()
    void applyBlocklist()
  })

  // New profiles mean new Electron partitions that need the request handler.
  useObserveEffect(settings$.profiles, () => {
    void applyBlocklist()
  })

  useObserveEffect(autoProfiles$.profiles, () => {
    void applyBlocklist()
  })
}
