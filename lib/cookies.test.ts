import { describe, expect, it } from 'bun:test'
import { buildCookieScript, formatCookiesTxt, formatProfileCookiesTxt } from './cookies'

describe('buildCookieScript', () => {
  const inject = (entries: string[]) => {
    const writes: string[] = []
    const document = {
      set cookie(value: string) { writes.push(value) },
      get cookie() { return '' },
    }
    new Function('document', `return ${buildCookieScript(entries)}`)(document)
    return writes
  }

  it('sets the attributes required for secure and host-prefixed cookies', () => {
    expect(inject(['__Secure-session=a=b', '__Host-session=host-value'])).toEqual([
      '__Secure-session=a=b; path=/; max-age=31536000; Secure',
      '__Host-session=host-value; path=/; max-age=31536000; Secure',
    ])
  })

  it('handles case variants without changing cookie names', () => {
    expect(inject(['__secure-session=lowercase', '__hOsT-session=mixed'])).toEqual([
      '__secure-session=lowercase; path=/; max-age=31536000; Secure',
      '__hOsT-session=mixed; path=/; max-age=31536000; Secure',
    ])
  })

  it('keeps ordinary cookies usable on HTTP', () => {
    expect(inject(['session=ordinary', '__SecureX=ordinary'])).toEqual([
      'session=ordinary; path=/; max-age=31536000',
      '__SecureX=ordinary; path=/; max-age=31536000',
    ])
  })
})

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

describe('formatProfileCookiesTxt', () => {
  it('preserves cookie metadata', () => {
    const result = formatProfileCookiesTxt([
      {
        domain: '.example.com',
        path: '/account',
        secure: true,
        httpOnly: false,
        expires: 1893456000.9,
        name: 'session',
        value: 'abc',
      },
    ])

    expect(result).toContain('.example.com\tTRUE\t/account\tTRUE\t1893456000\tsession\tabc')
  })

  it('uses the Netscape HttpOnly domain prefix', () => {
    const result = formatProfileCookiesTxt([
      {
        domain: 'example.com',
        path: '/',
        secure: false,
        httpOnly: true,
        expires: 0,
        name: 'auth',
        value: 'secret',
      },
    ])

    expect(result).toContain('#HttpOnly_example.com\tFALSE\t/\tFALSE\t0\tauth\tsecret')
  })

  it('returns an empty string when no valid cookies exist', () => {
    expect(formatProfileCookiesTxt([])).toBe('')
  })
})
