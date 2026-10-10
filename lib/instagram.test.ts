import { describe, expect, it } from 'bun:test'
import { getProfileUsername } from './instagram'

describe('getProfileUsername', () => {
  it('reads the name from a profile page of Instagram', () => {
    expect(getProfileUsername('www.instagram.com', '/nasa/')).toBe('nasa')
    expect(getProfileUsername('www.instagram.com', '/nasa')).toBe('nasa')
    expect(getProfileUsername('instagram.com', '/nasa.gov_1/')).toBe('nasa.gov_1')
  })

  it('is null for a page that is not a profile', () => {
    expect(getProfileUsername('www.instagram.com', '/')).toBeNull()
    expect(getProfileUsername('www.instagram.com', '/explore/')).toBeNull()
    expect(getProfileUsername('www.instagram.com', '/reels/')).toBeNull()
    expect(getProfileUsername('www.instagram.com', '/accounts/login/')).toBeNull()
    expect(getProfileUsername('www.instagram.com', '/nasa/p/abc/')).toBeNull()
    expect(getProfileUsername('www.instagram.com', '/nasa/reels/')).toBeNull()
  })

  it('is null on any other site, including one that only looks like Instagram', () => {
    expect(getProfileUsername('www.facebook.com', '/nasa/')).toBeNull()
    expect(getProfileUsername('notinstagram.com', '/nasa/')).toBeNull()
    expect(getProfileUsername('instagram.com.evil.net', '/nasa/')).toBeNull()
  })
})
