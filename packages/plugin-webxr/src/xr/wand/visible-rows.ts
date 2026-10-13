import { clampScroll } from './scroll-drag'

export type VisibleRows = { start: number; end: number }

/** End is exclusive; one extra row on each side keeps scrolling edges populated. */
export function visibleRows(offset: number, viewportHeight: number, rowHeight: number, rowCount: number): VisibleRows {
  const current = clampScroll(offset, rowCount * rowHeight, viewportHeight)
  return {
    start: Math.max(0, Math.floor(current / rowHeight) - 1),
    end: Math.min(rowCount, Math.ceil((current + viewportHeight) / rowHeight) + 1),
  }
}
