// Only choose a default when the URL has no explicit search mode. In particular,
// a user's later switch to Top (f=top) must not be changed back to Latest.
export const getXLatestSearchUrl = (href: string, enabled: boolean, manualQueries: ReadonlySet<string> = new Set()): string | null => {
  if (!enabled) return null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (
    url.protocol !== 'https:' || url.hostname !== 'x.com' || url.pathname !== '/search' ||
    !url.searchParams.get('q')?.trim() || url.searchParams.has('f') || manualQueries.has(url.searchParams.get('q')!)
  ) return null
  url.searchParams.set('f', 'live')
  return url.href
}
