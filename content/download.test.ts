import { describe, expect, it } from 'bun:test'
import { getFacebookDownloadInfo, getTikTokDownloadUrl, isDirectlyDownloadable, isDownloadable, normalizeDownloadUrl } from './download'

describe('isDownloadable', () => {
  for (const [url, expected] of [
    ['https://www.facebook.com/reel/404248063485974', true],
    ['https://m.facebook.com/RTLplay/videos/la-france-a-un-incroyable-talent-nouveau-sur-plug-rtl-rtlplay/404248063485974/', true],
    ['https://www.tiktok.com/@nora/video/7490557630970389780', true],
  ] as const) {
    it(`${url} => ${expected}`, () => {
      expect(isDownloadable(url)).toBe(expected)
    })
  }
})

describe('isDirectlyDownloadable', () => {
  for (const [url, expected] of [
    ['https://www.facebook.com/reel/404248063485974', true],
    ['https://m.facebook.com/RTLplay/videos/la-france-a-un-incroyable-talent-nouveau-sur-plug-rtl-rtlplay/404248063485974/', false],
    ['https://www.tiktok.com/@nora/video/7490557630970389780', true],
  ] as const) {
    it(`${url} => ${expected}`, () => {
      expect(isDirectlyDownloadable(url)).toBe(expected)
    })
  }
})

describe('normalizeDownloadUrl', () => {
  for (const [url, expected] of [
    ['https://www.facebook.com/reel/404248063485974/?mibextid=rS40aB7S9Ucbxw6v', 'https://m.facebook.com/reel/404248063485974/'],
    [
      'https://m.facebook.com/RTLplay/videos/la-france-a-un-incroyable-talent-nouveau-sur-plug-rtl-rtlplay/404248063485974/',
      'https://m.facebook.com/reel/404248063485974/',
    ],
  ] as const) {
    it(`${url} => ${expected}`, () => {
      expect(normalizeDownloadUrl(url)).toBe(expected)
    })
  }
})

describe('getFacebookDownloadInfo', () => {
  it('returns the best dash video-only url and the best progressive url separately', () => {
    expect(
      getFacebookDownloadInfo(
        [
          JSON.stringify({
            browser_native_hd_url: 'https://cdn.example.com/hd-with-audio.mp4',
            dash_prefetch_representations: {
              representations: [{ height: 720, base_url: 'https://cdn.example.com/video-only.mp4' }],
            },
          }),
        ],
        [],
        ['https://cdn.example.com/sd-with-audio.mp4'],
      ),
    ).toEqual({
      hdVideoOnlyUrl: 'https://cdn.example.com/video-only.mp4',
      standardWithAudioUrl: 'https://cdn.example.com/hd-with-audio.mp4',
    })
  })

  it('prefers the progressive data-video-url for the audio option when hd progressive is unavailable', () => {
    expect(
      getFacebookDownloadInfo(
        [
          JSON.stringify({
            dash_prefetch_representations: {
              representations: [{ height: 720, base_url: 'https://cdn.example.com/video-only.mp4' }],
            },
          }),
        ],
        [],
        ['https://cdn.example.com/video-with-audio.mp4'],
      ),
    ).toEqual({
      hdVideoOnlyUrl: 'https://cdn.example.com/video-only.mp4',
      standardWithAudioUrl: 'https://cdn.example.com/video-with-audio.mp4',
    })
  })

  it('finds progressive urls from html sources', () => {
    expect(
      getFacebookDownloadInfo(
        [],
        ['<script>{"playable_url_quality_hd":"https:\\/\\/cdn.example.com\\/hd-from-html.mp4"}</script>'],
        ['https://cdn.example.com/sd-with-audio.mp4'],
      ),
    ).toEqual({
      hdVideoOnlyUrl: undefined,
      standardWithAudioUrl: 'https://cdn.example.com/hd-from-html.mp4',
    })
  })

  it('collects values from multiple facebook nodes', () => {
    expect(
      getFacebookDownloadInfo(
        [
          JSON.stringify({
            dash_prefetch_representations: {
              representations: [{ height: 1080, base_url: 'https://cdn.example.com/hd-video-only.mp4' }],
            },
          }),
          JSON.stringify({
            browser_native_sd_url: 'https://cdn.example.com/sd-with-audio.mp4',
          }),
        ],
        [],
        [],
      ),
    ).toEqual({
      hdVideoOnlyUrl: 'https://cdn.example.com/hd-video-only.mp4',
      standardWithAudioUrl: 'https://cdn.example.com/sd-with-audio.mp4',
    })
  })
})

describe('getTikTokDownloadUrl', () => {
  it('prefers playAddr over downloadAddr from structured json', () => {
    expect(
      getTikTokDownloadUrl([
        JSON.stringify({
          __DEFAULT_SCOPE__: {
            webapp: {
              videoDetail: {
                itemInfo: {
                  itemStruct: {
                    video: {
                      playAddr: 'https://v16.tiktokcdn.com/play.mp4',
                      downloadAddr: 'https://v16.tiktokcdn.com/download.mp4',
                    },
                  },
                },
              },
            },
          },
        }),
      ]),
    ).toBe('https://v16.tiktokcdn.com/play.mp4')
  })

  it('extracts escaped urls from inline script text', () => {
    expect(
      getTikTokDownloadUrl([
        '<script>window.__UNIVERSAL_DATA_FOR_REHYDRATION__={"video":{"downloadAddr":"https:\\/\\/v16.tiktokcdn.com\\/escaped.mp4?foo=1\\u0026bar=2"}};</script>',
      ]),
    ).toBe('https://v16.tiktokcdn.com/escaped.mp4?foo=1&bar=2')
  })
})
