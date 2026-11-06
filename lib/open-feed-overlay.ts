import { batch } from '@legendapp/state'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import type { feedOverlayKeys } from './feed-overlays'

type FeedOverlayKey = typeof feedOverlayKeys[number]
type FeedOverlayState = ReturnType<typeof ui$.peek>

/** Native menu actions can arrive without React Native's pane activation responder. */
export const openFeedOverlay = <Key extends FeedOverlayKey>(key: Key, target: NonNullable<FeedOverlayState[Key]>) => {
  batch(() => {
    if (target.tabId) tabs$.setActiveTabById(target.tabId, 'user')
    ui$.assign({ [key]: target })
  })
}
