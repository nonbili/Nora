const chromeVersion = 142

export function getUserAgent(platform = 'android', isDesktop = false) {
  if (platform === 'ios') {
    if (isDesktop) {
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15`
    }
    return `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`
  }
  const mobile = platform == 'android' ? 'Mobile ' : ''
  const detail =
    {
      darwin: 'Macintosh; Intel Mac OS X 10_15_7',
      linux: 'X11; Linux x86_64',
      android: 'Linux; Android 10; K',
    }[platform] || 'Windows NT 10.0; Win64; x64'
  return `Mozilla/5.0 (${detail}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 ${mobile}Safari/537.36`
}
