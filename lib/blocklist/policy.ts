import type { BlocklistSnapshot } from './types'

export const BLOCKLIST_BACKGROUND_REFRESH_MS = 7 * 24 * 60 * 60 * 1000

export function shouldAutoRefresh(state: BlocklistSnapshot, now = Date.now()) {
  if (!state.enabled || state.phase === 'fetching') {
    return false
  }

  if (!state.hasSnapshot || !state.lastUpdatedAt) {
    return true
  }

  return now - state.lastUpdatedAt >= BLOCKLIST_BACKGROUND_REFRESH_MS
}

/**
 * The key a per-site exception is stored under. `www.` is dropped so turning
 * blocking off on `www.example.com` also covers `example.com` and its other
 * subdomains, which is what a per-site switch is expected to do.
 */
export function toBlocklistSiteKey(host?: string | null) {
  const normalized = (host || '').trim().toLowerCase().replace(/\.$/, '')
  if (!normalized) {
    return ''
  }
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized
}

/**
 * Toggle a per-site exception. Turning blocking back on has to drop whichever
 * stored key was covering the site -- an `example.com` exception is what makes
 * `login.example.com` excluded, so removing only the exact key would leave the
 * site excluded. Related keys in the other direction go too, so the switch
 * means "blocking on for this site and everything under it".
 */
export function updateBlocklistExclusions(excludedHosts: string[], host: string, excluded: boolean) {
  const key = toBlocklistSiteKey(host)
  if (!key) {
    return excludedHosts
  }

  const isRelated = (entry: string) => entry === key || entry.endsWith(`.${key}`) || key.endsWith(`.${entry}`)
  const next = excludedHosts.filter((entry) => !isRelated(entry))
  if (excluded) {
    next.push(key)
  }
  return next
}

export function isBlocklistExcludedHost(host: string | null | undefined, excludedHosts: Iterable<string>) {
  const key = toBlocklistSiteKey(host)
  if (!key) {
    return false
  }

  const excluded = new Set(excludedHosts)
  if (!excluded.size) {
    return false
  }

  const parts = key.split('.')
  for (let index = 0; index < parts.length; index++) {
    if (excluded.has(parts.slice(index).join('.'))) {
      return true
    }
  }
  return false
}
