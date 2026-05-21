const VIEW_HOSTS = new Set([
  'bsky.app',
  'www.linkedin.com',
  'www.instagram.com',
  'chat.reddit.com',
  'old.reddit.com',
  'www.reddit.com',
  'www.threads.com',
  'www.tiktok.com',
  'www.tumblr.com',
  'id.vk.com',
  'login.vk.com',
  'login.vk.ru',
  'm.vk.com',
  'vk.com',
  'x.com',
])

const INTERNAL_SCHEMES = new Set(['about', 'blob', 'data', 'file', 'http', 'https', 'javascript', 'nora'])

interface LinkHandlingSettings {
  openExternalLinkInSystemBrowser?: boolean
  internalHosts?: string[]
}

let settings: Required<LinkHandlingSettings> = {
  openExternalLinkInSystemBrowser: false,
  internalHosts: [],
}

export function setLinkHandlingSettings(next: LinkHandlingSettings) {
  settings = {
    openExternalLinkInSystemBrowser: next.openExternalLinkInSystemBrowser === true,
    internalHosts: Array.isArray(next.internalHosts) ? next.internalHosts.map((host) => host.toLowerCase()) : [],
  }
}

export function normalizeExternalTargetUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    if (url.host === 'l.threads.com') {
      return url.searchParams.get('u') || rawUrl
    }
  } catch {}
  return rawUrl
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

const getHost = (rawUrl?: string) => {
  if (!rawUrl) {
    return ''
  }
  try {
    return new URL(rawUrl).host.toLowerCase()
  } catch {
    return ''
  }
}

export function shouldOpenInSystemBrowser(rawUrl: string, sourceUrl?: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  const scheme = url.protocol.replace(':', '').toLowerCase()
  if (!INTERNAL_SCHEMES.has(scheme)) {
    return true
  }
  if (!isHttpUrl(rawUrl) || !settings.openExternalLinkInSystemBrowser) {
    return false
  }

  const host = url.host.toLowerCase()
  const sourceHost = getHost(sourceUrl)
  const isFacebook = host.endsWith('.facebook.com') && host !== 'l.facebook.com'
  const isGoogle = host.includes('google.com') || host.includes('gstatic.com') || host.includes('recaptcha.net')
  return (
    host !== sourceHost &&
    !VIEW_HOSTS.has(host) &&
    !settings.internalHosts.includes(host) &&
    !isFacebook &&
    !isGoogle
  )
}
