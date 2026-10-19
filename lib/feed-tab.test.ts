import { describe, expect, it } from 'bun:test'
import { FEED_TAB_URL, isFeedTabUrl } from './feed-tab'

describe('isFeedTabUrl', () => {
  it('tells the feed tab from web pages', () => {
    expect(isFeedTabUrl(FEED_TAB_URL)).toBe(true)
    expect(isFeedTabUrl(`${FEED_TAB_URL}?id=abc`)).toBe(true)
    expect(isFeedTabUrl('nora://feeds')).toBe(false)
    expect(isFeedTabUrl('https://feed')).toBe(false)
    expect(isFeedTabUrl('')).toBe(false)
    expect(isFeedTabUrl(undefined)).toBe(false)
  })
})
