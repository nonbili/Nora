import { tabs$ } from '@/states/tabs'

export const homeUrls: Record<string, string> = {
  bluesky: 'https://bsky.app',
  facebook: 'https://www.facebook.com',
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

export const hostHomes: Record<string, string> = {
  'bsky.app': 'bluesky',
  'm.facebook.com': 'facebook',
  'www.facebook.com': 'facebook-messenger',
  'www.instagram.com': 'instagram',
  'www.linkedin.com': 'linkedin',
  'chat.reddit.com': 'reddit',
  'www.reddit.com': 'reddit',
  'www.threads.com': 'threads',
  'www.tiktok.com': 'tiktok',
  'www.tumblr.com': 'tumblr',
  'm.vk.com': 'vk',
  'x.com': 'x',
}

export function getHomeUrl(home: string) {
  return homeUrls[home] || homeUrls.x
}

export function fixSharingUrl(v: string) {
  try {
    const url = new URL(v)
    ;[
      // instagram & reddit
      'utm_source',
      'utm_medium',
      'utm_name',
      'utm_term',
      'utm-content',
      // instagram
      'igsh',
      // threads
      'xmt',
    ].forEach((x) => url.searchParams.delete(x))
    return url.href
  } catch (e) {
    return ''
  }
}

export function openSharedUrl(url: string) {
  try {
    const { host } = new URL(fixSharingUrl(url))
    if (Object.keys(hostHomes).includes(host)) {
      tabs$.openTab(url.replace('nora://', 'https://'))
    }
  } catch (e) {
    console.error(e)
  }
}
