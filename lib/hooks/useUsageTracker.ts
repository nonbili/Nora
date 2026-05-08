import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { tabs$ } from '@/states/tabs'
import { usageLimits$, limitMatchesService } from '@/states/usage-limits'
import { resolveServiceFromUrl } from '@/lib/usage-limits'
import { isWeb } from '@/lib/utils'

const TICK_MS = 60 * 1000

export const useUsageTracker = () => {
  const isActiveRef = useRef(true)

  useEffect(() => {
    usageLimits$.pruneOldUsage()
  }, [])

  useEffect(() => {
    if (isWeb) {
      const onFocus = () => {
        isActiveRef.current = true
      }
      const onBlur = () => {
        isActiveRef.current = false
      }
      window.addEventListener('focus', onFocus)
      window.addEventListener('blur', onBlur)
      isActiveRef.current = document.hasFocus()
      return () => {
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('blur', onBlur)
      }
    }
    const sub = AppState.addEventListener('change', (state) => {
      isActiveRef.current = state === 'active'
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    const tick = () => {
      if (!isActiveRef.current) return
      const tabs = tabs$.tabs.get()
      if (!tabs.length) return
      const idx = tabs$.activeTabIndex.get()
      const tab = tabs[idx]
      const url = tab?.url
      if (!url) return

      const service = resolveServiceFromUrl(url)
      const limits = usageLimits$.limits.get()
      for (const limit of limits) {
        if (!limit) continue
        if (limitMatchesService(limit, service, url)) {
          usageLimits$.incrementUsage(limit.id, 1)
        }
      }
    }

    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [])
}
