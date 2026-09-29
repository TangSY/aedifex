export const SCROLL_DRAG_THRESHOLD = 0.012

export function clampScroll(offset: number, contentHeight: number, height: number) {
  return Math.max(0, Math.min(Math.max(0, contentHeight - height), offset))
}

/** A scroll press owns one pointer until release, even outside the viewport. */
export class ScrollDrag {
  pointerId: number | null = null
  dragged = false
  private startY = 0
  private startOffset = 0
  private scale = 1

  begin(pointerId: number, y: number, offset: number, scale = 1) {
    if (this.pointerId !== null) return false
    this.pointerId = pointerId
    this.startY = y
    this.startOffset = offset
    this.scale = scale
    this.dragged = false
    return true
  }

  move(pointerId: number, y: number, contentHeight: number, height: number) {
    if (pointerId !== this.pointerId) return undefined
    const delta = y - this.startY
    if (Math.abs(delta) >= SCROLL_DRAG_THRESHOLD) this.dragged = true
    if (!this.dragged) return this.startOffset
    return clampScroll(this.startOffset + delta * this.scale, contentHeight, height)
  }

  end(pointerId: number) {
    if (pointerId !== this.pointerId) return false
    const click = !this.dragged
    this.pointerId = null
    return click
  }

  cancel() {
    this.pointerId = null
    this.dragged = false
  }
}
