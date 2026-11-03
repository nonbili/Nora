import { describe, expect, it } from 'bun:test'
import { runTikTokFullscreenScript } from './script'

function setup() {
  let scan: () => void = () => {}
  let observed: unknown
  let cards: any[] = []
  let fullscreenCalls = 0
  const video = {
    requestFullscreen: async () => {
      fullscreenCalls++
    },
  }
  const makeCard = () => {
    let button: any
    return {
      querySelector: (selector: string) => (selector === 'video' ? video : button),
      appendChild: (value: any) => {
        button = value
      },
      button: () => button,
    }
  }
  const doc = {
    body: null,
    fullscreenEnabled: true,
    querySelectorAll: () => cards,
    createElement: () => {
      const listeners: Record<string, (event: any) => void> = {}
      return {
        style: {},
        setAttribute() {},
        addEventListener: (type: string, fn: any) => {
          listeners[type] = fn
        },
        click: () => listeners.click({ preventDefault() {}, stopPropagation() {} }),
      }
    },
  }
  class Observer {
    constructor(callback: () => void) {
      scan = callback
    }
    observe(target: unknown) {
      observed = target
    }
  }
  runTikTokFullscreenScript(doc as any, Observer as any)
  return {
    doc,
    observed: () => observed,
    makeCard,
    scan: () => scan(),
    setCards: (next: any[]) => {
      cards = next
    },
    fullscreenCalls: () => fullscreenCalls,
  }
}

describe('TikTok fullscreen buttons', () => {
  it('keeps watching when injected before body and adds a working button later', () => {
    const state = setup()
    expect(state.doc.body).toBeNull()
    expect(state.observed()).toBe(state.doc)
    const card = state.makeCard()
    state.setCards([card])
    state.scan()
    const button = card.button()
    expect(button.className).toBe('_nora_tiktok_fullscreen')
    button.click()
    expect(state.fullscreenCalls()).toBe(1)
    state.scan()
    expect(card.button()).toBe(button)
  })
  it('continues adding buttons when the page replaces its cards', () => {
    const state = setup()
    const first = state.makeCard()
    state.setCards([first])
    state.scan()
    const replacement = state.makeCard()
    state.setCards([replacement])
    state.scan()
    expect(first.button()).toBeDefined()
    expect(replacement.button()).toBeDefined()
    expect(replacement.button()).not.toBe(first.button())
  })
})
