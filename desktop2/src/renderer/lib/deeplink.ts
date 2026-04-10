import { openSharedUrl } from '@/lib/page'

export function handleDeeplink(link: string) {
  const url = new URL(link)
  if (url.protocol != 'nora:') {
    return
  }
  // console.log('on deeplink', link)
  openSharedUrl(link)
}

window.noraDeeplink = handleDeeplink
