/** What is known about Instagram's addresses, shared by the app and the content script. */

export const isInstagramHost = (host: string) => host === 'instagram.com' || host.endsWith('.instagram.com')

/** The characters and length of a profile name, as a pattern to build others from. */
export const INSTAGRAM_USERNAME_PATTERN = '[A-Za-z0-9._]{1,30}'

/** The path segments a post's own page can be under. */
export const INSTAGRAM_POST_KINDS = ['p', 'reel', 'reels', 'tv']

// Paths on instagram.com that are a page of their own and not somebody's profile.
const reservedPaths = new Set([
  'about', 'accounts', 'api', 'challenge', 'developer', 'direct', 'directory', 'explore', 'legal', 'p', 'reel', 'reels', 'stories', 'tv', 'web',
])

const PROFILE_PATH = new RegExp(`^/(${INSTAGRAM_USERNAME_PATTERN})/?$`)

/** The profile this page is, or null for any other page. */
export function getProfileUsername(hostname: string, pathname: string) {
  if (!isInstagramHost(hostname)) {
    return null
  }
  const match = pathname.match(PROFILE_PATH)
  return match && !reservedPaths.has(match[1].toLowerCase()) ? match[1] : null
}

const POST_PAGE = new RegExp(`^/(?:${INSTAGRAM_USERNAME_PATTERN}/)?(${INSTAGRAM_POST_KINDS.join('|')})/([A-Za-z0-9_-]{5,})/?$`)

/**
 * Where a post's own page should be shown instead: its embed page. A visitor without an
 * account gets the post behind a sign-up dialog; the embed page has the player and needs
 * nothing. Null for any other page, and for the embed page itself.
 */
export function getEmbedUrlForPage(hostname: string, pathname: string) {
  if (!isInstagramHost(hostname)) {
    return null
  }
  const match = pathname.match(POST_PAGE)
  // A reel is also linked to under /reels/, which has no embed page of its own.
  return match ? `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/embed/` : null
}
