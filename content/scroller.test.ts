import { expect, test } from 'bun:test'
import { canScrollUp, isGestureMediaViewer, trackInnerScrollers } from './scroller'

test.each([
  ['x.com', '/user/status/123/photo/1', '', 'popstate'],
  ['www.instagram.com', '/stories/user/123/', '', 'popstate'],
  ['www.instagram.com', '/reels/ABC/', '', 'popstate'],
  ['www.instagram.com', '/reel/ABC/', '', 'popstate'],
  ['m.facebook.com', '/photo.php', '', 'popstate'],
  ['www.facebook.com', '/stories/123/ABC/', '', 'popstate'],
  ['www.reddit.com', '/r/pics/comments/123/post/', '#lightbox', 'hashchange'],
])('%s %s%s protects gestures and restores refresh when closed', (hostname, pathname, hash, closeEvent) => {
  const originals = new Map<string, PropertyDescriptor | undefined>()
  const install = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const reports: number[][][] = []
  const listeners: Record<string, () => void> = {}
  let mutation = (_records: unknown[]) => {}
  let nextFrame: (() => void) | undefined
  const flush = () => {
    const callback = nextFrame
    nextFrame = undefined
    callback?.()
  }
  const location = { hostname, pathname: '/', hash: '' }
  const win = {
    location,
    devicePixelRatio: 2,
    innerWidth: 400,
    innerHeight: 800,
    NoraI: { setScrolledRegions: (payload: string) => reports.push(JSON.parse(payload)) },
    addEventListener: (type: string, callback: () => void) => { listeners[type] = callback },
  }
  try {
    install('window', win)
    install('document', { addEventListener() {} })
    install('requestAnimationFrame', (callback: () => void) => { nextFrame = callback; return 1 })
    install('MutationObserver', class {
      constructor(callback: (records: unknown[]) => void) { mutation = callback }
      observe() {}
    })
    trackInnerScrollers()
    flush()
    expect(reports).toEqual([[]])

    location.pathname = pathname
    location.hash = hash
    mutation([])
    flush()
    expect(reports.at(-1)).toEqual([[0, 0, 800, 1600]])

    // Viewer mutations with unchanged bounds don't resend protection.
    mutation([])
    flush()
    expect(reports).toHaveLength(2)

    win.innerHeight = 600
    listeners.resize()
    flush()
    expect(reports.at(-1)).toEqual([[0, 0, 800, 1200]])

    location.pathname = '/'
    location.hash = ''
    listeners[closeEvent]()
    flush()
    expect(reports.at(-1)).toEqual([])

    // A direct photo URL on the legacy domain is protected on initialization.
    location.hostname = 'mobile.twitter.com'
    location.pathname = '/user/status/123/photo/1'
    trackInnerScrollers()
    flush()
    expect(reports.at(-1)).toEqual([[0, 0, 800, 1200]])

    location.hostname = 'example.com'
    nextFrame = undefined
    trackInnerScrollers()
    expect(nextFrame).toBeUndefined()
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})

test.each([
  'https://www.instagram.com/',
  'https://www.instagram.com/user/',
  'https://m.facebook.com/',
  'https://www.facebook.com/user/photos/',
  'https://www.reddit.com/r/pics/comments/123/post/',
  'https://www.reddit.com/r/pics/#other',
  'https://x.com/user/status/123',
  'https://example.com/stories/user/',
  'https://notinstagram.com/reels/123/',
  'https://facebook.com.example.com/photo.php',
  'https://example.com/#lightbox',
])('ordinary pages retain refresh: %s', (href) => {
  expect(isGestureMediaViewer(new URL(href))).toBe(false)
})

test.each([
  ['normal scroller at its top', 0, 'column', false],
  ['normal scroller scrolled down', 300, 'column', true],
  ['reversed scroller at its newest content', 0, 'column-reverse', true],
  ['reversed scroller scrolled back', -300, 'column-reverse', true],
  ['reversed scroller at its oldest content', -1000, 'column-reverse', false],
])('canScrollUp: %s', (_, scrollTop, flexDirection, expected) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle')
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, writable: true, value: () => ({ display: 'flex', flexDirection }) })
  try {
    const el = { scrollTop, scrollHeight: 1800, clientHeight: 800 } as unknown as Element
    expect(canScrollUp(el)).toBe(expected)
  } finally {
    if (original) Object.defineProperty(globalThis, 'getComputedStyle', original)
    else Reflect.deleteProperty(globalThis, 'getComputedStyle')
  }
})

test('canScrollUp: column-reverse without flex is a normal scroller at its top', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle')
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    writable: true,
    value: () => ({ display: 'block', flexDirection: 'column-reverse' }),
  })
  try {
    expect(canScrollUp({ scrollTop: 0, scrollHeight: 1800, clientHeight: 800 } as unknown as Element)).toBe(false)
  } finally {
    if (original) Object.defineProperty(globalThis, 'getComputedStyle', original)
    else Reflect.deleteProperty(globalThis, 'getComputedStyle')
  }
})

test('canScrollUp: nothing to scroll', () => {
  expect(canScrollUp({ scrollTop: 0, scrollHeight: 800, clientHeight: 800 } as unknown as Element)).toBe(false)
})
