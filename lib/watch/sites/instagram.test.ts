import { describe, expect, it } from 'bun:test'
import {
  imginnImageUrl,
  instagramPostTime,
  instagramShortcodePk,
  parseImginnProfilePage,
  parseInstagramEmbed,
  parseInstagramProfileInfo,
  parseInstagramProfilePage,
} from './instagram'

const instagramPage = (connection: unknown) => `<html><head>
<meta property="og:image" content="https://cdn/pic.jpg?a=1&amp;b=2" />
<meta property="og:title" content="NASA (&#064;nasa) &#x2022; Instagram photos and videos" />
</head><body>
<script type="application/json" data-sjs>{"require":[["Other",null,null,[]]]}</script>
<script type="application/json" data-sjs>${JSON.stringify({
  require: [['RelayPrefetchedStreamCache', 'next', [], ['adp_Preloader', { __bbox: { result: { data: { xig_user_by_username: { polaris_ordered_timeline_connection: connection } } } } }]]],
})}</script>
</body></html>`

const embedPage = (shortcodeMedia: unknown) =>
  `<script>{"require":[["PolarisEmbedSimple","init",[],[{"isRichEmbed":true,"contextJSON":${JSON.stringify(
    JSON.stringify({ context: {}, gql_data: { shortcode_media: shortcodeMedia } }),
  )}}]]]}</script>`

describe('parseInstagramProfileInfo', () => {
  it('reads the posts and the profile', () => {
    const { info, posts } = parseInstagramProfileInfo(
      {
        data: {
          user: {
            full_name: 'National Geographic',
            profile_pic_url: 'https://cdn/pic.jpg',
            edge_owner_to_timeline_media: {
              edges: [
                {
                  node: {
                    shortcode: 'Cabc',
                    product_type: 'clips',
                    taken_at_timestamp: 1760000000,
                    thumbnail_src: 'https://cdn/t.jpg',
                    edge_media_to_caption: { edges: [{ node: { text: 'A lion' } }] },
                  },
                },
                { node: { shortcode: 'Cdef', taken_at_timestamp: 1750000000, display_url: 'https://cdn/d.jpg' } },
              ],
            },
          },
        },
      },
      'natgeo',
    )
    expect(info).toEqual({ name: 'National Geographic', avatar: 'https://cdn/pic.jpg' })
    expect(posts.map((post) => [post.url, post.text, post.image, post.createdAtMs])).toEqual([
      ['https://www.instagram.com/reel/Cabc/', 'A lion', 'https://cdn/t.jpg', 1760000000000],
      ['https://www.instagram.com/p/Cdef/', '', 'https://cdn/d.jpg', 1750000000000],
    ])
  })

  it('throws on an answer that asks to log in', () => {
    expect(() => parseInstagramProfileInfo({ message: 'Please wait a few minutes', require_login: true }, 'natgeo')).toThrow(
      'Please wait a few minutes',
    )
  })
})

describe('instagramPostTime', () => {
  it('reads the time a post was made from its id', () => {
    expect(new Date(instagramPostTime('4008597565992995700')).toISOString()).toBe('2026-10-15T16:34:49.658Z')
  })

  it('is 0 for what is not an id', () => {
    expect(instagramPostTime('abc')).toBe(0)
  })
})

describe('instagramShortcodePk', () => {
  it("reads a post's id from its code, which is the id in 64 letters", () => {
    expect(instagramShortcodePk('B')).toBe('1')
    expect(instagramShortcodePk('BA')).toBe('64')
    expect(instagramShortcodePk('_')).toBe('63')
    // Made on October 20, 2026.
    expect(new Date(instagramPostTime(instagramShortcodePk('DeuOR-CjKE9'))).toISOString().slice(0, 10)).toBe('2026-10-20')
    expect(instagramShortcodePk('not a code')).toBe('')
  })
})

describe('imginnImageUrl', () => {
  it("takes Instagram's address for a picture out of imginn's", () => {
    expect(
      imginnImageUrl('https://s5.imginn.com/1_n.jpg?t51.82787-15/1_n.jpg?stp=dst-jpg_s640x640&_nc_ht=scontent-atl3-1.cdninstagram.com&oh=00_A&oe=6A&cache=1'),
    ).toBe('https://scontent-atl3-1.cdninstagram.com/v/t51.82787-15/1_n.jpg?stp=dst-jpg_s640x640&_nc_ht=scontent-atl3-1.cdninstagram.com&oh=00_A&oe=6A')
  })

  it('takes none that is not on a server of Instagram', () => {
    expect(imginnImageUrl('https://s5.imginn.com/1_n.jpg?t51/1_n.jpg?_nc_ht=example.com')).toBeUndefined()
    expect(imginnImageUrl('https://s5.imginn.com/1_n.jpg')).toBeUndefined()
  })
})

describe('parseImginnProfilePage', () => {
  const img = (path: string) => `https://s5.imginn.com/${path}?t51.82787-15/${path}?stp=s640x640&amp;_nc_ht=scontent-iad3-2.cdninstagram.com&amp;oe=6A`
  const html = `<div class="userinfo" data-name="natgeo"><div class="user-hd"><div class="img"><a href="/natgeo/"><img width="77" height="77" src="${img('avatar.jpg')}&amp;cache=1" alt="avatar"> </a></div><div class="user-meta"><div class="name"><a href="/natgeo/"><h1>National Geographic</h1></a></div></div></div></div>
<div class="items">  <div class="item"><div class="img"><a href="/p/DeuOR-CjKE9/" aria-label=""><img loading="lazy" src="${img('a.jpg')}" alt="Best of the World &amp; more
#travel"> </a></div></div>  <div class="item"><div class="img"><a href="/p/De-T1-ZiKeQ/" aria-label=""><img loading="lazy" src="${img('b.jpg')}" alt=""> </a></div></div></div>`

  it("reads the profile's name, picture and grid, each post's time from its code", () => {
    const result = parseImginnProfilePage(html, 'natgeo')
    expect(result.info).toEqual({ name: 'National Geographic', avatar: 'https://scontent-iad3-2.cdninstagram.com/v/t51.82787-15/avatar.jpg?stp=s640x640&_nc_ht=scontent-iad3-2.cdninstagram.com&oe=6A' })
    expect(result.posts.map((post) => post.id)).toEqual(['DeuOR-CjKE9', 'De-T1-ZiKeQ'])
    expect(result.posts[0]).toMatchObject({
      site: 'instagram',
      handle: 'natgeo',
      url: 'https://www.instagram.com/p/DeuOR-CjKE9/',
      text: 'Best of the World & more\n#travel',
      image: 'https://scontent-iad3-2.cdninstagram.com/v/t51.82787-15/a.jpg?stp=s640x640&_nc_ht=scontent-iad3-2.cdninstagram.com&oe=6A',
      mediaComplete: false,
      createdAtMs: instagramPostTime(instagramShortcodePk('DeuOR-CjKE9')),
    })
  })

  it('fails on a page that is not a profile', () => {
    expect(() => parseImginnProfilePage('<title>Just a moment...</title>', 'natgeo')).toThrow('no posts in the page')
  })
})

describe('parseInstagramProfilePage', () => {
  it('reads the posts the page comes with, and the profile from its preview tags', () => {
    const { info, posts } = parseInstagramProfilePage(
      instagramPage({
        edges: [
          { node: { pk: '4008597565992995700', code: 'DehZj9wggt0', product_type: 'clips', caption: { text: 'Wolves' }, display_uri: 'https://cdn/1.jpg' } },
          { node: { pk: '4008597565992995700', code: 'DeoDubaF_gp', product_type: 'feed', caption: null, display_uri: 'https://cdn/2.jpg' } },
          { node: { code: null } },
        ],
      }),
      'nasa',
    )
    expect(info).toEqual({ name: 'NASA', avatar: 'https://cdn/pic.jpg?a=1&b=2' })
    expect(posts.map((post) => [post.url, post.text, post.image])).toEqual([
      ['https://www.instagram.com/reel/DehZj9wggt0/', 'Wolves', 'https://cdn/1.jpg'],
      ['https://www.instagram.com/p/DeoDubaF_gp/', '', 'https://cdn/2.jpg'],
    ])
    expect(posts[0].createdAtMs).toBe(Date.parse('2026-10-15T16:34:49.658Z'))
  })

  it('throws on a page without its posts, as Instagram serves one to a request that does not look like a browser', () => {
    expect(() => parseInstagramProfilePage('<html><meta property="og:title" content="NASA (@nasa)"></html>', 'nasa')).toThrow()
  })
})

describe('parseInstagramEmbed', () => {
  it('reads the file and cover of a video', () => {
    expect(
      parseInstagramEmbed(
        embedPage({ __typename: 'GraphVideo', is_video: true, display_url: 'https://cdn/c.jpg', video_url: 'https://cdn/v.mp4', dimensions: { width: 1080, height: 1920 } }),
      ),
    ).toEqual([{ type: 'video', url: 'https://cdn/v.mp4', thumb: 'https://cdn/c.jpg', width: 1080, height: 1920 }])
  })

  it('reads each photo and video of a carousel', () => {
    const media = parseInstagramEmbed(
      embedPage({
        __typename: 'GraphSidecar',
        display_url: 'https://cdn/1.jpg',
        edge_sidecar_to_children: {
          edges: [
            { node: { is_video: false, display_url: 'https://cdn/1.jpg' } },
            { node: { is_video: true, display_url: 'https://cdn/2.jpg', video_url: 'https://cdn/2.mp4' } },
          ],
        },
      }),
    )
    expect(media.map((item) => [item.type, item.url])).toEqual([
      ['image', 'https://cdn/1.jpg'],
      ['video', 'https://cdn/2.mp4'],
    ])
  })

  it('reads the largest size of a single photo from the picture of the page', () => {
    const html = `<script>{"contextJSON":null}</script><img class="EmbeddedMediaImage" alt="x" src="https://cdn/s.jpg?a=1&amp;b=2" srcset="https://cdn/640.jpg?a=1&amp;b=2 640w,https://cdn/1080.jpg?a=1&amp;b=2 1080w,https://cdn/320.jpg 320w" />`
    expect(parseInstagramEmbed(html)).toEqual([{ type: 'image', url: 'https://cdn/1080.jpg?a=1&b=2' }])
  })

  it('throws on a page without media', () => {
    expect(() => parseInstagramEmbed('<html>Sorry, this page is not available</html>')).toThrow()
  })
})
