import { describe, expect, it } from 'bun:test'
import * as cheerio from 'cheerio'
import {
  facebookDesktopAdContainerSelector,
  hasFacebookMobileSponsoredLabel,
  invalidateFacebookDesktopAdVerdict,
  isFacebookDesktopSponsoredPost,
  isFacebookHomePath,
  isFacebookMessagesPath,
  isFacebookMobileSponsoredLabel,
  isFacebookReelPagerAdCandidate,
  isFacebookReelsPath,
  isFacebookSponsoredText,
  runFacebookContextMenuGuard,
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

describe('isFacebookMobileSponsoredLabel', () => {
  it('matches the label with its punctuation and icon glyphs', () => {
    expect(isFacebookMobileSponsoredLabel('広告: ')).toBe(true)
    expect(isFacebookMobileSponsoredLabel('広告: \u{f078b}\u{f1677}')).toBe(true)
    expect(isFacebookMobileSponsoredLabel('Sponsored · ')).toBe(true)
    expect(isFacebookMobileSponsoredLabel('Ad')).toBe(true)
  })

  it('does not match post text that only contains a label', () => {
    expect(isFacebookMobileSponsoredLabel('NASA - National Aeronautics and Space Administration')).toBe(false)
    expect(isFacebookMobileSponsoredLabel('Adobe')).toBe(false)
    expect(isFacebookMobileSponsoredLabel('この広告について')).toBe(false)
    expect(isFacebookMobileSponsoredLabel(`Additionally, ${'long post text '.repeat(10)}`)).toBe(false)
  })
})

describe('hasFacebookMobileSponsoredLabel', () => {
  const textArea = (inner: string) => `<div data-mcomponent="TextArea" data-type="text"><div class="native-text">${inner}</div></div>`
  const container = (inner: string) => `<div data-mcomponent="MContainer" data-type="container">${inner}</div>`
  // As rendered on m.facebook.com, 2026-11-04: an avatar, the author and meta pair, then the menu.
  const header = (author: string, meta: string) =>
    container(container('') + container(textArea(`<span class="f2">${author}</span>`) + textArea(`<span class="f5">${meta}</span>`)) + container(''))
  const body = (text: string) => container(textArea(`<span class="f1">${text}</span>`))
  const comment = (name: string, text: string) => container(textArea(name) + textArea(text))
  const post = (html: string) => {
    const $ = cheerio.load(`<div data-tracking-duration-id="1">${html}</div>`)
    return {
      querySelectorAll: (selector: string) =>
        $(selector)
          .toArray()
          .map((element) => {
            const previous = $(element).prev()
            return {
              textContent: $(element).text(),
              previousElementSibling: previous.length ? { getAttribute: (name: string) => previous.attr(name) ?? null } : null,
            }
          }),
    }
  }

  it('matches the label in the header of a mobile ad', () => {
    expect(hasFacebookMobileSponsoredLabel(post(header('Muse from Meta', '広告: \u{f078b}\u{f1677}') + body('Museがあなたのカレンダーを管理し…')))).toBe(true)
  })

  it('ignores label words outside the header meta block', () => {
    const timestamp = '20時間前'
    expect(hasFacebookMobileSponsoredLabel(post(header('NASA - National Aeronautics and Space Administration', timestamp)))).toBe(false)
    expect(hasFacebookMobileSponsoredLabel(post(header('Ad', timestamp)))).toBe(false)
    expect(hasFacebookMobileSponsoredLabel(post(header('Claude', timestamp) + body('広告')))).toBe(false)
    expect(hasFacebookMobileSponsoredLabel(post(header('Claude', timestamp) + body('We need to discuss <strong>広告</strong> today. <a href="#">Ad</a> spend is up.')))).toBe(false)
    expect(hasFacebookMobileSponsoredLabel(post(header('Claude', timestamp) + comment('Federico', 'Sponsored')))).toBe(false)
  })
})

describe('isFacebookMessagesPath', () => {
  it('detects messenger routes', () => {
    expect(isFacebookMessagesPath('/messages')).toBe(true)
    expect(isFacebookMessagesPath('/messages/t/123')).toBe(true)
    expect(isFacebookMessagesPath('/watch')).toBe(false)
  })
})

describe('isFacebookReelsPath', () => {
  it('detects the reel pager routes', () => {
    expect(isFacebookReelsPath('/reel')).toBe(true)
    expect(isFacebookReelsPath('/reel/404248063485974')).toBe(true)
    expect(isFacebookReelsPath('/reels/')).toBe(true)
    expect(isFacebookReelsPath('/reels/tab/123')).toBe(true)
  })

  it('leaves the rest of the site scanned', () => {
    expect(isFacebookReelsPath('/')).toBe(false)
    expect(isFacebookReelsPath('/watch')).toBe(false)
    expect(isFacebookReelsPath('/reeling')).toBe(false)
    expect(isFacebookReelsPath('/groups/reel/')).toBe(false)
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

describe('isFacebookReelPagerAdCandidate', () => {
  const container = (hasNestedCandidate: boolean) =>
    ({
      querySelector: (selector: string) =>
        selector === facebookDesktopAdContainerSelector && hasNestedCandidate ? {} : null,
    }) as unknown as HTMLElement

  it('accepts an innermost container, which is a single reel', () => {
    expect(isFacebookReelPagerAdCandidate(container(false))).toBe(true)
  })

  it('rejects a wrapper holding other candidates, which would be the pager', () => {
    expect(isFacebookReelPagerAdCandidate(container(true))).toBe(false)
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

describe('runFacebookContextMenuGuard', () => {
  const createMockDocument = () => {
    const listeners = new Map<string, (event: any) => void>()
    return {
      addEventListener: (type: string, listener: (event: any) => void) => {
        listeners.set(type, listener)
      },
      dispatch: (type: string, target: unknown) => {
        let prevented = false
        let stopped = false
        listeners.get(type)?.({
          target,
          preventDefault: () => {
            prevented = true
          },
          stopPropagation: () => {
            stopped = true
          },
        })
        return { prevented, stopped }
      },
    }
  }

  it('prevents contextmenu when long-press starts on a long-click action even if overlay replaces target', () => {
    const doc = createMockDocument()
    runFacebookContextMenuGuard(doc)

    const likeButton = {
      closest: (selector: string) => (selector === '[data-long-click-action-id]' ? likeButton : null),
    }
    const overlayBackdrop = {
      closest: () => null,
    }

    doc.dispatch('pointerdown', likeButton)
    const result = doc.dispatch('contextmenu', overlayBackdrop)

    expect(result.prevented).toBe(true)
    expect(result.stopped).toBe(true)
  })

  it('allows contextmenu on normal images after a long-click gesture ends', async () => {
    const doc = createMockDocument()
    runFacebookContextMenuGuard(doc)

    const likeButton = {
      closest: (selector: string) => (selector === '[data-long-click-action-id]' ? likeButton : null),
    }
    const postImage = {
      closest: () => null,
    }

    doc.dispatch('pointerdown', likeButton)
    doc.dispatch('pointerup', likeButton)
    await new Promise((resolve) => setTimeout(resolve, 10))

    doc.dispatch('pointerdown', postImage)
    const result = doc.dispatch('contextmenu', postImage)

    expect(result.prevented).toBe(false)
    expect(result.stopped).toBe(false)
  })
})
