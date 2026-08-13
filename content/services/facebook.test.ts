import { describe, expect, it } from 'bun:test'
import {
  isFacebookDesktopSponsoredPost,
  isFacebookHomePath,
  isFacebookMessagesPath,
  isFacebookSponsoredText,
} from './facebook'

describe('isFacebookSponsoredText', () => {
  it('matches localized sponsored labels', () => {
    expect(isFacebookSponsoredText('Sponsored')).toBe(true)
    expect(isFacebookSponsoredText('広告')).toBe(true)
  })

  it('handles split text with whitespace and zero-width characters', () => {
    expect(isFacebookSponsoredText('S p o n s o r e d')).toBe(true)
    expect(isFacebookSponsoredText('S\u200bp\u200bo\u200bn\u200bs\u200bo\u200br\u200be\u200bd')).toBe(true)
  })
})

describe('isFacebookMessagesPath', () => {
  it('detects messenger routes', () => {
    expect(isFacebookMessagesPath('/messages')).toBe(true)
    expect(isFacebookMessagesPath('/messages/t/123')).toBe(true)
    expect(isFacebookMessagesPath('/watch')).toBe(false)
  })
})

describe('isFacebookHomePath', () => {
  it('matches only Facebook home routes', () => {
    expect(isFacebookHomePath('/')).toBe(true)
    expect(isFacebookHomePath('/home.php')).toBe(true)
    expect(isFacebookHomePath('/groups/feed/')).toBe(false)
    expect(isFacebookHomePath('/some-user')).toBe(false)
    expect(isFacebookHomePath('/messages')).toBe(false)
  })
})

describe('isFacebookDesktopSponsoredPost', () => {
  it('detects sponsored labels in desktop post containers', () => {
    const child = {
      getAttribute: (name: string) => (name === 'aria-label' ? 'Sponsored' : null),
      textContent: '',
    }
    const root = {
      matches: () => false,
      querySelectorAll: () => [child],
    }
    expect(isFacebookDesktopSponsoredPost(root as unknown as HTMLElement)).toBe(true)
  })

  it('ignores non-sponsored containers', () => {
    const child = {
      getAttribute: (name: string) => (name === 'aria-label' ? 'Friends' : null),
      textContent: '',
    }
    const root = {
      matches: () => false,
      querySelectorAll: () => [child],
    }
    expect(isFacebookDesktopSponsoredPost(root as unknown as HTMLElement)).toBe(false)
  })
})
