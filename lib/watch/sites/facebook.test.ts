import { describe, expect, it } from 'bun:test'
import { isFacebookErrorPage, parseFacebookPage, parseFacebookPostPage, reachesBackTo } from './facebook'

describe('parseFacebookPage', () => {
  const actor = (id: string, name: string, url: string) => ({ __typename: 'User', id, name, url })
  const nasa = actor('100044561550831', 'NASA', 'https://www.facebook.com/NASA')
  const photo = (id: string, width: number) => ({
    __typename: 'Photo',
    id,
    image: { uri: `https://scontent.example/${id}_s.jpg?oe=6ADD2A36`, width: 960, height: 1280 },
    // The size for the photo viewer can come without its address.
    viewer_image: width ? { uri: `https://scontent.example/${id}_l.jpg?oe=6ADD2A36`, width, height: Math.round(width * 1.33) } : { width: 1086, height: 1448 },
  })
  const album = {
    __typename: 'Story',
    post_id: '1658876782274358',
    creation_time: 1792181102,
    permalink_url: 'https://www.facebook.com/NASA/posts/pfbid0jza',
    sponsored_data: null,
    actors: [nasa],
    // First only by their ids, then in full.
    attachments: [
      { media: { __typename: 'Photo', id: '1' } },
      { styles: { attachment: { all_subattachments: { nodes: [{ media: photo('1', 1086) }, { media: photo('2', 0) }] } } } },
    ],
    comet_sections: {
      content: { story: { message: { text: 'Float into the weekend...' } } },
      feedback: { story: { comments: [{ body: { text: 'a comment' }, attachment: photo('9', 500) }] } },
    },
  }
  const reel = {
    __typename: 'Story',
    post_id: '1658860588942644',
    permalink_url: 'https://www.facebook.com/reel/1557618349384047/',
    actors: [nasa],
    comet_sections: {
      context_layout: { story: { comet_sections: { metadata: [{ story: { creation_time: 1792179464 } }] } } },
      content: { story: { message: { text: 'The aircraft lineup' } } },
    },
    attachments: [
      {
        styles: {
          attachment: {
            media: {
              __typename: 'Video',
              id: '1557618349384047',
              original_width: 1080,
              original_height: 1920,
              preferred_thumbnail: { image: { uri: 'https://scontent.example/reel.jpg' } },
              videoDeliveryLegacyFields: {
                browser_native_sd_url: 'https://video.example/sd.mp4',
                browser_native_hd_url: 'https://video.example/hd.mp4',
              },
            },
          },
        },
      },
    ],
  }
  const share = {
    __typename: 'Story',
    post_id: '1657000000000001',
    creation_time: 1792000000,
    permalink_url: 'https://www.facebook.com/NASA/posts/pfbid0shared',
    actors: [nasa],
    attached_story: {
      actors: [actor('100064', 'NASA Webb Telescope', 'https://www.facebook.com/NASAWebb')],
      comet_sections: { message: { story: { message: { text: 'A new image from Webb' } } } },
      attachments: [{ media: { __typename: 'Video', id: 'v', image: { uri: 'https://scontent.example/webb.jpg' } } }],
    },
  }
  const ad = { ...album, post_id: '42', sponsored_data: { ad_id: '1' } }
  const page = (documents: any[]) =>
    [
      '<meta property="og:title" content="NASA - National Aeronautics &amp; Space">',
      '<meta property="og:image" content="https://scontent.example/avatar.png">',
      ...documents.map((document) => `<script type="application/json" data-sjs>${JSON.stringify(document)}</script>`),
    ].join('\n')

  it('reads posts, their photos and videos, and the page, from the page and what it brought as it was scrolled', () => {
    const html = page([
      // The page's header, which is there with an account too, unlike its preview tags.
      {
        data: {
          user: {
            profile_header_renderer: {
              user: { name: 'NASA', profilePicLarge: { uri: 'https://scontent.example/header.png' } },
            },
          },
        },
      },
      { require: [[{ __bbox: { result: { data: { user: { timeline_list_feed_units: { edges: [{ node: album }, { node: ad }] } } } } } }]] },
      // An answer brought by scrolling, which has the first post again.
      { data: { node: { timeline_list_feed_units: { edges: [{ node: album }, { node: reel }] } } } },
      { data: { node: { timeline_list_feed_units: { edges: [{ node: share }] } } } },
    ])
    const { info, posts } = parseFacebookPage(html, 'NASA')
    expect(info).toEqual({ name: 'NASA', avatar: 'https://scontent.example/header.png' })
    expect(posts.map((post) => post.id)).toEqual(['1658876782274358', '1658860588942644', '1657000000000001'])
    expect(posts[0]).toMatchObject({
      site: 'facebook',
      handle: 'NASA',
      url: 'https://www.facebook.com/NASA/posts/pfbid0jza',
      text: 'Float into the weekend...',
      createdAtMs: 1792181102000,
      image: 'https://scontent.example/1_s.jpg?oe=6ADD2A36',
      repostOf: undefined,
    })
    expect(posts[0].media).toEqual([
      { type: 'image', url: 'https://scontent.example/1_l.jpg?oe=6ADD2A36', thumb: 'https://scontent.example/1_s.jpg?oe=6ADD2A36', width: 1086, height: 1444 },
      { type: 'image', url: 'https://scontent.example/2_s.jpg?oe=6ADD2A36', thumb: 'https://scontent.example/2_s.jpg?oe=6ADD2A36', width: 960, height: 1280 },
    ])
    expect(posts[1]).toMatchObject({
      createdAtMs: 1792179464000,
      image: 'https://scontent.example/reel.jpg',
      media: [{ type: 'video', url: 'https://video.example/hd.mp4', thumb: 'https://scontent.example/reel.jpg', width: 1080, height: 1920 }],
    })
    // A share of another page's post without a word of its own: its text, and its video only by its cover.
    expect(posts[2]).toMatchObject({ text: 'A new image from Webb', repostOf: 'NASAWebb', image: 'https://scontent.example/webb.jpg', media: [] })
  })

  it("takes a group's name and cover from its header, and else the page's preview tags", () => {
    const group = {
      data: {
        group: {
          profile_header_renderer: {
            group: { name: 'IT Humor', cover_renderer: { cover_photo_content: { photo: { image: { uri: 'https://scontent.example/cover.jpg' } } } } },
          },
        },
      },
    }
    const posts = { data: { node: { group_feed: { edges: [{ node: album }] } } } }
    expect(parseFacebookPage(page([group, posts]), 'groups/ithumor').info).toEqual({ name: 'IT Humor', avatar: 'https://scontent.example/cover.jpg' })
    expect(parseFacebookPage(page([posts]), 'NASA').info).toEqual({
      name: 'NASA - National Aeronautics & Space',
      avatar: 'https://scontent.example/avatar.png',
    })
  })

  it('throws on a page without posts', () => {
    expect(() => parseFacebookPage(page([{ data: { user: { name: 'NASA' } } }]), 'NASA')).toThrow('no posts')
    expect(() => parseFacebookPage(page([{ data: { node: { edges: [{ node: ad }] } } }]), 'NASA')).toThrow('no posts')
  })

  it("reads a post's photos from its own page, and a video's from the video's page", () => {
    const albumPost = { id: album.post_id, url: album.permalink_url }
    // The post's page has other posts too.
    expect(parseFacebookPostPage(page([{ data: { node: { edges: [{ node: reel }, { node: album }] } } }]), albumPost).media.map((item) => item.url)).toEqual([
      'https://scontent.example/1_l.jpg?oe=6ADD2A36',
      'https://scontent.example/2_s.jpg?oe=6ADD2A36',
    ])
    const video = reel.attachments[0].styles.attachment.media
    const videoPage = page([{ data: { video: { ...video, id: '28724537730537162' } } }]).replace('"post_id"', '')
    expect(
      parseFacebookPostPage(videoPage, { id: '1505458718113441', url: 'https://www.facebook.com/reel/28724537730537162/' }),
    ).toEqual({
      media: [{ type: 'video', url: 'https://video.example/hd.mp4', thumb: 'https://scontent.example/reel.jpg', width: 1080, height: 1920 }],
      cover: 'https://scontent.example/reel.jpg',
    })
    expect(parseFacebookPostPage(videoPage, { id: '1505458718113441', url: 'https://www.facebook.com/watch/?ref=x&v=28724537730537162' }).media).toHaveLength(1)
    // A video Facebook only streams, on its page or on the post's: no media, but its cover.
    const streamed = { __typename: 'Video', id: '28724537730537162', preferred_thumbnail: { image: { uri: 'https://scontent.example/streamed.jpg' } } }
    expect(
      parseFacebookPostPage(page([{ data: { video: streamed } }]).replace('"post_id"', ''), { id: '1', url: 'https://www.facebook.com/reel/28724537730537162/' }),
    ).toEqual({ media: [], cover: 'https://scontent.example/streamed.jpg' })
    const shared = { id: share.post_id, url: share.permalink_url }
    expect(parseFacebookPostPage(page([{ data: { node: share } }]), shared)).toEqual({ media: [], cover: 'https://scontent.example/webb.jpg' })
    expect(() => parseFacebookPostPage(page([{ data: { node: reel } }]), albumPost)).toThrow('no post in the page')
  })

  it('tells whether posts read reach back to a time, which a pinned post coming first does not tell', () => {
    const at = (...times: number[]) => times.map((createdAtMs, index) => ({ id: String(index), createdAtMs }))
    expect(reachesBackTo(at(300, 200), 200)).toBe(true)
    expect(reachesBackTo(at(300, 150), 200)).toBe(true)
    expect(reachesBackTo(at(300, 250), 200)).toBe(false)
    // An old pinned post, then a new one.
    expect(reachesBackTo(at(100, 300), 200)).toBe(false)
    // Nothing to reach back to before the first check, and nothing read.
    expect(reachesBackTo(at(300), undefined)).toBe(false)
    expect(reachesBackTo([], 200)).toBe(false)
    // A lone pinned post, told apart.
    expect(reachesBackTo([{ id: 'pinned', createdAtMs: 100 }], 200, ['pinned'])).toBe(false)
    expect(reachesBackTo([{ id: 'new', createdAtMs: 300 }, { id: 'pinned', createdAtMs: 100 }], 200, ['pinned'])).toBe(false)
  })

  it('tells the posts pinned to the top of a page or featured by a group', () => {
    const html = page([
      { data: { user: { profile_pinned_post: { node: { ...album, post_id: '7' } }, timeline_list_feed_units: { edges: [{ node: reel }] } } } },
      { data: { group: { highlight_units: { edges: [{ node: { story: share } }] } } } },
    ])
    expect(parseFacebookPage(html, 'NASA').pinnedIds).toEqual(['7', share.post_id])
  })

  it('tells the page Facebook answers with instead of one it does not show', () => {
    expect(isFacebookErrorPage('{"canonicalRouteName":"comet.fbweb.CometErrorRoute"}')).toBe(true)
    expect(isFacebookErrorPage('{"canonicalRouteName":"comet.fbweb.CometProfilePlusLoggedOutRoute"}')).toBe(false)
  })
})
