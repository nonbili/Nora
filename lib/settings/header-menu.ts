const nativeActions = {
  reload: 'menus.reload',
  scrollToTop: 'menus.scroll',
  openUrl: 'buttons.openUrl',
  findInPage: 'menus.findInPage',
  desktopSite: 'menus.desktop',
  blockAds: 'menus.blockAds',
  hideSignInPrompts: 'menus.hideSignInPrompts',
  reopenInProfile: 'menus.reopenInProfile',
  watch: 'settings.headerMenu.watch',
  zoom: 'menus.zoom',
  addBookmark: 'menus.addBookmark',
  share: 'menus.share',
  addToHomeScreen: 'menus.addToHomeScreen',
} as const

const sharedActions = {
  feed: 'feed.label',
  tools: 'menus.tools',
} as const

// Settings is deliberately not configurable: it is the way back to these preferences.
const actions = { ...nativeActions, ...sharedActions }
export type HeaderMenuActionId = keyof typeof actions

const isActionId = (id: unknown): id is HeaderMenuActionId =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(actions, id)

export function normalizeHiddenHeaderMenuActions(value: unknown): HeaderMenuActionId[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isActionId))]
}

export function headerMenuOptions(platform: 'web' | 'android' | 'ios' | 'native') {
  return Object.keys(platform === 'web' ? sharedActions : actions)
    .filter(isActionId)
    .filter((id) => id !== 'addToHomeScreen' || platform === 'android')
    .map((id) => ({ id, labelKey: actions[id] }))
}

// Only filter actions the header already determined were available in this context.
export function visibleHeaderMenuActions<T extends { id: HeaderMenuActionId }>(
  items: readonly T[],
  hidden: readonly HeaderMenuActionId[],
): T[] {
  return items.filter(({ id }) => !hidden.includes(id))
}
