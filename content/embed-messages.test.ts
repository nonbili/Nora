import { describe, expect, it } from 'bun:test'
import { clampEmbedHeight, isEmbedLoaded, parseEmbedMessage } from './embed-messages'

describe('parseEmbedMessage', () => {
  it('reads the messages of an embed page, sent as text or as an object', () => {
    expect(parseEmbedMessage('{"details":{},"type":"LOADING"}')).toEqual({ type: 'LOADING', height: undefined })
    expect(parseEmbedMessage('{"details":{"height":722},"type":"MEASURE"}')).toEqual({ type: 'MEASURE', height: 722 })
    expect(parseEmbedMessage({ type: 'MOUNTED', details: { styles: [] } })).toEqual({ type: 'MOUNTED', height: undefined })
  })

  it('ignores anything else', () => {
    for (const data of ['', 'not json', '42', 'null', '{}', '{"type":5}', 42, null, undefined, ['MEASURE']]) {
      expect(parseEmbedMessage(data)).toBeNull()
    }
  })

  it('does not take a height that is not a number', () => {
    expect(parseEmbedMessage({ type: 'MEASURE', details: { height: '722' } })?.height).toBeUndefined()
    expect(parseEmbedMessage({ type: 'MEASURE', details: { height: Infinity } })?.height).toBeUndefined()
    expect(parseEmbedMessage({ type: 'MEASURE', details: null })).toEqual({ type: 'MEASURE', height: undefined })
  })
})

describe('isEmbedLoaded', () => {
  it('is true once the post has been measured or mounted, and not for loading alone', () => {
    expect(isEmbedLoaded({ type: 'MEASURE', height: 722 })).toBe(true)
    expect(isEmbedLoaded({ type: 'MOUNTED' })).toBe(true)
    expect(isEmbedLoaded({ type: 'LOADING' })).toBe(false)
  })
})

describe('clampEmbedHeight', () => {
  it('keeps a card to a sensible height', () => {
    expect(clampEmbedHeight(722.4)).toBe(722)
    expect(clampEmbedHeight(10)).toBe(200)
    expect(clampEmbedHeight(100000)).toBe(1400)
  })
})
