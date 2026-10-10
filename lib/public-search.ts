/**
 * Search of the public posts of a social network through DuckDuckGo, so it works
 * without being signed in to that network. The query is scoped with a `site:`
 * operator, which is what the user would otherwise have to type by hand.
 */

/**
 * The domain each service's public pages live on. Only these ever reach the
 * `site:` operator, so a stored or imported value can't widen the search to
 * another site.
 */
export const publicSearchSites: Record<string, string> = {
  bluesky: 'bsky.app',
  facebook: 'facebook.com',
  instagram: 'instagram.com',
  linkedin: 'linkedin.com',
  reddit: 'reddit.com',
  threads: 'threads.com',
  tiktok: 'tiktok.com',
  tumblr: 'tumblr.com',
  vk: 'vk.com',
  x: 'x.com',
}

export const publicSearchServiceIds = Object.keys(publicSearchSites)

export const DEFAULT_PUBLIC_SEARCH_SERVICE_ID = 'reddit'

// Own keys only: a stored value like `constructor` is on every object's prototype.
const getPublicSearchSite = (serviceId: unknown) =>
  typeof serviceId === 'string' && Object.hasOwn(publicSearchSites, serviceId) ? publicSearchSites[serviceId] : undefined

export function normalizePublicSearchServiceId(serviceId: unknown) {
  return getPublicSearchSite(serviceId) ? (serviceId as string) : DEFAULT_PUBLIC_SEARCH_SERVICE_ID
}

export function resolvePublicSearchUrl(serviceId: string, input: string) {
  const site = getPublicSearchSite(serviceId)
  const query = input.trim()
  if (!site || !query) {
    return null
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(`site:${site} ${query}`)}`
}
