import { describe, expect, it } from 'bun:test'
import { desktopSiteUrl, wantsDesktopSite } from './desktop-site'

describe('wantsDesktopSite', () => {
  it('matches WhatsApp Web', () => {
    expect(wantsDesktopSite('https://web.whatsapp.com')).toBe(true)
    expect(wantsDesktopSite('https://web.whatsapp.com/send?phone=1')).toBe(true)
  })

  it('leaves other sites alone', () => {
    expect(wantsDesktopSite('https://www.whatsapp.com')).toBe(false)
    expect(wantsDesktopSite('https://discord.com/app')).toBe(false)
    expect(wantsDesktopSite('https://example.com')).toBe(false)
    expect(wantsDesktopSite('')).toBe(false)
    expect(wantsDesktopSite('not a url')).toBe(false)
  })
})

describe('desktopSiteUrl', () => {
  it('sends WhatsApp mobile page back to the app', () => {
    expect(desktopSiteUrl('https://web.whatsapp.com/mobile/')).toBe('https://web.whatsapp.com/')
  })

  it('keeps other urls', () => {
    expect(desktopSiteUrl('https://web.whatsapp.com/send?phone=1')).toBe('https://web.whatsapp.com/send?phone=1')
    expect(desktopSiteUrl('https://example.com/mobile/')).toBe('https://example.com/mobile/')
    expect(desktopSiteUrl('not a url')).toBe('not a url')
  })
})
