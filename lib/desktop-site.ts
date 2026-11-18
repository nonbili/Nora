// Sites whose web app is only served to a computer: a phone's user agent gets a page telling it to get the app.
const desktopOnlyHosts = ['web.whatsapp.com']

export const wantsDesktopSite = (url?: string | null) => {
  if (!url) return false
  try {
    return desktopOnlyHosts.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

// WhatsApp sends a phone to a static page, /mobile/, that stays the same with any user agent: a computer goes back to
// the app at the root.
export const desktopSiteUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'web.whatsapp.com' && parsed.pathname.startsWith('/mobile')) {
      return 'https://web.whatsapp.com/'
    }
  } catch {}
  return url
}
