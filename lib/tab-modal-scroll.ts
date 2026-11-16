export const TAB_ROW_GAP = 12

// A fresh controller is used for each opening. Wait for all three layout events
// before scrolling, and never override subsequent manual scrolling or dragging.
export function createTabModalScroll(shown = true) {
  return {
    shown,
    done: false,
    viewportHeight: 0,
    contentHeight: 0,
    listY: null as number | null,
    scroll(items: { id: string }[], activeId: string | undefined, rowHeight: number, scrollTo: (y: number) => void) {
      if (!this.shown || this.done || !this.viewportHeight || !this.contentHeight || this.listY === null) return
      const index = items.findIndex((tab) => tab.id === activeId)
      if (index < 0) return
      const rowTop = this.listY + index * (rowHeight + TAB_ROW_GAP)
      const y = Math.max(0, Math.min(rowTop - (this.viewportHeight - rowHeight) / 2, this.contentHeight - this.viewportHeight))
      scrollTo(y)
      this.done = true
    },
  }
}
