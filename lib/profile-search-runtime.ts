import { t } from 'i18next'
import { tabs$ } from '@/states/tabs'
import { executeWebviewJavaScriptQuietly, getTabWebview } from './webview'
import { createProfileSearch, type ProfileSearchPorts } from './profile-search'
import type { MorePostsLabels, MorePostsMessage, MorePostsPayload } from './more-posts'

const getMorePostsLabels = (): MorePostsLabels => ({
  title: t('morePosts.title'),
  more: t('morePosts.more'),
  openPost: t('morePosts.openPost'),
  note: t('morePosts.note'),
  error: t('morePosts.error'),
  empty: t('morePosts.empty'),
  continue: t('morePosts.continue'),
  continueHint: t('morePosts.continueHint'),
  searching: t('morePosts.searching'),
  unavailable: t('morePosts.unavailable'),
  retry: t('morePosts.retry'),
})

/** Hands a page of the list to the page of a tab, which draws it. */
export function sendMorePosts(tabId: string, payload: MorePostsPayload) {
  const message: MorePostsMessage = { ...payload, labels: getMorePostsLabels() }
  void executeWebviewJavaScriptQuietly(getTabWebview(tabId), `window.Nora?.setMorePosts?.(${JSON.stringify(message)})`)
}

const findTab = (tabId: string) => tabs$.tabs.get().find((tab) => tab?.id === tabId)

const ports: ProfileSearchPorts = {
  openSearchTab: (url, parentTabId) =>
    tabs$.openTab(url, {
      parentTabId,
      source: 'child',
      profile: findTab(parentTabId)?.profile,
      profileMode: 'manual',
      background: true,
    }),
  closeTab: (tabId) => {
    const index = tabs$.tabs.get().findIndex((tab) => tab?.id === tabId)
    if (index !== -1) {
      tabs$.closeTab(index, { forget: true })
    }
  },
  tabExists: (tabId) => Boolean(findTab(tabId)),
  activeTabId: () => tabs$.currentTab()?.id,
  activateTab: (tabId) => tabs$.setActiveTabById(tabId, 'system'),
  sendToTab: sendMorePosts,
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  now: () => Date.now(),
}

export const profileSearch = createProfileSearch(ports)
