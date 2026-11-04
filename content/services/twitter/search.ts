import { getXLatestSearchUrl } from '../../../lib/settings/twitter-search'
import { noraSettingsEvent } from '../../nora'

export const watchXSearchHistory = (history: History, changed: () => void) => {
  const originalPush = history.pushState
  const originalReplace = history.replaceState
  const push: History['pushState'] = function (...args) {
    originalPush.apply(history, args)
    changed()
  }
  const replace: History['replaceState'] = function (...args) {
    originalReplace.apply(history, args)
    changed()
  }
  history.pushState = push
  history.replaceState = replace
  return () => {
    // Don't overwrite a newer wrapper installed by the site or another feature.
    if (history.pushState === push) history.pushState = originalPush
    if (history.replaceState === replace) history.replaceState = originalReplace
  }
}

export function runXSearchController() {
  const root = window as Window & { __noraXSearchInit?: boolean }
  if (root.__noraXSearchInit) return
  root.__noraXSearchInit = true

  let enabled = window.Nora?.getSettings?.().xDefaultSearchLatest === true
  let unwatch: (() => void) | null = null
  let scheduled = false
  let navigatingTo: string | null = null
  const applied = new Set<string>()
  const manualSearches = new Set<string>()
  const queryKey = (href: string) => {
    try {
      const url = new URL(href, location.href)
      return url.origin === location.origin && url.pathname === '/search' ? url.searchParams.get('q') : null
    } catch {
      return null
    }
  }
  const apply = () => {
    scheduled = false
    const target = getXLatestSearchUrl(location.href, enabled, manualSearches)
    if (!target) {
      navigatingTo = null
      return
    }
    if (target === navigatingTo || applied.has(target)) return
    navigatingTo = target
    applied.add(target)
    if (applied.size > 100) applied.delete(applied.values().next().value!)
    // X's router handles popstate without reloading the document. Preserve its
    // state and replace the initial Top entry instead of adding another Back step.
    history.replaceState(history.state, '', target)
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  }
  const schedule = () => {
    if (!enabled || scheduled) return
    scheduled = true
    requestAnimationFrame(apply)
  }
  const sync = () => {
    if (!enabled) {
      unwatch?.()
      unwatch = null
      return
    }
    unwatch ||= watchXSearchHistory(history, schedule)
    schedule()
  }
  window.addEventListener(noraSettingsEvent, () => {
    enabled = window.Nora?.getSettings?.().xDefaultSearchLatest === true
    sync()
  })
  window.addEventListener('popstate', schedule)
  // X's Top tab omits f entirely, just like an initial search. Remember an
  // explicit tab selection before the SPA updates its URL, without matching labels.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[role="tab"][href]') : null
    const query = target && queryKey(target.href)
    if (query && query === queryKey(location.href)) {
      manualSearches.add(query)
      if (manualSearches.size > 20) manualSearches.delete(manualSearches.values().next().value!)
    }
  }, true)
  sync()
}
