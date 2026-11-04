import { expect, test } from 'bun:test'
import { getXLatestSearchUrl } from './twitter-search'

test('defaults a new X search to Latest, preserving query and other parameters', () => {
  const result = new URL(getXLatestSearchUrl('https://x.com/search?q=cats%20%26%20dogs&src=typed_query#results', true)!)
  expect(result.searchParams.get('q')).toBe('cats & dogs')
  expect(result.searchParams.get('src')).toBe('typed_query')
  expect(result.searchParams.get('f')).toBe('live')
  expect(result.hash).toBe('#results')
})

test('does not override explicit Top, Latest, people, media or empty modes', () => {
  for (const mode of ['top', 'live', 'user', 'image', 'video', '']) {
    expect(getXLatestSearchUrl(`https://x.com/search?q=cats&f=${mode}`, true)).toBeNull()
  }
})

test('respects X Top tab URLs without f after a manual tab selection', () => {
  const manual = new Set(['cats'])
  expect(getXLatestSearchUrl('https://x.com/search?q=cats', true, manual)).toBeNull()
  expect(getXLatestSearchUrl('https://x.com/search?q=dogs', true, manual)).toBe('https://x.com/search?q=dogs&f=live')
})

test('ignores disabled, invalid, off-site and non-search URLs', () => {
  expect(getXLatestSearchUrl('https://x.com/search?q=cats', false)).toBeNull()
  for (const href of ['invalid', 'https://example.com/search?q=cats', 'https://x.com/home?q=cats', 'https://x.com/search', 'https://x.com/search?q=%20', 'http://x.com/search?q=cats']) {
    expect(getXLatestSearchUrl(href, true)).toBeNull()
  }
})
