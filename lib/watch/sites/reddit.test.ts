import { describe, expect, it } from 'bun:test'
import { parseRedditCommunityCard, parseRedditListing, parseRedditPosts } from './reddit'

describe('parseRedditPosts', () => {
  const card = (attributes: string, inner = '') =>
    `<shreddit-post class="block" ${attributes}><a slot="full-post-link" href="x"></a>` +
    '<span slot="authorName"><img src="https://www.redditstatic.com/avatars/a.png" alt="u/someone avatar"></span>' +
    `${inner}</shreddit-post>`
  const page = (cards: string[]) => `<faceplate-batch>${cards.join('<shreddit-ad-post id="t3_ad"></shreddit-ad-post>')}</faceplate-batch>`

  it('reads a photo, a gallery, a gif, a video, a post of text, and a shared link', () => {
    const result = parseRedditPosts(
      page([
        card(
          'permalink="/r/pics/comments/a1/x/" content-href="https://i.redd.it/a.png" created-timestamp="2026-10-20T05:33:19.362000+0000" id="t3_a1" post-title="A walk &amp; a view" post-type="image"',
          '<div slot="post-media-container"><img alt="" role="presentation" src="https://preview.redd.it/a.png?width=640&amp;s=1" width="640" height="402">' +
            '<img data-post-media-primary alt="r/pics - A walk" src="https://preview.redd.it/a.png?width=640&amp;s=1"><img alt="r/pics - A walk" src="https://i.redd.it/a.png"></div>',
        ),
        card(
          'permalink="/r/pics/comments/a2/x/" content-href="https://www.reddit.com/gallery/a2" id="t3_a2" post-title="Two" post-type="gallery"',
          '<gallery-carousel><ul><li slot="page-1"><img src="https://preview.redd.it/b.jpg?width=640" width="4284" height="5712"><figure><zoomable-img><img src="https://i.redd.it/b.jpg"></zoomable-img></figure></li>' +
            '<li slot="page-2"><img width="10" height="20" data-lazy-src="https://preview.redd.it/c.jpg?width=640"><figure><zoomable-img><img src="https://i.redd.it/c.jpg"></zoomable-img></figure></li></ul></gallery-carousel>',
        ),
        card(
          'permalink="/r/pics/comments/a3/x/" content-href="https://i.redd.it/d.gif" id="t3_a3" post-title="Moving" post-type="gif"',
          '<shreddit-player src="https://preview.redd.it/d.gif?width=750&amp;format=mp4&amp;s=2" autoplay gif poster="https://preview.redd.it/d.gif?format=png8"></shreddit-player>',
        ),
        card(
          'permalink="/r/pics/comments/a4/x/" content-href="https://v.redd.it/e" id="t3_a4" post-title="A film" post-type="video"',
          '<shreddit-player src="https://v.redd.it/e/HLSPlaylist.m3u8" poster="https://external-preview.redd.it/e.png"></shreddit-player>',
        ),
        card(
          'permalink="/r/pics/comments/a5/x/" content-href="https://www.reddit.com/r/pics/comments/a5/x/" id="t3_a5" post-title="Hello" post-type="text"',
          '<shreddit-post-text-body slot="text-body"><a slot="text-body"><div><div id="t3_a5-post-rtjson-content" dir="auto">\n  <p>\n Hi &amp; welcome\n </p><p> see <object><a rpl href="/r/RDDT/">r/RDDT</a></object> </p>\n<pre><code>fn main() {\n    x &lt; 1;\n}\n</code></pre>\n<h2> Next </h2><p> Did: </p><ul> <li> <p> one </p> </li><li> <p> two </p> </li> </ul><p> bye </p>\n</div></div></a></shreddit-post-text-body>',
        ),
        card(
          'permalink="/r/pics/comments/a6/x/" content-href="https://example.com/podcast" id="t3_a6" post-title="A podcast" post-type="link" is-link-post',
          '<img src="https://external-preview.redd.it/p.jpeg?width=140&amp;s=3" alt="r/pics - A podcast" loading="lazy">',
        ),
        card('permalink="/r/pics/comments/a7/x/" id="t3_a7" post-title="Buy" promoted'),
      ]),
      'r/pics',
    )
    expect(result.info).toEqual({ avatar: undefined })
    expect(result.posts.map((post) => post.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
    expect(result.posts[0]).toMatchObject({
      url: 'https://www.reddit.com/r/pics/comments/a1/x/',
      text: 'A walk & a view',
      image: 'https://preview.redd.it/a.png?width=640&s=1',
      media: [{ type: 'image', url: 'https://i.redd.it/a.png', thumb: 'https://preview.redd.it/a.png?width=640&s=1', width: 640, height: 402 }],
      createdAtMs: Date.parse('2026-10-20T05:33:19.362Z'),
    })
    expect(result.posts[1].media).toEqual([
      { type: 'image', url: 'https://i.redd.it/b.jpg', thumb: 'https://preview.redd.it/b.jpg?width=640', width: 4284, height: 5712 },
      { type: 'image', url: 'https://i.redd.it/c.jpg', thumb: 'https://preview.redd.it/c.jpg?width=640', width: 10, height: 20 },
    ])
    expect(result.posts[2]).toMatchObject({
      image: 'https://preview.redd.it/d.gif?format=png8',
      media: [{ type: 'video', url: 'https://preview.redd.it/d.gif?width=750&format=mp4&s=2', thumb: 'https://preview.redd.it/d.gif?format=png8' }],
    })
    expect(result.posts[3]).toMatchObject({ text: 'A film', image: 'https://external-preview.redd.it/e.png', media: [] })
    expect(result.posts[4]).toMatchObject({
      text: 'Hello\n\nHi & welcome\n\nsee https://www.reddit.com/r/RDDT/\n\nfn main() {\n    x < 1;\n}\n\nNext\n\nDid:\n- one\n- two\n\nbye',
      media: [],
    })
    expect(result.posts[5]).toMatchObject({
      text: 'A podcast\n\nhttps://example.com/podcast',
      image: 'https://external-preview.redd.it/p.jpeg?width=140&s=3',
      media: [],
    })
  })

  it("takes a user's picture from their own posts", () => {
    const result = parseRedditPosts(
      page([
        card('permalink="/r/a/comments/b1/x/" id="t3_b1" post-title="Theirs" author="other" icon="https://other.png"'),
        card('permalink="/user/spez/comments/b2/x/" id="t3_b2" post-title="Mine" author="spez" icon="https://spez.png?width=48&amp;s=1"'),
      ]),
      'u/Spez',
    )
    expect(result.info).toEqual({ avatar: 'https://spez.png?width=48&s=1' })
  })

  it('throws on a page without posts, as Reddit answers a name it does not have with', () => {
    expect(() => parseRedditPosts('<html>Reddit - The heart of the internet</html>', 'r/nope')).toThrow('no posts')
  })
})

describe('parseRedditListing', () => {
  const listing = (posts: any[]) => ({ kind: 'Listing', data: { children: posts.map((data) => ({ kind: 't3', data })) } })
  const base = (id: string, rest: any) => ({ id, permalink: `/r/pics/comments/${id}/x/`, created_utc: 1792474399, subreddit: 'pics', ...rest })

  it('reads a photo, a gallery, a gif, a video, a post of text, a shared link, and a crosspost', () => {
    const preview = (url: string) => ({
      source: { url: `${url}?s=big`, width: 2000, height: 1000 },
      resolutions: [
        { url: `${url}?width=320`, width: 320 },
        { url: `${url}?width=640`, width: 640 },
        { url: `${url}?width=1080`, width: 1080 },
      ],
    })
    const result = parseRedditListing(
      listing([
        base('a1', { title: 'A walk', url: 'https://i.redd.it/a.png', preview: { images: [preview('https://preview.redd.it/a.png')] }, sr_detail: { community_icon: 'https://icon.png' } }),
        base('a2', {
          title: 'Two',
          url: 'https://www.reddit.com/gallery/a2',
          is_gallery: true,
          gallery_data: { items: [{ media_id: 'm1' }, { media_id: 'm2' }, { media_id: 'gone' }] },
          media_metadata: {
            m1: { status: 'valid', e: 'Image', s: { u: 'https://preview.redd.it/m1.jpg?s=1', x: 30, y: 40 }, p: [{ u: 'https://preview.redd.it/m1.jpg?width=640', x: 640 }] },
            m2: { status: 'valid', e: 'AnimatedImage', s: { mp4: 'https://preview.redd.it/m2.gif?format=mp4', gif: 'https://i.redd.it/m2.gif', x: 1, y: 2 } },
          },
        }),
        base('a3', {
          title: 'Moving',
          url: 'https://i.redd.it/d.gif',
          preview: { images: [{ ...preview('https://preview.redd.it/d.gif'), variants: { mp4: { source: { url: 'https://preview.redd.it/d.gif?format=mp4' } } } }] },
        }),
        base('a4', { title: 'A film', url: 'https://v.redd.it/e', is_video: true, preview: { images: [preview('https://external-preview.redd.it/e.png')] } }),
        base('a5', { title: 'Hello', url: 'https://www.reddit.com/r/pics/comments/a5/x/', is_self: true,
          selftext: '**Hi** & [welcome](/r/RDDT/)',
          selftext_html: '<!-- SC_OFF --><div class="md"><p><strong>Hi</strong> &amp; <a href="/r/RDDT/">welcome</a></p>\n\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n</div><!-- SC_ON -->',
        }),
        base('a6', { title: 'A podcast', url: 'https://example.com/podcast' }),
        base('a7', { title: 'Shared', url: '/r/other/comments/z/x/', crosspost_parent_list: [{ url: 'https://i.redd.it/z.png', title: 'Original' }] }),
      ]),
      'r/pics',
    )
    expect(result.info).toEqual({ avatar: 'https://icon.png' })
    expect(result.posts[0]).toMatchObject({
      id: 'a1',
      url: 'https://www.reddit.com/r/pics/comments/a1/x/',
      text: 'A walk',
      image: 'https://preview.redd.it/a.png?width=640',
      media: [{ type: 'image', url: 'https://i.redd.it/a.png', thumb: 'https://preview.redd.it/a.png?width=640', width: 2000, height: 1000 }],
      createdAtMs: 1792474399000,
    })
    expect(result.posts[1]).toMatchObject({
      text: 'Two',
      media: [
        { type: 'image', url: 'https://preview.redd.it/m1.jpg?s=1', thumb: 'https://preview.redd.it/m1.jpg?width=640', width: 30, height: 40 },
        { type: 'video', url: 'https://preview.redd.it/m2.gif?format=mp4', width: 1, height: 2 },
      ],
    })
    expect(result.posts[2].media).toMatchObject([{ type: 'video', url: 'https://preview.redd.it/d.gif?format=mp4' }])
    expect(result.posts[3]).toMatchObject({ image: 'https://external-preview.redd.it/e.png?width=640', media: [] })
    expect(result.posts[4]).toMatchObject({ text: 'Hello\n\nHi & https://www.reddit.com/r/RDDT/\n- one\n- two', media: [] })
    expect(result.posts[5]).toMatchObject({ text: 'A podcast\n\nhttps://example.com/podcast', media: [] })
    expect(result.posts[6]).toMatchObject({ text: 'Shared', media: [{ type: 'image', url: 'https://i.redd.it/z.png' }] })
  })

  it('reads a body that starts with a list', () => {
    const result = parseRedditListing(listing([base('b1', { title: 'A list', is_self: true, selftext_html: '<div class="md"><ul><li>one</li><li>two</li></ul></div>' })]), 'r/pics')
    expect(result.posts[0].text).toBe('A list\n\n- one\n- two')
  })

  it('throws on what is not a listing', () => {
    expect(() => parseRedditListing({ message: 'Forbidden', error: 403 }, 'r/pics')).toThrow('Forbidden')
  })
})

describe('parseRedditCommunityCard', () => {
  it("reads a subreddit's own picture, and none for Reddit's default", () => {
    expect(
      parseRedditCommunityCard('<img src="https://styles.redditmedia.com/t5_1/styles/communityIcon_x.png?width=64&amp;s=1" alt="" width="48">'),
    ).toBe('https://styles.redditmedia.com/t5_1/styles/communityIcon_x.png?width=64&s=1')
    expect(parseRedditCommunityCard('<img src="https://www.redditstatic.com/default.png">')).toBeUndefined()
  })
})
