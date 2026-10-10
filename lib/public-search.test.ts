import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_PUBLIC_SEARCH_SERVICE_ID,
  normalizePublicSearchServiceId,
  publicSearchServiceIds,
  publicSearchSites,
  resolvePublicSearchUrl,
} from './public-search'

describe('resolvePublicSearchUrl', () => {
  it('scopes the query to the service domain on DuckDuckGo', () => {
    const url = new URL(resolvePublicSearchUrl('reddit', 'rust async')!)
    expect(url.origin).toBe('https://duckduckgo.com')
    expect(url.searchParams.get('q')).toBe('site:reddit.com rust async')
  })

  it('encodes characters that would otherwise change the query', () => {
    const url = new URL(resolvePublicSearchUrl('x', 'a&b=c #tag')!)
    expect(url.searchParams.get('q')).toBe('site:x.com a&b=c #tag')
    expect([...url.searchParams.keys()]).toEqual(['q'])
  })

  it('trims the query and refuses an empty one', () => {
    expect(new URL(resolvePublicSearchUrl('bluesky', '  hello  ')!).searchParams.get('q')).toBe('site:bsky.app hello')
    expect(resolvePublicSearchUrl('bluesky', '   ')).toBeNull()
  })

  it('only searches the known domains', () => {
    expect(resolvePublicSearchUrl('evil', 'hello')).toBeNull()
    expect(resolvePublicSearchUrl('facebook-messenger', 'hello')).toBeNull()
    expect(resolvePublicSearchUrl('__proto__', 'hello')).toBeNull()
  })
})

describe('normalizePublicSearchServiceId', () => {
  it('keeps a known service', () => {
    expect(normalizePublicSearchServiceId('tumblr')).toBe('tumblr')
  })

  it('falls back for unknown or malformed values', () => {
    expect(normalizePublicSearchServiceId('nope')).toBe(DEFAULT_PUBLIC_SEARCH_SERVICE_ID)
    expect(normalizePublicSearchServiceId(undefined)).toBe(DEFAULT_PUBLIC_SEARCH_SERVICE_ID)
    expect(normalizePublicSearchServiceId(42)).toBe(DEFAULT_PUBLIC_SEARCH_SERVICE_ID)
    expect(normalizePublicSearchServiceId('constructor')).toBe(DEFAULT_PUBLIC_SEARCH_SERVICE_ID)
  })
})

describe('publicSearchSites', () => {
  it('covers the built-in services except messenger', () => {
    expect([...publicSearchServiceIds].sort()).toEqual(
      ['bluesky', 'facebook', 'instagram', 'linkedin', 'reddit', 'threads', 'tiktok', 'tumblr', 'vk', 'x'],
    )
  })

  it('uses bare registrable domains', () => {
    for (const site of Object.values(publicSearchSites)) {
      expect(site).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)
      expect(site.startsWith('www.')).toBe(false)
    }
  })
})
