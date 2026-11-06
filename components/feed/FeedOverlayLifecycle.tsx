import { useEffect } from 'react'
import { useValue } from '@legendapp/state/react'
import { tabs$ } from '@/states/tabs'
import { isFeedTabUrl } from '@/lib/feed-tab'
import { feedOverlayKeys, shouldDismissFeedOverlay } from '@/lib/feed-overlays'
import { ui$ } from '@/states/ui'

/** All overlays close with their tab; native overlays also close when it loses focus. */
export const FeedOverlayLifecycle = ({ dismissOnBlur }: { dismissOnBlur: boolean }) => {
  const activeTabId = useValue(() => tabs$.tabs[tabs$.activeTabIndex.get()]?.id.get())
  const tabIds = useValue(() => tabs$.tabs.get().filter((tab) => isFeedTabUrl(tab.url)).map((tab) => tab.id))
  const targets = useValue(() => feedOverlayKeys.map((key) => ui$[key].get()))

  useEffect(() => {
    for (const key of feedOverlayKeys) {
      const target = ui$[key].peek()
      if (shouldDismissFeedOverlay(target, tabIds, activeTabId, dismissOnBlur)) ui$.assign({ [key]: null })
    }
  }, [activeTabId, tabIds, targets, dismissOnBlur])

  return null
}
