import { describe, expect, it } from 'bun:test'
import {
  facebookDesktopAdContainerSelector,
  invalidateFacebookDesktopAdVerdict,
  isFacebookDesktopSponsoredPost,
  isFacebookHomePath,
  isFacebookMessagesPath,
  isFacebookSponsoredText,
  shouldHideFacebookOpenAppBanner,
  shouldScanFacebookDesktopContainer,
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

describe('shouldHideFacebookOpenAppBanner', () => {
  const createBanner = ({ hasForm = false, buttons = 1 } = {}) =>
    ({
      dataset: {},
      querySelector: (selector: string) => {
        if (selector === 'form, input, textarea, select') {
          return hasForm ? {} : null
        }
        if (selector === '[role="article"], [data-pagelet], [role="feed"]') {
          return null
        }
        if (selector.includes('[data-mcomponent="TextArea"]')) {
          return {}
        }
        return null
      },
      querySelectorAll: (selector: string) => {
        if (selector === '.native-text') {
          return [{}]
        }
        if (selector === '[role="button"][data-focusable="true"]') {
          return Array.from({ length: buttons }, () => ({}))
        }
        return []
      },
    }) as unknown as HTMLElement

  it('matches the current mobile Facebook open-app banner structure', () => {
    expect(shouldHideFacebookOpenAppBanner(createBanner())).toBe(true)
  })

  it('rejects interactive containers that are not the open-app banner', () => {
    expect(shouldHideFacebookOpenAppBanner(createBanner({ hasForm: true }))).toBe(false)
    expect(shouldHideFacebookOpenAppBanner(createBanner({ buttons: 2 }))).toBe(false)
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

describe('shouldScanFacebookDesktopContainer', () => {
  const container = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLElement

  it('scans a post the first time it is seen', () => {
    expect(shouldScanFacebookDesktopContainer(container({}))).toBe(true)
  })

  it('skips posts already hidden or already scanned', () => {
    expect(shouldScanFacebookDesktopContainer(container({ noraHiddenAd: '1' }))).toBe(false)
    expect(shouldScanFacebookDesktopContainer(container({ noraAdChecked: '1' }))).toBe(false)
  })
})

describe('invalidateFacebookDesktopAdVerdict', () => {
  const createPost = (dataset: Record<string, string>) => {
    const post = {
      dataset,
      closest: (selector: string) => (selector === facebookDesktopAdContainerSelector ? post : null),
    }
    return post
  }

  it('drops the cached verdict of the post a mutation happened in', () => {
    const post = createPost({ noraAdChecked: '1' })
    const textNode = { parentElement: post } as unknown as Node

    invalidateFacebookDesktopAdVerdict(textNode)

    expect(post.dataset.noraAdChecked).toBeUndefined()
    expect(shouldScanFacebookDesktopContainer(post as unknown as HTMLElement)).toBe(true)
  })

  it('leaves posts that are already hidden alone', () => {
    const post = createPost({ noraHiddenAd: '1', noraAdChecked: '1' })

    invalidateFacebookDesktopAdVerdict(post as unknown as Node)

    expect(post.dataset.noraAdChecked).toBe('1')
  })

  it('ignores nodes outside any post container', () => {
    expect(() => invalidateFacebookDesktopAdVerdict(null)).not.toThrow()
    expect(() => invalidateFacebookDesktopAdVerdict({} as unknown as Node)).not.toThrow()
  })
})
