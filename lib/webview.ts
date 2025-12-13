import { isWeb } from './utils'

const chromeVersion = 142

export function getUserAgent(_platform?: string) {
  let detail = 'Linux; Android 10; K'
  let mobile = 'Mobile '
  if (isWeb || _platform) {
    const platform = _platform || window.electron.process.platform
    detail =
      {
        darwin: 'Macintosh; Intel Mac OS X 10_15_7',
        linux: 'X11; Linux x86_64',
      }[platform] || 'Windows NT 10.0; Win64; x64'
    mobile = ''
  }
  return `Mozilla/5.0 (${detail}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 ${mobile}Safari/537.36`
}
