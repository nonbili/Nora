import { describe, expect, it } from 'bun:test'
import { deferVideoPlayWhileScrolling } from './defer-video-play'

function setup() {
  let now = 0
  const timers: { at: number; fn: () => void }[] = []
  const listeners: Record<string, (event: any) => void> = {}
  const played: string[] = []

  class Element {
    parentElement: Element | null = null
    children: Element[] = []
    append(child: Element) {
      child.parentElement = this
      this.children.push(child)
      return this
    }
    querySelector(selector: string): Element | null {
      for (const child of this.children) {
        if (selector === 'video' && child instanceof HTMLVideoElement) return child
        const found = child.querySelector(selector)
        if (found) return found
      }
      return null
    }
  }

  class HTMLMediaElement extends Element {
    paused = true
    isConnected = true
    rect = { left: 0, right: 100, top: 0, bottom: 100 }
    constructor(public name: string) {
      super()
    }
    play() {
      played.push(this.name)
      this.paused = false
      return Promise.resolve()
    }
    pause() {
      this.paused = true
    }
    load() {}
    private _src = ''
    get src() {
      return this._src
    }
    set src(value: string) {
      this._src = value
    }
    getBoundingClientRect() {
      return this.rect
    }
  }
  class HTMLVideoElement extends HTMLMediaElement {}
  class HTMLAudioElement extends HTMLMediaElement {}

  const win: any = {
    Element,
    HTMLMediaElement,
    HTMLVideoElement,
    performance: { now: () => now },
    setTimeout: (fn: () => void, ms: number) => timers.push({ at: now + ms, fn }),
    document: { addEventListener: (type: string, fn: any) => (listeners[type] = fn) },
  }
  deferVideoPlayWhileScrolling(win)

  const advance = (ms: number) => {
    const until = now + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > until) break
      timers.shift()
      now = next.at
      next.fn()
    }
    now = until
  }
  const touch = (type: string, x = 500, y = 500, target: unknown = null) =>
    listeners[type]({ type, target, touches: type === 'touchstart' ? [{ clientX: x, clientY: y }] : [] })
  // A player: a wrapper holding the video and, over it, a control that receives the tap.
  const player = (name: string) => {
    const video = new HTMLVideoElement(name)
    const control = new Element()
    new Element().append(video).append(control)
    return { video, control }
  }
  const scroll = () => listeners.scroll({})
  return {
    win,
    played,
    advance,
    touch,
    scroll,
    player,
    element: () => new Element(),
    video: (n: string) => new HTMLVideoElement(n),
    audio: (n: string) => new HTMLAudioElement(n),
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('deferVideoPlayWhileScrolling', () => {
  it('plays right away when the page is idle', async () => {
    const t = setup()
    await t.video('a').play()
    expect(t.played).toEqual(['a'])
  })

  it('holds a video started while the finger is down until scrolling has stopped', async () => {
    const t = setup()
    t.touch('touchstart')
    t.scroll()
    const video = t.video('a')
    let resolved = false
    video.play().then(() => (resolved = true))
    t.advance(1000)
    expect(t.played).toEqual([])
    t.touch('touchend')
    // The fling keeps scrolling after the finger lifts.
    t.advance(300)
    t.scroll()
    t.advance(500)
    expect(t.played).toEqual([])
    t.advance(200)
    expect(t.played).toEqual(['a'])
    await flush()
    expect(resolved).toBe(true)
  })

  it('holds a video started between flicks', () => {
    const t = setup()
    t.scroll()
    t.advance(200)
    t.video('a').play()
    // The next flick lands before the page has been still for long.
    t.advance(300)
    t.touch('touchstart')
    t.scroll()
    t.advance(300)
    t.touch('touchend')
    t.advance(400)
    expect(t.played).toEqual([])
    t.advance(400)
    expect(t.played).toEqual(['a'])
  })

  it('drops a held play() when the video is paused first', async () => {
    const t = setup()
    t.scroll()
    const video = t.video('a')
    let error: any
    video.play().catch((e: any) => (error = e))
    video.pause()
    t.advance(1000)
    await flush()
    expect(t.played).toEqual([])
    expect(error?.name).toBe('AbortError')
  })

  it('plays a tapped video right away, since a tap scrolls nothing', () => {
    const t = setup()
    const { video, control } = t.player('a')
    t.touch('touchstart', 50, 50, control)
    t.touch('touchend', 50, 50, control)
    video.play()
    expect(t.played).toEqual(['a'])
  })

  it('plays the video under the finger right away, as the 2x long-press resumes it', () => {
    const t = setup()
    t.touch('touchstart', 50, 50)
    t.video('pressed').play()
    expect(t.played).toEqual(['pressed'])
  })

  it('leaves audio alone', () => {
    const t = setup()
    t.scroll()
    t.audio('a').play()
    expect(t.played).toEqual(['a'])
  })

  it('holds autoplay of a video that scrolls under the finger during a drag', () => {
    const t = setup()
    t.touch('touchstart', 50, 50)
    t.scroll()
    t.video('under-finger').play()
    expect(t.played).toEqual([])
  })

  it('plays right away when the user taps play shortly after a scroll', () => {
    const t = setup()
    t.scroll()
    t.advance(200)
    // The control sits over the video, as X's does, so the video itself is not what was tapped.
    const { video, control } = t.player('a')
    t.touch('touchstart', 50, 50, control)
    t.touch('touchend', 50, 50, control)
    t.advance(100)
    video.play()
    expect(t.played).toEqual(['a'])
  })

  it('drops a held play() when the video loads another source', async () => {
    const t = setup()
    t.scroll()
    const byLoad = t.video('load')
    const bySrc = t.video('src')
    const errors: string[] = []
    byLoad.play().catch((e: any) => errors.push(e.name))
    bySrc.play().catch((e: any) => errors.push(e.name))
    byLoad.load()
    bySrc.src = 'blob:next'
    t.advance(1000)
    await flush()
    expect(t.played).toEqual([])
    expect(errors).toEqual(['AbortError', 'AbortError'])
    expect(bySrc.src).toBe('blob:next')
  })

  it('holds autoplay of another video after a tap, and once a new touch starts', () => {
    const t = setup()
    t.scroll()
    const tapped = t.player('tapped')
    const other = t.player('other')
    t.touch('touchstart', 50, 50, tapped.control)
    t.touch('touchend', 50, 50, tapped.control)
    other.video.play()
    t.touch('touchstart', 50, 50, tapped.control)
    t.scroll()
    tapped.video.play()
    expect(t.played).toEqual([])
  })

  it('settles a held play() when a tap starts the same video', async () => {
    const t = setup()
    t.scroll()
    const { video, control } = t.player('a')
    let resolved = false
    video.play().then(() => (resolved = true))
    t.touch('touchstart', 50, 50, control)
    t.touch('touchend', 50, 50, control)
    await video.play()
    await flush()
    expect(resolved).toBe(true)
    t.advance(1000)
    expect(t.played).toEqual(['a'])
  })

  it('plays the tapped video right away even if the page moved it before play()', () => {
    const t = setup()
    t.scroll()
    const tapped = t.player('tapped')
    const other = t.player('other')
    t.touch('touchstart', 50, 50, tapped.control)
    t.touch('touchend', 50, 50, tapped.control)
    // The page moves the tapped player away and another one into the tapped spot.
    tapped.video.rect = { left: 0, right: 100, top: 300, bottom: 400 }
    tapped.video.play()
    other.video.play()
    expect(t.played).toEqual(['tapped'])
  })

  it('forgets the tapped video once the tap window has passed', () => {
    const t = setup()
    const { video, control } = t.player('a')
    t.touch('touchstart', 50, 50, control)
    t.touch('touchend', 50, 50, control)
    t.advance(1100)
    t.scroll()
    video.play()
    expect(t.played).toEqual([])
  })

  it('does not count a tap on another control in the same post as starting its video', () => {
    const t = setup()
    t.scroll()
    const { video, control } = t.player('a')
    const like = t.element()
    control.parentElement!.append(like)
    // The like button sits below the video.
    t.touch('touchstart', 50, 150, like)
    t.touch('touchend', 50, 150, like)
    video.play()
    expect(t.played).toEqual([])
  })
})
