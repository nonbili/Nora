import NoraViewModule from '@/modules/nora-view'
import { settings$ } from '@/states/settings'
import { watch$ } from '@/states/watch'
import { isAnonymousProfile } from '@/lib/anonymous'
import type { WatchSite } from '@/lib/watch'

/**
 * The accounts watched sources are checked with: the cookies of a Nora profile logged in to the
 * site, for the requests of the feed and for reading a post again.
 */

export const parseCookieHeader = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    if (k) out[k] = part.slice(eq + 1).trim()
  }
  return out
}

// The sites an account helps with; the others are read the same without one.
export const siteCookieOrigin: Partial<Record<WatchSite, string>> = {
  x: 'https://x.com',
  instagram: 'https://www.instagram.com',
  reddit: 'https://www.reddit.com',
  facebook: 'https://www.facebook.com',
}

const isSignedIn: Partial<Record<WatchSite, (cookies: Record<string, string>) => boolean>> = {
  x: (cookies) => Boolean(cookies.auth_token && cookies.ct0),
  instagram: (cookies) => Boolean(cookies.sessionid),
  reddit: (cookies) => Boolean(cookies.reddit_session),
  facebook: (cookies) => Boolean(cookies.c_user && cookies.xs),
}

export interface SiteAccount {
  cookie: string
  // The Nora profile the cookies are of, told in the source's status.
  profileId: string
}

// The Nora profiles an account can be taken from.
const accountProfileIds = () =>
  Array.from(
    new Set(
      settings$.profiles
        .peek()
        .map((profile) => profile?.id)
        .filter((id): id is string => Boolean(id) && !isAnonymousProfile(id)),
    ),
  )

/** The Nora profile to take the site's account from: the one chosen while it is still there, else any. */
const chosenAccountProfile = (site: WatchSite, profileIds: string[]): string | undefined => {
  const chosen = watch$.accountProfiles[site].peek()
  return chosen && profileIds.includes(chosen) ? chosen : undefined
}

/** What decides which account a site is checked with; a run looks again when it changes. */
export const accountChoice = (site: WatchSite) =>
  watch$.useAccounts.peek() ? (chosenAccountProfile(site, accountProfileIds()) ?? '') : null

/**
 * The cookies of the Nora profile chosen for the site, or else of the first one signed in to it;
 * null when there is none, the site needs none, or the user turned accounts off.
 */
export const findSignedInCookies = async (site: WatchSite): Promise<SiteAccount | null> => {
  const origin = siteCookieOrigin[site]
  const signedIn = isSignedIn[site]
  if (!origin || !signedIn || !watch$.useAccounts.peek()) return null
  const all = accountProfileIds()
  const chosen = chosenAccountProfile(site, all)
  const profileIds = chosen ? [chosen] : all
  for (const profileId of profileIds) {
    try {
      const header = await NoraViewModule.getCookies(origin, profileId)
      if (header && signedIn(parseCookieHeader(header))) {
        return { cookie: header, profileId }
      }
    } catch (e) {
      console.warn('watch getCookies failed', site, e)
    }
  }
  return null
}
