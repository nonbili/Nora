import { blockAds } from './ad-xhr'
import { isPinterestHost } from './services/pinterest'

/**
 * Pinterest ad guard, run at document start ahead of the page's own scripts: the
 * document-start chain on mobile, the tab preload on desktop. The main bundle comes too
 * late on every platform (onPageStarted on Android, document end on iOS, dom-ready on
 * desktop), by which time Pinterest may have read its server-rendered first page and
 * sent its first feed requests. It no-ops on every other host and in frames.
 */
if (window === window.top && isPinterestHost(document.location.host)) {
  blockAds()
}
