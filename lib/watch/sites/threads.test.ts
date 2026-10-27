import { describe, expect, it } from 'bun:test'
import { parseThreadsPostPage, parseThreadsProfilePage } from './threads'

describe('parseThreadsProfilePage', () => {
  const post = (code: string, extra: object = {}) => ({
    pk: '1',
    code,
    taken_at: 1791824189,
    user: { username: 'zuck' },
    caption: { text: `post ${code}` },
    image_versions2: { candidates: [{ url: `https://cdn/${code}.jpg`, width: 1080, height: 1350 }] },
    original_width: 1080,
    original_height: 1350,
    ...extra,
  })
  const page = (edges: unknown[]) =>
    '<meta property="og:title" content="Mark Zuckerberg (&#064;zuck) &#x2022; Threads, Say more" />' +
    '<meta property="og:image" content="https://cdn/avatar.jpg" />' +
    `<script type="application/json" data-sjs>${JSON.stringify({ require: [[{ result: { data: { mediaData: { edges } } } }]] })}</script>`

  it('reads the first post of each thread, its photos and video, and the profile from its preview tags', () => {
    const result = parseThreadsProfilePage(
      page([
        { node: { thread_items: [{ post: post('A') }, { post: post('A2') }] } },
        { node: { thread_items: [{ post: post('B', { video_versions: [{ url: 'https://cdn/B.mp4' }] }) }] } },
        {
          node: {
            thread_items: [
              {
                post: post('C', {
                  carousel_media: [
                    { image_versions2: { candidates: [{ url: 'https://cdn/C1.jpg' }] } },
                    { image_versions2: { candidates: [{ url: 'https://cdn/C2.jpg' }] }, video_versions: [{ url: 'https://cdn/C2.mp4' }] },
                  ],
                }),
              },
            ],
          },
        },
        { node: { thread_items: [{ post: post('D', { taken_at: 1791900000, image_versions2: null, text_post_app_info: { share_info: { reposted_post: post('E', { user: { username: 'mosseri' } }) } } }) }] } },
      ]),
      'zuck',
    )
    expect(result.info).toEqual({ name: 'Mark Zuckerberg', avatar: 'https://cdn/avatar.jpg' })
    expect(result.posts.map((p) => p.id)).toEqual(['A', 'B', 'C', 'E'])
    expect(result.posts[0]).toMatchObject({
      url: 'https://www.threads.com/@zuck/post/A',
      text: 'post A',
      createdAtMs: 1791824189000,
      media: [{ type: 'image', url: 'https://cdn/A.jpg', width: 1080, height: 1350 }],
    })
    expect(result.posts[1].media).toEqual([{ type: 'video', url: 'https://cdn/B.mp4', thumb: 'https://cdn/B.jpg', width: 1080, height: 1350 }])
    expect(result.posts[2].media?.map((item) => item.url)).toEqual(['https://cdn/C1.jpg', 'https://cdn/C2.mp4'])
    expect(result.posts[3]).toMatchObject({ url: 'https://www.threads.com/@mosseri/post/E', repostOf: 'mosseri', createdAtMs: 1791900000000 })
  })

  it('throws on a page without its posts', () => {
    expect(() => parseThreadsProfilePage('<html></html>', 'zuck')).toThrow('no posts in the page')
  })
})

describe('parseThreadsPostPage', () => {
  const media = (code: string, extra: object) => ({ code, user: { username: 'zuck' }, ...extra })
  const page = (data: object) =>
    `<script type="application/json" data-sjs>${JSON.stringify({ require: [[{ __bbox: { result: { data } } }]] })}</script>`

  it('reads the photos and videos of the post asked for, not of the posts shown with it', () => {
    const html = page({
      relatedPosts: { threads: [{ thread_items: [{ post: media('X', { image_versions2: { candidates: [{ url: 'https://cdn/x.jpg' }] } }) }] }] },
      media: media('C', {
        image_versions2: { candidates: [{ url: 'https://cdn/cover.jpg' }] },
        carousel_media: [
          { image_versions2: { candidates: [{ url: 'https://cdn/c1.jpg?oe=6AD79413' }] } },
          { image_versions2: { candidates: [{ url: 'https://cdn/c2.jpg' }] }, video_versions: [{ url: 'https://cdn/c2.mp4' }] },
        ],
      }),
    })
    expect(parseThreadsPostPage(html, 'C').map((item) => item.url)).toEqual(['https://cdn/c1.jpg?oe=6AD79413', 'https://cdn/c2.mp4'])
  })

  it('throws on a page without the post', () => {
    expect(() => parseThreadsPostPage(page({ media: null }), 'C')).toThrow('no media in the post page')
  })
})
