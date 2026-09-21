import { describe, expect, test } from 'bun:test'
import { isNewerVersion, parseStableVersion } from './upgrade'

describe('upgrade version comparison', () => {
  test('compares numeric version parts rather than strings', () => {
    expect(isNewerVersion('v0.2.10', '0.2.9')).toBe(true)
    expect(isNewerVersion('v0.3.0', '0.2.99')).toBe(true)
    expect(isNewerVersion('v1.0.0', '0.99.99')).toBe(true)
    expect(isNewerVersion('v0.2.8', '0.2.8')).toBe(false)
    expect(isNewerVersion('v0.2.8', '0.3.0')).toBe(false)
  })

  test('rejects malformed tags and prereleases', () => {
    for (const tag of ['0.3', 'latest', 'v0.3.0-beta.1', 'v0.3.0\n']) {
      expect(parseStableVersion(tag)).toBeNull()
      expect(isNewerVersion(tag, '0.2.8')).toBe(false)
    }
  })
})
