import { describe, expect, it } from 'bun:test'
import { nitterImageUrl, normalizeNitterInstance, parseNitterProfilePage, parseNitterRss, parseRssDate } from './nitter'
import { xPostTime } from './x'

const instance = 'https://nitter.example.com'

const rss = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>NASA / @NASA</title>
    <link>http://nitter.example.com/NASA</link>
    <image>
      <title>NASA / @NASA</title>
      <url>http://nitter.example.com/pic/pbs.twimg.com%2Fprofile_images%2F1%2Fa_400x400.jpg</url>
    </image>
${items}
  </channel>
</rss>`

const item = (fields: { creator: string; description: string; id: string; title?: string }) => `
      <item>
        <title>${fields.title || ''}</title>
        <dc:creator>@${fields.creator}</dc:creator>
        <description><![CDATA[${fields.description}]]></description>
        <pubDate>Mon, 26 Oct 2026 19:29:09 GMT</pubDate>
        <guid isPermaLink="false">${fields.id}</guid>
        <link>http://nitter.example.com/${fields.creator}/status/${fields.id}#m</link>
      </item>`

describe('normalizeNitterInstance', () => {
  it('makes an address whole, without its path', () => {
    expect(normalizeNitterInstance(' Nitter.Example.com/ ')).toBe('https://nitter.example.com')
    expect(normalizeNitterInstance('https://nitter.example.com/NASA/rss')).toBe('https://nitter.example.com')
    expect(normalizeNitterInstance('http://localhost:8080')).toBe('http://localhost:8080')
  })

  it('is empty for what is not one', () => {
    expect(normalizeNitterInstance('')).toBe('')
    expect(normalizeNitterInstance('nitter')).toBe('')
    expect(normalizeNitterInstance('ftp://nitter.example.com')).toBe('')
  })
})

describe('nitterImageUrl', () => {
  it("reads X's address from the instance's", () => {
    expect(nitterImageUrl('http://nitter.example.com/pic/media%2FHVl.jpg')).toBe('https://pbs.twimg.com/media/HVl.jpg')
    expect(nitterImageUrl('http://nitter.example.com/pic/orig/media%2FHVl.jpg')).toBe('https://pbs.twimg.com/media/HVl.jpg')
    expect(nitterImageUrl('http://nitter.example.com/pic/pbs.twimg.com%2Fprofile_images%2F1%2Fa.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/a.jpg',
    )
    expect(nitterImageUrl(`http://nitter.example.com/pic/enc/${btoa('media/HVl.jpg')}`)).toBe('https://pbs.twimg.com/media/HVl.jpg')
    expect(nitterImageUrl('/video/91B6/https%3A%2F%2Fvideo.twimg.com%2Famplify_video%2F1%2Fvid%2Favc1%2F1280x720%2Fa.mp4%3Ftag%3D16')).toBe(
      'https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/a.mp4?tag=16',
    )
  })
})

describe('parseRssDate', () => {
  it('reads the dates of RSS, with their offset', () => {
    expect(parseRssDate('Mon, 26 Oct 2026 19:29:09 GMT')).toBe(Date.UTC(2026, 9, 26, 19, 29, 9))
    expect(parseRssDate('Mon, 26 Oct 2026 21:29:09 +0200')).toBe(Date.UTC(2026, 9, 26, 19, 29, 9))
    expect(parseRssDate('2026-10-26')).toBe(0)
  })
})

describe('parseNitterRss', () => {
  it('reads the profile, its posts and its reposts', () => {
    const xml = rss(
      item({
        creator: 'NASA',
        id: '2',
        description: `<p>Stars <a href="http://nitter.example.com/NASAWebb" title="Webb">@NASAWebb</a><br>
 <br>
More: <a href="https://go.nasa.gov/x">go.nasa.gov/x</a> &amp; <a href="http://nitter.example.com/search?q=%23Moon">#Moon</a></p>
<img src="http://nitter.example.com/pic/media%2FA.jpg" style="max-width:250px;" />
<img src="http://nitter.example.com/pic/media%2FB.jpg" style="max-width:250px;" />`,
      }) +
        item({
          creator: 'Nasdaq',
          id: '1',
          title: 'RT by @NASA: Mars',
          description: `<p>Mars</p>
<a href="http://nitter.example.com/Nasdaq/status/1#m">
<br>Video<br>
  <img src="http://nitter.example.com/pic/amplify_video_thumb%2F9%2Fimg%2Fv.jpg" style="max-width:250px;" />
</a>`,
        }),
    )
    const { info, posts } = parseNitterRss(xml, 'nasa', instance)
    expect(info).toEqual({ name: 'NASA', avatar: 'https://pbs.twimg.com/profile_images/1/a_400x400.jpg' })
    expect(posts).toHaveLength(2)
    expect(posts[0]).toEqual({
      id: '2',
      site: 'x',
      handle: 'nasa',
      url: 'https://x.com/NASA/status/2',
      text: 'Stars @NASAWebb\n\nMore: https://go.nasa.gov/x & #Moon',
      image: 'https://pbs.twimg.com/media/A.jpg',
      media: [
        { type: 'image', url: 'https://pbs.twimg.com/media/A.jpg?name=large', thumb: 'https://pbs.twimg.com/media/A.jpg' },
        { type: 'image', url: 'https://pbs.twimg.com/media/B.jpg?name=large', thumb: 'https://pbs.twimg.com/media/B.jpg' },
      ],
      link: undefined,
      mediaComplete: true,
      createdAtMs: xPostTime('2'),
      repostOf: undefined,
      repostedAtUnknown: undefined,
      quote: undefined,
    })
    expect(posts[1]).toMatchObject({
      url: 'https://x.com/Nasdaq/status/1',
      text: 'Mars',
      image: 'https://pbs.twimg.com/amplify_video_thumb/9/img/v.jpg',
      // Only a video's cover, which does not take the place of the video read before.
      mediaComplete: false,
      repostOf: 'Nasdaq',
    })
  })

  it("shows the card of a link a post shares, linked on X when it is the instance's", () => {
    const xml = rss(
      item({
        creator: 'NASA',
        id: '3',
        description: `<p>LIVE: <a href="https://nitter.example.com/i/broadcasts/1jx">nitter.example.com/i/broadcasts/1jx…</a></p>
<hr/>
<b>Link</b><br>
<a href="http://nitter.example.com/i/broadcasts/1jx">
<img src="http://nitter.example.com/pic/card_img%2F2%2Fc%3Fformat%3Djpg%26name%3D800x419" style="max-width:250px;" />
<br>
<b>NASA</b>
</a>`,
      }),
    )
    expect(parseNitterRss(xml, 'nasa', instance).posts[0]).toMatchObject({
      text: 'LIVE: https://x.com/i/broadcasts/1jx',
      media: [],
      image: 'https://pbs.twimg.com/card_img/2/c?format=jpg&name=800x419',
      link: 'https://x.com/i/broadcasts/1jx',
    })
  })

  it("tells a repost of the profile's own post by its title", () => {
    const xml = rss(item({ creator: 'NASA', id: '7', title: 'RT by @NASA: Again', description: '<p>Again</p>' }))
    expect(parseNitterRss(xml, 'nasa', instance).posts[0]).toMatchObject({ repostOf: 'NASA', repostedAtUnknown: true })
  })

  it('reads the post a post quotes', () => {
    const xml = rss(
      item({
        creator: 'dhh',
        id: '5',
        description: `<p>Agreed</p>
<hr/>
<blockquote>
<b>Piotr CH (@p_ch)</b>
<p>
<p>Lens corrections &amp; more:<br>
<a href="https://github.com/pch/rawmakase">github.com/pch/rawmakase</a></p>
<img src="http://nitter.example.com/pic/media%2FQ.jpg" style="max-width:250px;" />
</p>
<footer>
— <cite><a href="http://nitter.example.com/p_ch/status/2114375871309988212#m">http://nitter.example.com/p_ch/status/2114375871309988212#m</a>
</footer>
</blockquote>`,
      }),
    )
    const [post] = parseNitterRss(xml, 'dhh', instance).posts
    expect(post.text).toBe('Agreed')
    expect(post.quote).toEqual({
      handle: 'p_ch',
      name: 'Piotr CH',
      url: 'https://x.com/p_ch/status/2114375871309988212',
      text: 'Lens corrections & more:\nhttps://github.com/pch/rawmakase',
      media: [{ type: 'image', url: 'https://pbs.twimg.com/media/Q.jpg?name=large', thumb: 'https://pbs.twimg.com/media/Q.jpg' }],
      createdAtMs: xPostTime('2114375871309988212'),
    })
  })

  it('fails on what is not RSS, as a check for a browser', () => {
    expect(() => parseNitterRss('<!doctype html><title>Making sure you&#39;re not a bot!</title>', 'nasa', instance)).toThrow()
  })
})

describe('xPostTime', () => {
  it('reads when a post was made from its id', () => {
    expect(xPostTime('2114801524358406570')).toBe(Date.UTC(2026, 9, 26, 19, 29, 9, 176))
    expect(xPostTime('not an id')).toBe(0)
  })
})

const profileCard = `<div class="profile-card">
  <div class="profile-card-info">
    <a class="profile-card-avatar" href="/pic/pbs.twimg.com%2Fprofile_images%2F1%2Fa.jpg" target="_blank"><img src="/pic/pbs.twimg.com%2Fprofile_images%2F1%2Fa_400x400.jpg" alt="" loading="lazy" /></a>
    <div class="profile-card-tabs-name">
      <a class="profile-card-fullname" href="/NASA" title="NASA">NASA</a>
      <a class="profile-card-username" href="/NASA" title="@NASA">@NASA</a>
    </div>
  </div>
</div>`

const timelineItem = (author: string, id: string, body: string, header = '') => `<div class="timeline-item " data-username="${author}">
  <a class="tweet-link" href="/${author}/status/${id}#m"></a>
  <div class="tweet-body">
    <div>${header}<div class="tweet-header"><a class="fullname" href="/${author}" title="${author}">${author}</a></div></div>
    ${body}
    <div class="tweet-stats"></div>
  </div>
</div>`

const video = (size: string) => `<div class="attachments card"><div class="gallery-video"><div class="attachment">
  <video poster="/pic/media%2FV.jpg%3Fname%3Dsmall%26format%3Dwebp" data-url="/video/91B6/https%3A%2F%2Fvideo.twimg.com%2Fpl.m3u8" data-autoload="false"></video>
  <a class="video-download" href="/video/402F/https%3A%2F%2Fvideo.twimg.com%2Famplify_video%2F1%2Fvid%2Favc1%2F${size}%2Fv.mp4%3Ftag%3D16" download=""></a>
</div></div></div>`

describe('parseNitterProfilePage', () => {
  it('reads the profile, its pinned post, its photos, videos, reposts and quotes', () => {
    const html = `<html><body>${profileCard}<div class="timeline">
${timelineItem(
  'NASA',
  '2113776971603689874',
  `<div class="tweet-content media-body" dir="auto">We are not slowing down. 🚀

Mission: <a href="https://go.nasa.gov/x">go.nasa.gov/x</a> with <a href="/NASAWebb">@NASAWebb</a></div>${video('1920x1080')}`,
  '<div class="pinned"><span>Pinned Tweet</span></div>',
)}
${timelineItem(
  'NASA',
  '2114801524358406570',
  `<div class="tweet-content media-body" dir="auto">Stars</div>
<div class="attachments"><div class="gallery-row" style=""><div class="attachment">
  <a class="still-image" href="/pic/orig/media%2FA.jpg" target="_blank"><img src="/pic/media%2FA.jpg%3Fname%3Dsmall%26format%3Dwebp" alt="" /></a>
</div><div class="attachment">
  <a class="still-image" href="/pic/orig/media%2FB.jpg" target="_blank"><img src="/pic/media%2FB.jpg%3Fname%3Dsmall%26format%3Dwebp" alt="" /></a>
</div></div></div>`,
)}
${timelineItem(
  'NASAAdmin',
  '2114425731832775042',
  `<div class="tweet-content media-body" dir="auto">Game day</div>${video('3840x2160')}`,
  '<div class="retweet-header"><span>NASA retweeted</span></div>',
)}
${timelineItem(
  'NASA',
  '2114698656142250471',
  `<div class="tweet-content media-body" dir="auto">Quoted</div>
<div class="quote quote-big">
  <a class="quote-link" href="/esa/status/2114648178540872038#m"></a>
  <div class="tweet-name-row"><div class="fullname-and-username"><img class="avatar round mini" src="/pic/profile_images%2F9%2Fe_mini.jpg" alt="" /><a class="fullname" href="/esa" title="ESA">ESA</a></div></div>
  <div class="quote-text" dir="auto">Hello &amp; welcome</div>
  <div class="quote-media-container"><div class="attachments"><div class="gallery-row"><div class="attachment">
    <a class="still-image" href="/pic/orig/media%2FQ.jpg"><img src="/pic/media%2FQ.jpg%3Fname%3Dsmall" alt="" /></a>
  </div></div></div></div>
</div>`,
)}
</div></body></html>`
    const { info, posts, pinnedIds } = parseNitterProfilePage(html, 'nasa', instance)
    expect(info).toEqual({ name: 'NASA', avatar: 'https://pbs.twimg.com/profile_images/1/a_400x400.jpg' })
    expect(pinnedIds).toEqual(['2113776971603689874'])
    expect(posts).toHaveLength(4)
    expect(posts[0]).toEqual({
      id: '2113776971603689874',
      site: 'x',
      handle: 'nasa',
      url: 'https://x.com/NASA/status/2113776971603689874',
      text: 'We are not slowing down. 🚀\n\nMission: https://go.nasa.gov/x with @NASAWebb',
      image: 'https://pbs.twimg.com/media/V.jpg',
      media: [
        {
          type: 'video',
          url: 'https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/v.mp4?tag=16',
          thumb: 'https://pbs.twimg.com/media/V.jpg',
        },
      ],
      link: undefined,
      mediaComplete: true,
      createdAtMs: xPostTime('2113776971603689874'),
      repostOf: undefined,
      quote: undefined,
    })
    expect(posts[1].media).toEqual([
      { type: 'image', url: 'https://pbs.twimg.com/media/A.jpg?name=large', thumb: 'https://pbs.twimg.com/media/A.jpg' },
      { type: 'image', url: 'https://pbs.twimg.com/media/B.jpg?name=large', thumb: 'https://pbs.twimg.com/media/B.jpg' },
    ])
    // A 4K video is kept as its cover.
    expect(posts[2]).toMatchObject({
      url: 'https://x.com/NASAAdmin/status/2114425731832775042',
      repostOf: 'NASAAdmin',
      media: [{ type: 'image', url: 'https://pbs.twimg.com/media/V.jpg?name=large' }],
      mediaComplete: false,
    })
    expect(posts[3].media).toEqual([])
    expect(posts[3].quote).toEqual({
      handle: 'esa',
      name: 'ESA',
      avatar: 'https://pbs.twimg.com/profile_images/9/e_normal.jpg',
      url: 'https://x.com/esa/status/2114648178540872038',
      text: 'Hello & welcome',
      media: [{ type: 'image', url: 'https://pbs.twimg.com/media/Q.jpg?name=large', thumb: 'https://pbs.twimg.com/media/Q.jpg' }],
      createdAtMs: xPostTime('2114648178540872038'),
    })
  })

  it('tells a repost as its time unknown, as the post it shares has it', () => {
    const html = `${profileCard}${timelineItem('esa', '1000000000000000000', '<div class="tweet-content media-body">Old</div>', '<div class="retweet-header"></div>')}`
    expect(parseNitterProfilePage(html, 'nasa', instance).posts[0]).toMatchObject({
      createdAtMs: xPostTime('1000000000000000000'),
      repostOf: 'esa',
      repostedAtUnknown: true,
    })
  })

  it("shows the card of a link a post shares, linked on X when it is the instance's", () => {
    const html = `${profileCard}${timelineItem(
      'NASA',
      '3',
      `<div class="tweet-content media-body" dir="auto">LIVE</div>
<div class="card large"><div class="card-container">
  <div class="attachments card"><div class="gallery-video"><div class="attachment">
    <video poster="/pic/card_img%2F2%2Fc%3Fformat%3Djpg%26name%3D800x419" data-url="/i/broadcasts/1jx/stream"></video>
  </div></div></div>
  <a class="card-content-container" href="/i/broadcasts/1jx"><div class="card-content"><h2 class="card-title">NASA</h2></div></a>
</div></div>`,
    )}`
    expect(parseNitterProfilePage(html, 'nasa', instance).posts[0]).toMatchObject({
      media: [],
      image: 'https://pbs.twimg.com/card_img/2/c?format=jpg&name=800x419',
      link: 'https://x.com/i/broadcasts/1jx',
    })
  })

  it('fails when the instance shows no posts, or the page is not its own', () => {
    expect(() =>
      parseNitterProfilePage(`${profileCard}<div class="timeline"><h2 class="timeline-none">No items found</h2></div>`, 'nasa', instance),
    ).toThrow('no posts on the instance')
    expect(() => parseNitterProfilePage("<title>Making sure you're not a bot!</title>", 'nasa', instance)).toThrow('no posts in the page')
  })
})
