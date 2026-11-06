import { expect, it } from 'bun:test'
import { feedOverlayBelongsTo, feedOverlayHandlesKey } from '@/lib/feed-overlays'

it('routes desktop overlays to their owner and keeps app-level entry points global', () => {
  expect(feedOverlayBelongsTo({ tabId: 'feed-a' }, 'feed-a', false)).toBe(true)
  expect(feedOverlayBelongsTo({ tabId: 'feed-a' }, 'feed-b', false)).toBe(false)
  expect(feedOverlayBelongsTo({ tabId: 'feed-a' }, undefined, false)).toBe(false)
  expect(feedOverlayBelongsTo({}, undefined, false)).toBe(true)
  expect(feedOverlayBelongsTo({}, 'feed-a', false)).toBe(false)
  expect(feedOverlayBelongsTo(null, 'feed-a', false)).toBe(false)
  expect(feedOverlayBelongsTo({ tabId: 'feed-a' }, undefined, true)).toBe(true)
})

it('handles focus inside overlays and limits body fallback to the active tab', () => {
  const inside = new EventTarget()
  const outside = new EventTarget()
  const body = new EventTarget()
  const container = { contains: (target: EventTarget) => target === inside, ownerDocument: { body } } as unknown as HTMLElement
  expect(feedOverlayHandlesKey('feed-a', 'feed-b', container, inside)).toBe(true)
  expect(feedOverlayHandlesKey('feed-a', 'feed-a', container, outside)).toBe(false)
  expect(feedOverlayHandlesKey('feed-a', 'feed-a', container, inside)).toBe(true)
  expect(feedOverlayHandlesKey('feed-a', 'feed-a', null, inside)).toBe(false)
  expect(feedOverlayHandlesKey('feed-a', 'feed-a', container, body)).toBe(true)
  expect(feedOverlayHandlesKey('feed-a', 'feed-b', container, body)).toBe(false)
  expect(feedOverlayHandlesKey(undefined, 'feed-b', null, outside)).toBe(true)
})
