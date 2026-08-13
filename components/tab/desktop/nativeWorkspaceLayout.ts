import type { TabGroupLayout } from '@/states/tab-groups'

export interface SlotRect {
  left: number
  top: number
  width: number
  height: number
}

export const WORKSPACE_PADDING = 8
export const WORKSPACE_GAP = 8

export interface WorkspaceSize {
  width: number
  height: number
}

/**
 * Every tab of the workspace lives in the same parent and is placed with an
 * absolute rect, exactly like the web workspace does. Reparenting a tab when the
 * layout changes would remount its native webview and reload the page, so the
 * layout is expressed as coordinates instead of nested flex containers.
 */
export const getWorkspaceSlotRects = ({
  deckTabWidth,
  isSingle,
  layout,
  size,
  slotCount,
}: {
  deckTabWidth: number
  isSingle: boolean
  layout: TabGroupLayout
  size: WorkspaceSize
  slotCount: number
}): SlotRect[] => {
  const left = WORKSPACE_PADDING
  const top = WORKSPACE_PADDING
  const innerWidth = Math.max(0, size.width - WORKSPACE_PADDING * 2)
  const innerHeight = Math.max(0, size.height - WORKSPACE_PADDING * 2)

  if (isSingle) {
    return [{ left, top, width: innerWidth, height: innerHeight }]
  }

  if (layout === 'deck') {
    return Array.from({ length: slotCount }, (_, index) => ({
      left: left + index * (deckTabWidth + WORKSPACE_GAP),
      top,
      width: deckTabWidth,
      height: innerHeight,
    }))
  }

  if (layout === 'split-view') {
    const columns = Math.max(1, slotCount)
    const width = Math.max(0, (innerWidth - WORKSPACE_GAP * (columns - 1)) / columns)
    return Array.from({ length: columns }, (_, index) => ({
      left: left + index * (width + WORKSPACE_GAP),
      top,
      width,
      height: innerHeight,
    }))
  }

  const halfWidth = Math.max(0, (innerWidth - WORKSPACE_GAP) / 2)
  const halfHeight = Math.max(0, (innerHeight - WORKSPACE_GAP) / 2)
  return Array.from({ length: Math.max(slotCount, 4) }, (_, index) => ({
    left: left + (index % 2) * (halfWidth + WORKSPACE_GAP),
    top: top + Math.floor(index / 2) * (halfHeight + WORKSPACE_GAP),
    width: halfWidth,
    height: halfHeight,
  }))
}

export const DECK_NEW_TAB_WIDTH = 56

export const getWorkspaceContentWidth = ({
  deckTabWidth,
  isDeck,
  size,
  slotCount,
}: {
  deckTabWidth: number
  isDeck: boolean
  size: WorkspaceSize
  slotCount: number
}) => {
  if (!isDeck) {
    return size.width
  }
  const decks = slotCount * (deckTabWidth + WORKSPACE_GAP)
  return Math.max(size.width, WORKSPACE_PADDING * 2 + decks + DECK_NEW_TAB_WIDTH)
}
