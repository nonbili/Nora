import { isBlocklistExcludedHost } from './blocklist/policy'

/**
 * The profile that holds browsing done without an account. It is an ordinary
 * profile -- its own cookies and storage, listed with the others -- under a
 * fixed id, so that the anonymous mode and public search can tell which tabs
 * are meant to be account-free.
 */
export const ANONYMOUS_PROFILE_ID = 'anonymous'
export const ANONYMOUS_PROFILE_NAME = 'Anonymous'
export const ANONYMOUS_PROFILE_COLOR = '#475569'

export function isAnonymousProfile(profileId?: string | null) {
  return profileId === ANONYMOUS_PROFILE_ID
}

/**
 * Whether the anonymous mode applies to a page. It is a property of the
 * Anonymous profile, not of the app: tabs signed in to an account are never
 * touched, whatever the switch says. The sites the user turned it off for are
 * checked with the same rule as the per-site ad blocking exceptions.
 */
export function isAnonymousModeActive({
  enabled,
  profileId,
  host,
  disabledHosts,
}: {
  enabled: boolean
  profileId?: string | null
  host?: string | null
  disabledHosts: Iterable<string>
}) {
  return enabled && isAnonymousProfile(profileId) && !isBlocklistExcludedHost(host, disabledHosts)
}

/**
 * Hands the page what it needs to apply the mode from document start, before the
 * app has pushed its settings: whether this tab is in the Anonymous profile with
 * the mode on, and the sites it is off for. Like the ad blocking exceptions it
 * carries the hosts rather than a resolved flag, because the view is created
 * before it has navigated and only the page knows which site it turned out to be.
 * Empty when the mode does not apply, so other tabs get nothing injected.
 */
export function buildAnonymousModeScript({
  enabled,
  profileId,
  disabledHosts,
}: {
  enabled: boolean
  profileId?: string | null
  disabledHosts: string[]
}) {
  if (!enabled || !isAnonymousProfile(profileId)) {
    return ''
  }
  return `try{window.__noraAnonymousDisabledHosts=${JSON.stringify(disabledHosts)}}catch(e){}`
}
