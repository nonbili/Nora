export function isDownloadable(url: string) {
  let hostname, pathname
  try {
    ;({ hostname, pathname } = new URL(url))
  } catch (e) {
    return false
  }

  const slugs = pathname.split('/')
  switch (hostname) {
    case 'm.facebook.com':
      return ['reel', 'stories', 'watch'].includes(slugs[1])
    case 'www.instagram.com':
      return ['reel', 'reels'].includes(slugs[1]) || slugs[2] == 'reel'
  }
  return false
}
