import { describe, expect, it } from 'bun:test'
import { buildTabShortcutUrl, parseTabShortcutUrl } from './tab-shortcut'

describe('tab shortcut links', () => {
  it('round-trips a tab id and url', () => {
    const target = { id: 'abc123', url: 'https://example.com/a?b=1&c=2' }
    expect(parseTabShortcutUrl(buildTabShortcutUrl(target))).toEqual(target)
  })

  it('ignores other nora deep links', () => {
    expect(parseTabShortcutUrl('nora://settings')).toBe(null)
    expect(parseTabShortcutUrl('nora://tabs?id=1&url=https://example.com')).toBe(null)
    expect(parseTabShortcutUrl('nora://tab')).toBe(null)
  })

  it('ignores links missing an id or a url', () => {
    expect(parseTabShortcutUrl('nora://tab?id=abc123')).toBe(null)
    expect(parseTabShortcutUrl('nora://tab?url=https%3A%2F%2Fexample.com')).toBe(null)
  })

  it('ignores normal web urls', () => {
    expect(parseTabShortcutUrl('https://example.com/tab?id=1&url=x')).toBe(null)
  })
})
