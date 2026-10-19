import { describe, expect, it } from 'bun:test'
import { FEED_TAB_URL, feedTabUrl, getFeedTimelineId, isFeedTabUrl } from './feed-tab'

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

describe('feedTabUrl', () => {
  it('names the timeline a tab shows, and none for the whole feed', () => {
    expect(feedTabUrl()).toBe(FEED_TAB_URL)
    expect(getFeedTimelineId(feedTabUrl())).toBeUndefined()
    expect(getFeedTimelineId(feedTabUrl('a b'))).toBe('a b')
    expect(getFeedTimelineId('https://x.com/?timeline=a')).toBeUndefined()
  })
})
