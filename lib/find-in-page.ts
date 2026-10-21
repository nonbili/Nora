import { ui$ } from '@/states/ui'
import { getTabWebview } from '@/lib/webview'
import { isIos, isWeb } from '@/lib/utils'

type FindableWebview = {
  // Electron <webview>
  findInPage?: (text: string, options?: { forward?: boolean; findNext?: boolean }) => number
  stopFindInPage?: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => void
  // Android
  findNext?: (forward: boolean) => unknown
  clearFind?: () => unknown
  // iOS: the system find bar
  showFind?: () => unknown
}

// Tabs whose page changed under an open find bar: their matches are gone, so going on starts a new search.
const staleTabs = new Set<string>()

/** Opens the find bar of a tab. iOS has its own, over the keyboard. */
export function openFindInPage(tabId: string | undefined) {
  if (!tabId) return
  if (isIos) {
    void Promise.resolve((getTabWebview(tabId) as FindableWebview | undefined)?.showFind?.()).catch(() => {})
    return
  }
  const open = ui$.findInPage.get()
  if (open?.tabId === tabId) {
    // Open already: back to its text.
    ui$.findInPage.openedAt.set(Date.now())
    return
  }
  if (open) stopFindInPage(open.tabId)
  ui$.findInPage.set({ tabId, openedAt: Date.now(), text: '', active: 0, total: 0 })
}

export function closeFindInPage() {
  const open = ui$.findInPage.get()
  if (!open) return
  stopFindInPage(open.tabId)
  staleTabs.delete(open.tabId)
  ui$.findInPage.set(null)
}

/** Highlights every match of the text, or with `next`, goes on to the next or previous one. */
export function findInPage(tabId: string, text: string, { next = false, forward = true } = {}) {
  const webview = getTabWebview(tabId) as FindableWebview | undefined
  if (!text) {
    stopFindInPage(tabId)
    ui$.findInPage.assign({ active: 0, total: 0 })
    return
  }
  if (next && staleTabs.has(tabId)) next = false
  staleTabs.delete(tabId)
  try {
    if (isWeb) {
      // Electron's findNext means the opposite: true starts a new search.
      webview?.findInPage?.(text, { forward, findNext: !next })
    } else if (next) {
      void Promise.resolve(webview?.findNext?.(forward)).catch(() => {})
    } else {
      void Promise.resolve(webview?.findInPage?.(text)).catch(() => {})
    }
  } catch {}
}

function stopFindInPage(tabId: string) {
  const webview = getTabWebview(tabId) as FindableWebview | undefined
  try {
    if (isWeb) {
      webview?.stopFindInPage?.('clearSelection')
    } else {
      void Promise.resolve(webview?.clearFind?.()).catch(() => {})
    }
  } catch {}
}

/** A new page in the tab: its find bar keeps the text, and searches it again when asked. */
export function onFindPageChanged(tabId: string) {
  if (ui$.findInPage.get()?.tabId !== tabId) return
  staleTabs.add(tabId)
  ui$.findInPage.assign({ active: 0, total: 0 })
}

export function setFindResult(tabId: string, active: number, total: number) {
  if (ui$.findInPage.get()?.tabId === tabId) {
    ui$.findInPage.assign({ active, total })
  }
}
