export const feedOverlayKeys = [
  'addSourcesModal', 'feedSettingsModal', 'sourcesModal', 'feedGallery',
  'timelineModal', 'sourcePicker', 'sourcesScreen',
] as const

/** Overlays opened outside a feed tab retain their app-level presentation. */
export const feedOverlayBelongsTo = (
  target: { tabId?: string } | null,
  tabId: string | undefined,
  native: boolean,
) => native || (!!target && target.tabId === tabId)

export const shouldDismissFeedOverlay = (
  target: { tabId?: string } | null,
  tabIds: readonly string[],
  activeTabId: string | undefined,
  dismissOnBlur: boolean,
) => !!target?.tabId && (!tabIds.includes(target.tabId) || (dismissOnBlur && target.tabId !== activeTabId))

/** Focus inside an overlay owns its keys; body fallback belongs only to the active tab. */
export const feedOverlayHandlesKey = (
  targetTabId: string | undefined,
  activeTabId: string | undefined,
  container: HTMLElement | null,
  eventTarget: EventTarget | null,
) => !targetTabId || (!!container && (container.contains(eventTarget as Node | null) ||
  (targetTabId === activeTabId && eventTarget === container.ownerDocument?.body)))
