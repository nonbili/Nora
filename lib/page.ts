export const homeUrls: Record<string, string> = {
  instagram: 'https://www.instagram.com',
  threads: 'https://www.threads.com',
  reddit: 'https://www.reddit.com',
  x: 'https://x.com',
}

export const hostHomes: Record<string, string> = {
  'www.instagram.com': 'instagram',
  'www.threads.com': 'threads',
  'www.reddit.com': 'reddit',
  'x.com': 'x',
}

export function getHomeUrl(home: string) {
  return homeUrls[home] || homeUrls.x
}

export function fixSharingUrl(v: string) {
  try {
    const url = new URL(v)
    ;[
      // instagram & reddit
      'utm_source',
      'utm_medium',
      'utm_name',
      'utm_term',
      'utm-content',
      // instagram
      'igsh',
      // threads
      'xmt',
    ].forEach((x) => url.searchParams.delete(x))
    return url.href
  } catch (e) {
    return ''
  }
}
