import { expect, it } from 'bun:test'
import { removeTrackingParams } from './url'

it('preserves the original spelling when no tracking parameter is removed', () => {
  for (const url of [
    'https://example.com',
    'https://ja.wikipedia.org/wiki/東京',
    'https://example.com/?q=hello%20world',
    'https://x.com/u/status/123?lang=ja',
  ]) {
    expect(removeTrackingParams(url)).toBe(url)
  }
})

it('removes X share tokens while preserving attachment paths', () => {
  for (const host of ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']) {
    expect(removeTrackingParams(`https://${host}/user/status/123/photo/2?a=token&s=20&t=tracking`)).toBe(
      `https://${host}/user/status/123/photo/2`,
    )
  }
  expect(removeTrackingParams('https://x.com/i/web/status/123?a=token')).toBe('https://x.com/i/web/status/123')
})
it('keeps short query names on unrelated URLs and preserves functional parameters', () => {
  for (const url of [
    'https://example.com/user/status/123?a=1&s=2&t=3',
    'https://x.com/search?a=1&s=2&t=3',
    'https://evilx.com/u/status/123?a=1',
  ]) {
    expect(removeTrackingParams(url)).toBe(url)
  }
  expect(removeTrackingParams('https://x.com/u/status/123/video/1?a=1&lang=ja#fragment')).toBe(
    'https://x.com/u/status/123/video/1?lang=ja#fragment',
  )
  expect(removeTrackingParams('Some text https://x.com/u/status/123?a=1')).toBe(
    'Some text https://x.com/u/status/123?a=1',
  )
})
