import { describe, expect, it } from 'bun:test'
import {
  DECK_NEW_TAB_WIDTH,
  WORKSPACE_GAP,
  WORKSPACE_PADDING,
  getWorkspaceContentWidth,
  getWorkspaceSlotRects,
} from './nativeWorkspaceLayout'

const size = { width: 1000, height: 600 }
const inner = { width: size.width - WORKSPACE_PADDING * 2, height: size.height - WORKSPACE_PADDING * 2 }

describe('getWorkspaceSlotRects', () => {
  it('gives a single tab the whole workspace', () => {
    const rects = getWorkspaceSlotRects({ deckTabWidth: 400, isSingle: true, layout: 'deck', size, slotCount: 1 })

    expect(rects).toEqual([
      { left: WORKSPACE_PADDING, top: WORKSPACE_PADDING, width: inner.width, height: inner.height },
    ])
  })

  it('lays a deck out left to right at the configured tab width', () => {
    const rects = getWorkspaceSlotRects({ deckTabWidth: 400, isSingle: false, layout: 'deck', size, slotCount: 3 })

    expect(rects.map((rect) => rect.left)).toEqual([
      WORKSPACE_PADDING,
      WORKSPACE_PADDING + 400 + WORKSPACE_GAP,
      WORKSPACE_PADDING + (400 + WORKSPACE_GAP) * 2,
    ])
    expect(rects.every((rect) => rect.width === 400 && rect.height === inner.height)).toBe(true)
  })

  it('splits the width evenly between split view slots', () => {
    const rects = getWorkspaceSlotRects({ deckTabWidth: 400, isSingle: false, layout: 'split-view', size, slotCount: 3 })
    const width = (inner.width - WORKSPACE_GAP * 2) / 3

    expect(rects.map((rect) => rect.width)).toEqual([width, width, width])
    expect(rects[2].left + rects[2].width).toBe(size.width - WORKSPACE_PADDING)
  })

  it('places a 4 tab grid in two rows of two', () => {
    const rects = getWorkspaceSlotRects({ deckTabWidth: 400, isSingle: false, layout: 'grid-4', size, slotCount: 4 })
    const halfWidth = (inner.width - WORKSPACE_GAP) / 2
    const halfHeight = (inner.height - WORKSPACE_GAP) / 2

    expect(rects).toHaveLength(4)
    expect(rects[0]).toEqual({ left: WORKSPACE_PADDING, top: WORKSPACE_PADDING, width: halfWidth, height: halfHeight })
    expect(rects[3]).toEqual({
      left: WORKSPACE_PADDING + halfWidth + WORKSPACE_GAP,
      top: WORKSPACE_PADDING + halfHeight + WORKSPACE_GAP,
      width: halfWidth,
      height: halfHeight,
    })
  })

  it('never returns a negative size when the workspace has not been measured yet', () => {
    const rects = getWorkspaceSlotRects({
      deckTabWidth: 400,
      isSingle: false,
      layout: 'grid-4',
      size: { width: 0, height: 0 },
      slotCount: 4,
    })

    expect(rects.every((rect) => rect.width >= 0 && rect.height >= 0)).toBe(true)
  })
})

describe('getWorkspaceContentWidth', () => {
  it('keeps the content at window width outside a deck', () => {
    expect(getWorkspaceContentWidth({ deckTabWidth: 400, isDeck: false, size, slotCount: 4 })).toBe(size.width)
  })

  it('grows past the window so a long deck can scroll', () => {
    expect(getWorkspaceContentWidth({ deckTabWidth: 400, isDeck: true, size, slotCount: 4 })).toBe(
      WORKSPACE_PADDING * 2 + 4 * (400 + WORKSPACE_GAP) + DECK_NEW_TAB_WIDTH,
    )
  })

  it('never shrinks below the window for a short deck', () => {
    expect(getWorkspaceContentWidth({ deckTabWidth: 400, isDeck: true, size, slotCount: 1 })).toBe(size.width)
  })
})
