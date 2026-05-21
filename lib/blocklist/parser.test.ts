import { describe, expect, it } from 'bun:test'
import { DEFAULT_BLOCKLIST_EXPIRY_MS, getAdvertisedExpiryMs, mergeFilterListsAsync, parseFilterList, shouldBlockHost } from './parser'

describe('parseFilterList', () => {
  it('extracts host-only block and allow rules while ignoring unsupported syntax', () => {
    const parsed = parseFilterList(`
! Title: Example
! Expires: 12 hours
||ads.example.com^
@@||cdn.ads.example.com^
0.0.0.0 tracker.example
example.org
||path.example.com/foo^
example.net$image
||third-party.example^$third-party
@@||allow.third-party.example^$third-party
news.example##.promo
`)

    expect(parsed.blockedHosts).toEqual(['ads.example.com', 'example.org', 'third-party.example', 'tracker.example'])
    expect(parsed.allowedHosts).toEqual(['allow.third-party.example', 'cdn.ads.example.com'])
    expect(parsed.cosmeticFilters).toEqual(['news.example##.promo'])
    expect(parsed.cosmeticExceptions).toEqual([])
    expect(parsed.expiresInMs).toBe(12 * 60 * 60 * 1000)
  })

  it('falls back to the default expiry when the list header does not advertise one', () => {
    expect(getAdvertisedExpiryMs('! no expiry header')).toBe(DEFAULT_BLOCKLIST_EXPIRY_MS)
  })

  it('merges multiple lists without changing host semantics', async () => {
    const parsed = await mergeFilterListsAsync([
      `
||ads.example.com^
0.0.0.0 tracker.example
`,
      `
@@||cdn.ads.example.com^
ads.example.com
`,
    ])

    expect(parsed.blockedHosts).toEqual(['ads.example.com', 'tracker.example'])
    expect(parsed.allowedHosts).toEqual(['cdn.ads.example.com'])
    expect(parsed.cosmeticFilters).toEqual([])
    expect(parsed.cosmeticExceptions).toEqual([])
  })
})

describe('shouldBlockHost', () => {
  it('allows a more specific exception to override a broader block', () => {
    expect(shouldBlockHost('img.cdn.ads.example.com', new Set(['example.com']), new Set(['ads.example.com']))).toBe(
      false,
    )
  })

  it('keeps a more specific block over a broader allow', () => {
    expect(shouldBlockHost('img.ads.example.com', new Set(['ads.example.com']), new Set(['example.com']))).toBe(true)
  })

  it('blocks ad exchange subdomains from a broader host rule', () => {
    expect(shouldBlockHost('zks1-ib.adnxs.com', new Set(['adnxs.com']), new Set())).toBe(true)
  })

  it('lets an exact allow win on a tie', () => {
    expect(shouldBlockHost('ads.example.com', new Set(['ads.example.com']), new Set(['ads.example.com']))).toBe(false)
  })
})
