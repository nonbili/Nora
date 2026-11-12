import { describe, expect, test } from 'bun:test'
import { buildCosmeticCss } from './cosmetic'

describe('cosmetic rules shared by browser tabs and standalone shortcuts', () => {
  test('applies generic and parent-domain rules while respecting negative domains', () => {
    const rules = ['##.generic', 'example.com##.site', '~example.com##.other', 'other.com##.unrelated', 'invalid']
    expect(buildCosmeticCss('news.example.com', rules, [])).toBe(
      '.generic{display:none!important;}\n.site{display:none!important;}',
    )
    expect(buildCosmeticCss('notexample.com', rules, [])).toBe(
      '.generic{display:none!important;}\n.other{display:none!important;}',
    )
  })

  test('only matching exceptions suppress a selector', () => {
    const rules = ['##.ad', 'x.com##.promoted', 'x.com##.keep-blocked']
    expect(buildCosmeticCss('x.com', rules, ['x.com#@#.ad', 'example.com#@#.keep-blocked'])).toBe(
      '.promoted{display:none!important;}\n.keep-blocked{display:none!important;}',
    )
  })
})
