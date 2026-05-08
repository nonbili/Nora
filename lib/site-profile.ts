import { parse } from 'tldts'

export const AUTO_PROFILE_ID = 'auto'
export const SITE_PROFILE_PREFIX = 'site:'
export type ProfileMode = 'auto' | 'manual'

export function getSiteFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const protocol = parsedUrl.protocol.toLowerCase()
    if (protocol !== 'http:' && protocol !== 'https:') {
      return undefined
    }

    const host = parsedUrl.hostname.toLowerCase()
    if (!host) {
      return undefined
    }

    const parsed = parse(host, { allowPrivateDomains: true })
    return (parsed.domain || host).replace(/^www\./, '')
  } catch {
    return undefined
  }
}

export function getSiteProfileId(url: string) {
  const site = getSiteFromUrl(url)
  return site ? `${SITE_PROFILE_PREFIX}${site}` : undefined
}

export function getSiteFromProfileId(profileId?: string | null) {
  if (!profileId?.startsWith(SITE_PROFILE_PREFIX)) {
    return undefined
  }
  return profileId.slice(SITE_PROFILE_PREFIX.length) || undefined
}

export function isSiteProfileId(profileId?: string | null) {
  return Boolean(getSiteFromProfileId(profileId))
}
