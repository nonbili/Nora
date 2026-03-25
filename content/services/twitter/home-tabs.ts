import { noraSettingsEvent } from '../../nora'
import {
  normalizeXHomeTimeline,
  resolveXHomeTabsDecision,
  type XHomeTabsSettings,
  type XHomeTimeline,
} from '../../../lib/settings/twitter'

const HIDDEN_CLASS = '_nora_hidden_'
const SWITCH_RETRY_MS = 1200

const normalizeLabel = (value?: string | null) => value?.replace(/\s+/g, ' ').trim().toLowerCase() || ''

const getTimelineFromElement = (element: Element | null): XHomeTimeline | null => {
  if (!element) {
    return null
  }

  const label = normalizeLabel(
    element.getAttribute('aria-label') ||
      element.getAttribute('data-testid') ||
      element.textContent,
  )

  if (label.includes('for you')) {
    return 'for-you'
  }
  if (label.includes('following')) {
    return 'following'
  }
  return null
}

const isActiveTab = (element: HTMLElement) => {
  return element.getAttribute('aria-selected') === 'true'
}

const getHomeTabList = () => {
  const tabLists = document.querySelectorAll<HTMLElement>('[role="tablist"]')

  for (const tabList of tabLists) {
    const tabs = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'))
    let forYouTab: HTMLElement | null = null
    let followingTab: HTMLElement | null = null

    for (const tab of tabs) {
      const timeline = getTimelineFromElement(tab)
      if (timeline === 'for-you') {
        forYouTab = tab
      } else if (timeline === 'following') {
        followingTab = tab
      }
    }

    if (forYouTab && followingTab) {
      return {
        tabList,
        forYouTab,
        followingTab,
      }
    }
  }

  return null
}

const getActiveTimeline = (tabs: { forYouTab: HTMLElement; followingTab: HTMLElement }): XHomeTimeline | null => {
  if (isActiveTab(tabs.forYouTab)) {
    return 'for-you'
  }
  if (isActiveTab(tabs.followingTab)) {
    return 'following'
  }
  return getTimelineFromElement(document.querySelector('[role="tab"][aria-selected="true"]'))
}

export function runXHomeTabsController() {
  const root = window as Window &
    typeof globalThis & {
      __noraXHomeTabsInit?: boolean
    }

  if (root.__noraXHomeTabsInit) {
    return
  }
  root.__noraXHomeTabsInit = true

  let settings: XHomeTabsSettings = {
    xDefaultHomeTimeline: normalizeXHomeTimeline(window.Nora?.getSettings?.().xDefaultHomeTimeline),
    hideXHomeTimelineTabs: Boolean(window.Nora?.getSettings?.().hideXHomeTimelineTabs),
  }
  let scheduled = false
  let hiddenTabList: HTMLElement | null = null
  let pendingTimeline: XHomeTimeline | null = null
  let pendingAt = 0

  const clearHiddenTabList = () => {
    if (hiddenTabList) {
      hiddenTabList.classList.remove(HIDDEN_CLASS)
      hiddenTabList = null
    }
  }

  const setTabListHidden = (tabList: HTMLElement, hidden: boolean) => {
    if (!hidden) {
      if (hiddenTabList === tabList) {
        hiddenTabList = null
      }
      tabList.classList.remove(HIDDEN_CLASS)
      return
    }

    if (hiddenTabList && hiddenTabList !== tabList) {
      hiddenTabList.classList.remove(HIDDEN_CLASS)
    }
    hiddenTabList = tabList
    tabList.classList.add(HIDDEN_CLASS)
  }

  const apply = () => {
    scheduled = false

    const tabs = getHomeTabList()
    if (!tabs) {
      pendingTimeline = null
      clearHiddenTabList()
      return
    }

    const activeTimeline = getActiveTimeline(tabs)
    const decision = resolveXHomeTabsDecision(settings, {
      activeTimeline,
      tabsHidden: tabs.tabList.classList.contains(HIDDEN_CLASS),
    })

    if (decision.revealTabs) {
      setTabListHidden(tabs.tabList, false)
    }

    if (decision.switchTo) {
      const targetTab = decision.switchTo === 'following' ? tabs.followingTab : tabs.forYouTab
      const shouldRetry =
        pendingTimeline !== decision.switchTo || Date.now() - pendingAt > SWITCH_RETRY_MS

      if (shouldRetry) {
        pendingTimeline = decision.switchTo
        pendingAt = Date.now()
        targetTab.click()
      }
      return
    }

    pendingTimeline = null
    setTabListHidden(tabs.tabList, decision.hideTabs)
  }

  const scheduleApply = () => {
    if (scheduled) {
      return
    }
    scheduled = true
    window.requestAnimationFrame(apply)
  }

  window.addEventListener(noraSettingsEvent, (event) => {
    const detail = (event as CustomEvent<XHomeTabsSettings>).detail
    settings = {
      xDefaultHomeTimeline: normalizeXHomeTimeline(detail?.xDefaultHomeTimeline),
      hideXHomeTimelineTabs: Boolean(detail?.hideXHomeTimelineTabs),
    }
    scheduleApply()
  })

  window.addEventListener('popstate', scheduleApply)
  window.addEventListener('hashchange', scheduleApply)

  if (document.body) {
    const observer = new MutationObserver(() => scheduleApply())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'class', 'aria-label'],
    })
  }

  scheduleApply()
}
