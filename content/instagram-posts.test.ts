import { describe, expect, it } from 'bun:test'
import {
  getEmbedUrlForPage,
  getLinkedPostEmbedUrl,
  getProfileTabPath,
  isMorePostsButtonText,
  isProfileGridPage,
  isWatchAgainLink,
} from './instagram-posts'

describe('isProfileGridPage', () => {
  it('is a profile and its tabs', () => {
    expect(isProfileGridPage('www.instagram.com', '/nasa/')).toBe(true)
    expect(isProfileGridPage('www.instagram.com', '/nasa')).toBe(true)
    expect(isProfileGridPage('www.instagram.com', '/nasa/reels/')).toBe(true)
    expect(isProfileGridPage('www.instagram.com', '/nasa/tagged/')).toBe(true)
  })

  it('is nothing else', () => {
    expect(isProfileGridPage('www.instagram.com', '/')).toBe(false)
    expect(isProfileGridPage('www.instagram.com', '/explore/')).toBe(false)
    expect(isProfileGridPage('www.instagram.com', '/p/abc/')).toBe(false)
    expect(isProfileGridPage('www.facebook.com', '/nasa/')).toBe(false)
  })
})

describe('getLinkedPostEmbedUrl', () => {
  const base = 'https://www.instagram.com/natgeo/'

  it('is the embed page of a post or reel a link leads to', () => {
    expect(getLinkedPostEmbedUrl('/natgeo/reel/DXlz3SYANc0/', base)).toBe('https://www.instagram.com/reel/DXlz3SYANc0/embed/')
    expect(getLinkedPostEmbedUrl('/p/DeKe4mpkipT/', base)).toBe('https://www.instagram.com/p/DeKe4mpkipT/embed/')
    expect(getLinkedPostEmbedUrl('https://www.instagram.com/p/DeKe4mpkipT/', base)).toBe('https://www.instagram.com/p/DeKe4mpkipT/embed/')
  })

  it('is null for a link to anything else, or none', () => {
    expect(getLinkedPostEmbedUrl('/natgeo/', base)).toBeNull()
    expect(getLinkedPostEmbedUrl('/accounts/login/', base)).toBeNull()
    expect(getLinkedPostEmbedUrl('https://example.com/p/DeKe4mpkipT/', base)).toBeNull()
    expect(getLinkedPostEmbedUrl(null, base)).toBeNull()
    expect(getLinkedPostEmbedUrl('', base)).toBeNull()
  })
})

describe('getProfileTabPath', () => {
  it('opens Reels, the middle of Posts, Reels and Tagged, at its address', () => {
    expect(getProfileTabPath('natgeo', 1, 3)).toBe('/natgeo/reels/')
  })

  it('leaves Posts, Tagged and a row it does not know', () => {
    expect(getProfileTabPath('natgeo', 0, 3)).toBeNull()
    expect(getProfileTabPath('natgeo', 2, 3)).toBeNull()
    expect(getProfileTabPath('natgeo', 1, 2)).toBeNull()
    expect(getProfileTabPath('natgeo', -1, 3)).toBeNull()
  })
})

describe('isMorePostsButtonText', () => {
  it('is the button that names the profile, in any language', () => {
    expect(isMorePostsButtonText('More posts from natgeo', 'natgeo')).toBe(true)
    expect(isMorePostsButtonText('Ещё публикации от natgeo', 'natgeo')).toBe(true)
    expect(isMorePostsButtonText('natgeoの他の投稿', 'natgeo')).toBe(true)
    expect(isMorePostsButtonText(' More posts from NatGeo ', 'natgeo')).toBe(true)
  })

  it('is not a button of the profile name alone, one that does not name it, or a long text', () => {
    expect(isMorePostsButtonText('natgeo', 'natgeo')).toBe(false)
    expect(isMorePostsButtonText('natgeo ✓', 'natgeo')).toBe(false)
    expect(isMorePostsButtonText('Follow', 'natgeo')).toBe(false)
    expect(isMorePostsButtonText('More posts from nasa', 'natgeo')).toBe(false)
    expect(isMorePostsButtonText(`natgeo ${'a caption that goes on '.repeat(5)}`, 'natgeo')).toBe(false)
  })
})

describe('getEmbedUrlForPage', () => {
  it('is the embed page of a post, a reel or a video', () => {
    expect(getEmbedUrlForPage('www.instagram.com', '/p/DeKe4mpkipT/')).toBe('https://www.instagram.com/p/DeKe4mpkipT/embed/')
    expect(getEmbedUrlForPage('www.instagram.com', '/reel/DeKe4mpkipT')).toBe('https://www.instagram.com/reel/DeKe4mpkipT/embed/')
    expect(getEmbedUrlForPage('www.instagram.com', '/tv/DeKe4mpkipT/')).toBe('https://www.instagram.com/tv/DeKe4mpkipT/embed/')
  })

  it('also for the address a profile gives its post', () => {
    expect(getEmbedUrlForPage('www.instagram.com', '/artefr/reel/DeKe4mpkipT/')).toBe(
      'https://www.instagram.com/reel/DeKe4mpkipT/embed/',
    )
    expect(getEmbedUrlForPage('instagram.com', '/nasa.gov/p/DeKe4mpkipT/')).toBe('https://www.instagram.com/p/DeKe4mpkipT/embed/')
  })

  it('is nothing for the embed page, a profile or any other page', () => {
    expect(getEmbedUrlForPage('www.instagram.com', '/p/DeKe4mpkipT/embed/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/artefr/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/reels/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/p/abc/')).toBeNull()
    expect(getEmbedUrlForPage('www.instagram.com', '/accounts/login/')).toBeNull()
  })

  it('is nothing on another site, or on one that only looks like Instagram', () => {
    expect(getEmbedUrlForPage('www.facebook.com', '/p/DeKe4mpkipT/')).toBeNull()
    expect(getEmbedUrlForPage('instagram.com.evil.net', '/p/DeKe4mpkipT/')).toBeNull()
  })
})

describe('isWatchAgainLink', () => {
  it('is the link an embed page puts over a video that has ended', () => {
    expect(isWatchAgainLink('https://www.instagram.com/p/DeOjrIyjznF/?utm_source=ig_embed&utm_campaign=embed_video_watch_again')).toBe(true)
    expect(isWatchAgainLink('https://www.instagram.com/p/DeOjrIyjznF/?utm_campaign=embed_video_watch_again&igsh=x')).toBe(true)
  })

  it('is no other link of the page', () => {
    expect(isWatchAgainLink('https://www.instagram.com/p/DeOjrIyjznF/?utm_source=ig_embed&utm_campaign=loggedout')).toBe(false)
    expect(isWatchAgainLink('https://www.instagram.com/artefr/')).toBe(false)
    expect(isWatchAgainLink(null)).toBe(false)
    expect(isWatchAgainLink('')).toBe(false)
  })
})

