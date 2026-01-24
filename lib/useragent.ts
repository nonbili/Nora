const chromeVersion = 142

// Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.95 Mobile/15E148 Safari/604.1
export function getUserAgent(platform: string, isDesktop = false) {
  const mobile = isDesktop ? '' : 'Mobile '
  const brand = platform == 'ios' && !isDesktop ? 'CriOS' : 'Chrome'
  if (platform == 'ios' && isDesktop) {
    platform = 'darwin'
  }
  const detail =
    {
      android: 'Linux; Android 10; K',
      darwin: 'Macintosh; Intel Mac OS X 10_15_7',
      ios: 'iPhone; CPU iPhone OS 18_7 like Mac OS X',
      linux: 'X11; Linux x86_64',
    }[platform] || 'Windows NT 10.0; Win64; x64'
  return `Mozilla/5.0 (${detail}) AppleWebKit/537.36 (KHTML, like Gecko) ${brand}/${chromeVersion}.0.0.0 ${mobile}Safari/537.36`
}
