import { describe, expect, it } from 'bun:test'
import { getSiteFromProfileId, getSiteFromUrl, getSiteProfileId, isSiteProfileId } from './site-profile'

describe('site profile helpers', () => {
  it('groups subdomains by registrable site', () => {
    expect(getSiteFromUrl('https://m.facebook.com/story.php')).toBe('facebook.com')
    expect(getSiteFromUrl('https://www.facebook.com/messages/')).toBe('facebook.com')
    expect(getSiteFromUrl('https://business.facebook.com/')).toBe('facebook.com')
    expect(getSiteProfileId('https://m.facebook.com/story.php')).toBe('site:facebook.com')
  })

  it('handles multi-part public suffixes', () => {
    expect(getSiteFromUrl('https://accounts.example.co.uk/login')).toBe('example.co.uk')
    expect(getSiteProfileId('https://www.example.co.uk/')).toBe('site:example.co.uk')
  })

  it('does not create site profiles for invalid or non-web urls', () => {
    expect(getSiteProfileId('')).toBeUndefined()
    expect(getSiteProfileId('not a url')).toBeUndefined()
    expect(getSiteProfileId('mailto:test@example.com')).toBeUndefined()
  })

  it('reads site profile ids', () => {
    expect(isSiteProfileId('site:facebook.com')).toBe(true)
    expect(getSiteFromProfileId('site:facebook.com')).toBe('facebook.com')
    expect(isSiteProfileId('default')).toBe(false)
  })
})
