import { tabs$ } from '@/states/tabs'
import { removeTrackingParams } from './url'
import { onReceiveAuthUrl } from './supabase/auth'
export { removeTrackingParams } from './url'

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

export function openSharedUrl(url: string, replace = false) {
  if (url.startsWith('nora:auth')) {
    onReceiveAuthUrl(url)
    return
  }
  try {
    const newUrl = cleanSharedUrl(url)
    if (replace) {
      tabs$.updateTabUrl(newUrl)
    } else {
      tabs$.openTab(newUrl)
    }
  } catch (e) {
    console.error(e)
  }
}
