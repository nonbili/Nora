import { tabs$ } from '@/states/tabs'
import { removeTrackingParams } from './url'
import { onReceiveAuthUrl } from './supabase/auth'
import NoraViewModule from '@/modules/nora-view'
import { isAuthCallbackUrl } from './auth-callback'
import { isExternalAppUrl } from './url-schemes'
import { parseTabShortcutUrl } from './tab-shortcut'
import { tabGroups$ } from '@/states/tab-groups'
export { removeTrackingParams } from './url'
export { isAuthCallbackUrl } from './auth-callback'

export const homeUrls: Record<string, string> = {
  bluesky: 'https://bsky.app',
  facebook: 'https://m.facebook.com',
  'facebook-messenger': 'https://www.facebook.com/messages/',
  instagram: 'https://www.instagram.com',
  linkedin: 'https://www.linkedin.com',
  reddit: 'https://www.reddit.com',
  threads: 'https://www.threads.com',
  tiktok: 'https://www.tiktok.com',
  tumblr: 'https://www.tumblr.com',
  vk: 'https://m.vk.com',
  x: 'https://x.com',
}

export function getHomeUrl(home: string) {
  return homeUrls[home] || homeUrls.x
}

export function cleanSharedUrl(url: string) {
  return removeTrackingParams(url.replace('nora://', 'https://'))
}

// A home-screen shortcut points at the tab it was pinned from. Focus that tab when it is
// still around, and fall back to opening its url in a new tab when it is gone.
function focusShortcutTab(tabId: string) {
  const exists = tabs$.tabs.get().some((tab) => tab.id === tabId)
  if (!exists) {
    return false
  }
  // The desktop layout only shows the active group's tabs, and swaps any other active tab
  // back out, so the active group has to follow the tab -- including back out of a group.
  const group = tabGroups$.groups.get().find((currentGroup) => currentGroup.tabIds.includes(tabId))
  tabGroups$.setActiveGroup(group?.id ?? null)
  tabs$.setActiveTabById(tabId, 'user')
  return true
}

export async function openSharedUrl(url: string, replace = false) {
  const shortcut = parseTabShortcutUrl(url)
  if (shortcut) {
    if (focusShortcutTab(shortcut.id)) {
      return
    }
    // The pinned tab is gone, so its url opens as a new ungrouped tab -- which the desktop
    // layout only shows once no group is active.
    tabGroups$.setActiveGroup(null)
    url = shortcut.url
  }
  if (isAuthCallbackUrl(url)) {
    await onReceiveAuthUrl(url)
    return
  }
  if (isExternalAppUrl(url)) {
    void NoraViewModule.openExternalUrl(url).catch((e) => {
      console.error(e)
    })
    return
  }
  try {
    const newUrl = cleanSharedUrl(url)
    if (replace) {
      tabs$.updateTabUrl(newUrl)
    } else {
      tabs$.openTab(newUrl, { source: 'shared' })
    }
  } catch (e) {
    console.error(e)
  }
}
