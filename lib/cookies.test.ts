import { describe, expect, it } from 'bun:test'
import { formatCookiesTxt } from './cookies'

describe('formatCookiesTxt', () => {
  it('formats multiple HTTPS cookies as Netscape rows', () => {
    const result = formatCookiesTxt('session=abc; token=a=b=c', 'https://sub.example.com/path')

    expect(result).toContain('# Netscape HTTP Cookie File')
    expect(result).toContain('sub.example.com\tFALSE\t/\tTRUE\t0\tsession\tabc')
    expect(result).toContain('sub.example.com\tFALSE\t/\tTRUE\t0\ttoken\ta=b=c')
  })

  it('marks HTTP cookies as insecure', () => {
    expect(formatCookiesTxt('name=value', 'http://example.com')).toContain(
      'example.com\tFALSE\t/\tFALSE\t0\tname\tvalue',
    )
  })

  it('returns an empty string when there are no valid cookies', () => {
    expect(formatCookiesTxt('', 'https://example.com')).toBe('')
    expect(formatCookiesTxt('invalid', 'https://example.com')).toBe('')
  })

  it('throws for an invalid URL', () => {
    expect(() => formatCookiesTxt('name=value', 'not a url')).toThrow()
  })
})
