import { expect, it } from 'bun:test'
import { createTabModalScroll, TAB_ROW_GAP } from './tab-modal-scroll'

const items = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }))
const rowHeight = 44

it('waits for every layout measurement in any event order', () => {
  for (const keys of [
    ['listY', 'viewportHeight', 'contentHeight'],
    ['contentHeight', 'listY', 'viewportHeight'],
    ['viewportHeight', 'contentHeight', 'listY'],
  ] as const) {
    const state = createTabModalScroll()
    const offsets: number[] = []
    keys.forEach((key, i) => {
      state[key] = { listY: 80, viewportHeight: 500, contentHeight: 1300 }[key]
      state.scroll(items, '10', rowHeight, (y) => offsets.push(y))
      expect(offsets.length).toBe(i === 2 ? 1 : 0)
    })
  }
})

it('uses displayed order and measured one-hand padding', () => {
  const state = Object.assign(createTabModalScroll(), { viewportHeight: 500, contentHeight: 1700, listY: 350 })
  const reordered = [...items].reverse()
  state.scroll(reordered, '9', rowHeight, (y) => {
    expect(y).toBe(350 + 10 * (rowHeight + TAB_ROW_GAP) - (500 - rowHeight) / 2)
  })
  expect(state.done).toBe(true)
})

it('clamps first and last rows to the scrollable range', () => {
  for (const [id, expected] of [['0', 0], ['19', 800]] as const) {
    const state = Object.assign(createTabModalScroll(), { viewportHeight: 500, contentHeight: 1300, listY: 80 })
    state.scroll(items, id, rowHeight, (y) => expect(y).toBe(expected))
    expect(state.done).toBe(true)
  }
})

it('does not override manual scrolling, but scrolls again on reopening', () => {
  const offsets: number[] = []
  for (let opening = 0; opening < 2; opening++) {
    const state = Object.assign(createTabModalScroll(), { viewportHeight: 500, contentHeight: 1300, listY: 80 })
    state.scroll(items, '19', rowHeight, (y) => offsets.push(y))
    state.listY = 100
    state.scroll(items, '1', rowHeight, (y) => offsets.push(y))
  }
  expect(offsets).toEqual([800, 800])
})

it('ignores missing active tabs without consuming the initial scroll', () => {
  const state = Object.assign(createTabModalScroll(), { viewportHeight: 500, contentHeight: 1300, listY: 80 })
  state.scroll(items, undefined, rowHeight, () => { throw new Error('unexpected scroll') })
  expect(state.done).toBe(false)
})

it('waits for native modal presentation even when layout is ready', () => {
  const state = Object.assign(createTabModalScroll(false), { viewportHeight: 500, contentHeight: 1300, listY: 80 })
  const offsets: number[] = []
  state.scroll(items, '19', rowHeight, (y) => offsets.push(y))
  expect(offsets).toEqual([])
  state.shown = true
  state.scroll(items, '19', rowHeight, (y) => offsets.push(y))
  expect(offsets).toEqual([800])
})

it('does not scroll if a gesture starts before presentation finishes', () => {
  const state = Object.assign(createTabModalScroll(false), { viewportHeight: 500, contentHeight: 1300, listY: 80 })
  state.done = true
  state.shown = true
  state.scroll(items, '19', rowHeight, () => { throw new Error('gesture must win') })
  expect(state.done).toBe(true)
})
