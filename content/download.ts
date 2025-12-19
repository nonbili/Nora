export function isDownloadable(url: string) {
  const { hostname, pathname } = new URL(url)
  const slugs = pathname.split('/')
  switch (hostname) {
    case 'www.instagram.com':
      return ['reel', 'reels'].includes(slugs[1]) || slugs[2] == 'reel'
    case 'm.facebook.com':
      return ['reel', 'stories', 'watch'].includes(slugs[1])
  }
  return false
}
