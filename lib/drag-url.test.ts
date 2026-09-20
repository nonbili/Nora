import { describe, expect, it } from 'bun:test'
import { isUrlDrag, readDraggedUrl } from './drag-url'

const drag = (data: Record<string, string>, itemKinds?: ('string' | 'file')[]) =>
  ({
    types: Object.keys(data),
    items: itemKinds?.map((kind) => ({ kind })),
    getData: (type: string) => data[type] ?? '',
  }) as unknown as DataTransfer

describe('isUrlDrag', () => {
  it('claims a link drag', () => {
    expect(isUrlDrag(drag({ 'text/uri-list': 'https://example.com', 'text/plain': 'https://example.com' }))).toBe(true)
  })

  it('leaves a file drag to the page', () => {
    expect(isUrlDrag(drag({ Files: '', 'text/uri-list': 'file:///tmp/a.png' }))).toBe(false)
  })

  it('claims a link drag that advertises Files but carries none', () => {
    expect(
      isUrlDrag(drag({ Files: '', 'text/uri-list': 'https://example.com' }, ['string', 'string'])),
    ).toBe(true)
  })

  it('leaves a drag that really carries a file to the page', () => {
    expect(isUrlDrag(drag({ Files: '', 'text/uri-list': 'https://example.com' }, ['file']))).toBe(false)
  })

  it('leaves a plain text drag to the page', () => {
    expect(isUrlDrag(drag({ 'text/plain': 'https://example.com' }))).toBe(false)
  })
})

describe('readDraggedUrl', () => {
  it('reads the first entry of a uri-list, skipping comments', () => {
    expect(readDraggedUrl(drag({ 'text/uri-list': '# comment\r\nhttps://example.com/a\r\nhttps://example.com/b' }))).toBe(
      'https://example.com/a',
    )
  })

  it('falls back to text/plain', () => {
    expect(readDraggedUrl(drag({ 'text/uri-list': '', 'text/plain': 'https://example.com/a' }))).toBe(
      'https://example.com/a',
    )
  })

  it('ignores non-http payloads', () => {
    expect(readDraggedUrl(drag({ 'text/uri-list': 'file:///tmp/a.png' }))).toBeNull()
    expect(readDraggedUrl(drag({ 'text/plain': 'just some text' }))).toBeNull()
  })

  it('ignores an empty drag', () => {
    expect(readDraggedUrl(drag({}))).toBeNull()
    expect(readDraggedUrl(null)).toBeNull()
  })
})
