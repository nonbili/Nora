import { describe, expect, it } from 'bun:test'
import { isYouTubeAdApi, isYouTubeHost, stripYouTubeAds, transformYouTubeResponse } from './youtube-ads'

describe('isYouTubeHost', () => {
  it('matches the site, its subdomains and the embed hosts', () => {
    expect(isYouTubeHost('www.youtube.com')).toBe(true)
    expect(isYouTubeHost('m.youtube.com')).toBe(true)
    expect(isYouTubeHost('music.youtube.com')).toBe(true)
    expect(isYouTubeHost('youtube.com:443')).toBe(true)
    expect(isYouTubeHost('www.youtube-nocookie.com')).toBe(true)
  })

  it('does not match look-alike hosts', () => {
    expect(isYouTubeHost('www.reddit.com')).toBe(false)
    expect(isYouTubeHost('notyoutube.com')).toBe(false)
    expect(isYouTubeHost('youtube.com.evil.test')).toBe(false)
  })
})

describe('isYouTubeAdApi', () => {
  it('matches the innertube endpoints that carry ads', () => {
    expect(isYouTubeAdApi('https://www.youtube.com/youtubei/v1/player?key=x')).toBe(true)
    expect(isYouTubeAdApi('/youtubei/v1/next', 'https://www.youtube.com/watch?v=1')).toBe(true)
    expect(isYouTubeAdApi('/youtubei/v1/reel_watch_sequence', 'https://m.youtube.com/')).toBe(true)
  })

  it('ignores everything else', () => {
    expect(isYouTubeAdApi('https://www.youtube.com/watch?v=1')).toBe(false)
    expect(isYouTubeAdApi('/youtubei/v1/log_event', 'https://www.youtube.com/')).toBe(false)
    expect(isYouTubeAdApi('not a url')).toBe(false)
  })
})

describe('stripYouTubeAds', () => {
  it('drops the ad breaks from a player response', () => {
    const data = {
      adPlacements: [{ adPlacementRenderer: {} }],
      adSlots: [{}],
      playerAds: [{}],
      adBreakHeartbeatParams: 'x',
      streamingData: { formats: [{ itag: 18 }] },
      videoDetails: { videoId: 'abc' },
    }

    expect(stripYouTubeAds(data)).toEqual({
      streamingData: { formats: [{ itag: 18 }] },
      videoDetails: { videoId: 'abc' },
    } as any)
  })

  it('drops ad breaks nested in a get_watch response', () => {
    const data = [{ playerResponse: { adPlacements: [{}], videoDetails: { videoId: 'abc' } } }]
    expect(stripYouTubeAds(data)).toEqual([{ playerResponse: { videoDetails: { videoId: 'abc' } } }] as any)
  })

  it('removes promoted items from list responses, wrapped or not', () => {
    const data = {
      contents: {
        items: [
          { videoRenderer: { videoId: 'a' } },
          { adSlotRenderer: {} },
          { richItemRenderer: { content: { adSlotRenderer: {} } } },
          { richItemRenderer: { content: { videoRenderer: { videoId: 'b' } } } },
          { promotedVideoRenderer: {} },
          { itemSectionRenderer: { contents: [{ searchPyvRenderer: {} }] } },
        ],
      },
    }

    stripYouTubeAds(data)
    expect(data.contents.items).toEqual([
      { videoRenderer: { videoId: 'a' } },
      { richItemRenderer: { content: { videoRenderer: { videoId: 'b' } } } },
    ] as any)
  })

  it('leaves real content untouched and survives cycles', () => {
    const data: any = { videoDetails: { title: 'hi' } }
    data.self = data
    expect(() => stripYouTubeAds(data)).not.toThrow()
    expect(data.videoDetails).toEqual({ title: 'hi' })
  })
})

describe('transformYouTubeResponse', () => {
  it('rewrites json bodies', () => {
    const text = JSON.stringify({ adPlacements: [{}], videoDetails: { videoId: 'abc' } })
    expect(JSON.parse(transformYouTubeResponse(text))).toEqual({ videoDetails: { videoId: 'abc' } })
  })

  it('returns non-json bodies unchanged', () => {
    expect(transformYouTubeResponse('not json')).toBe('not json')
    expect(transformYouTubeResponse('')).toBe('')
  })
})
