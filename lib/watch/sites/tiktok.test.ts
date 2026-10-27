import { describe, expect, it } from 'bun:test'
import { parseTikTokChainToken, parseTikTokItemLists, parseTikTokPostPage, tiktokPostPageUrl } from './tiktok'
import { refreshesMedia } from '../media-keys'

describe('parseTikTokItemLists', () => {
  const avatar = 'https://p16-common-sign.tiktokcdn.com/avt.jpeg?x-expires=1792684800'
  const author = { uniqueId: 'nasa', nickname: 'NASA', avatarLarger: avatar }
  const video = (id: string, createTime: number, extra: Record<string, unknown> = {}) => ({
    id,
    desc: `video ${id}`,
    createTime,
    author,
    video: {
      playAddr: `https://v16-webapp-prime.tiktok.com/video/${id}/?expire=1792686113&tk=tt_chain_token`,
      cover: `https://p16-common-sign.tiktokcdn.com/${id}.image?x-expires=1792684800`,
      width: 720,
      height: 1280,
    },
    ...extra,
  })
  const photo = {
    id: '3',
    desc: 'two photos second line',
    createTime: 1788540697,
    author,
    imagePost: {
      cover: { imageURL: { urlList: ['https://p19/cover.jpeg', 'https://p16/cover.jpeg'] } },
      images: [
        { imageURL: { urlList: ['https://p16/a.jpeg'] }, imageWidth: 1080, imageHeight: 1436 },
        { imageURL: { urlList: ['https://p16/b.jpeg'] }, imageWidth: 1080, imageHeight: 1424 },
      ],
    },
    video: { playAddr: null, cover: 'https://p19/cover.jpeg', width: 0, height: 0 },
  }
  const page = (...lists: unknown[][]) =>
    lists.map((itemList) => `<script type="application/json">${JSON.stringify({ itemList, hasMore: true })}</script>`).join('\n')

  it('reads the videos and photo posts of the answers, once each, with the cookie their videos need', () => {
    const html = page([video('1', 1784664542, { isPinnedItem: true }), video('2', 1792167566), photo], [video('2', 1792167566)])
    const result = parseTikTokItemLists(html, 'nasa', 'abc==')
    expect(result.info).toEqual({ name: 'NASA', avatar })
    expect(result.pinnedIds).toEqual(['1'])
    expect(result.posts.map((post) => post.id)).toEqual(['1', '2', '3'])
    expect(result.posts[1]).toEqual({
      id: '2',
      site: 'tiktok',
      handle: 'nasa',
      url: 'https://www.tiktok.com/@nasa/video/2',
      text: 'video 2',
      image: 'https://p16-common-sign.tiktokcdn.com/2.image?x-expires=1792684800',
      media: [
        {
          type: 'video',
          url: 'https://v16-webapp-prime.tiktok.com/video/2/?expire=1792686113&tk=tt_chain_token',
          thumb: 'https://p16-common-sign.tiktokcdn.com/2.image?x-expires=1792684800',
          width: 720,
          height: 1280,
          headers: { cookie: 'tt_chain_token=abc==', referer: 'https://www.tiktok.com/' },
        },
      ],
      mediaComplete: true,
      createdAtMs: 1792167566000,
    })
    expect(result.posts[2]).toMatchObject({
      url: 'https://www.tiktok.com/@nasa/photo/3',
      text: 'two photos\nsecond line',
      image: 'https://p19/cover.jpeg',
      media: [
        { type: 'image', url: 'https://p16/a.jpeg', width: 1080, height: 1436 },
        { type: 'image', url: 'https://p16/b.jpeg', width: 1080, height: 1424 },
      ],
    })
  })

  it('leaves out ads, and the headers when the cookie is not known', () => {
    const result = parseTikTokItemLists(page([video('1', 1), video('2', 2, { isAd: true })]), 'nasa')
    expect(result.posts.map((post) => post.id)).toEqual(['1'])
    expect(result.posts[0].media?.[0].headers).toBeUndefined()
  })

  it('fails without posts', () => {
    expect(() => parseTikTokItemLists('<meta property="og:title" content="TikTok">', 'nasa')).toThrow('no posts in the page')
    expect(() => parseTikTokItemLists(page([]), 'nasa')).toThrow('no posts in the page')
  })
})

describe('parseTikTokPostPage', () => {
  const pageOf = (itemStruct: unknown) =>
    `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
      __DEFAULT_SCOPE__: { 'webapp.video-detail': { statusCode: 0, itemInfo: { itemStruct } } },
    })}</script>`

  it('reads the video of a post, made for the cookie the page set', () => {
    const html = pageOf({
      id: '2',
      author: { uniqueId: 'nasa' },
      video: { playAddr: 'https://v16/2.mp4?expire=1', cover: 'https://p16/2.image', width: 576, height: 1024 },
    })
    expect(parseTikTokPostPage(html, 'new==')).toEqual({
      media: [
        {
          type: 'video',
          url: 'https://v16/2.mp4?expire=1',
          thumb: 'https://p16/2.image',
          width: 576,
          height: 1024,
          headers: { cookie: 'tt_chain_token=new==', referer: 'https://www.tiktok.com/' },
        },
      ],
      cover: 'https://p16/2.image',
    })
  })

  it('fails on a page without the post', () => {
    expect(() => parseTikTokPostPage('<html></html>')).toThrow('no media in the post page')
    expect(() => parseTikTokPostPage(pageOf({}))).toThrow('no media in the post page')
  })

  it('is asked for at /video/, which has the photos of a photo post too', () => {
    expect(tiktokPostPageUrl({ handle: 'nasa', id: '3' })).toBe('https://www.tiktok.com/@nasa/video/3')
    expect(refreshesMedia('tiktok')).toBe(true)
  })
})

describe('parseTikTokChainToken', () => {
  it('reads the cookie from a cookie header or a set-cookie', () => {
    expect(parseTikTokChainToken('ttwid=1; tt_chain_token=abc+/=; msToken=x')).toBe('abc+/=')
    expect(parseTikTokChainToken('tt_chain_token=GjwV==; path=/; expires=Sun, 18 Apr 2027 00:00:00 GMT; domain=.tiktok.com')).toBe('GjwV==')
    expect(parseTikTokChainToken('msToken=x')).toBeUndefined()
    expect(parseTikTokChainToken(null)).toBeUndefined()
  })
})
