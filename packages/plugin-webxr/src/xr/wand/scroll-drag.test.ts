import { describe, expect, test } from 'bun:test'
import { clampScroll, ScrollDrag } from './scroll-drag'

describe('spatial list dragging', () => {
  test('small pointing jitter remains a click', () => {
    const drag = new ScrollDrag()
    expect(drag.begin(1, 0.2, 0.1)).toBe(true)
    expect(drag.move(1, 0.205, 2, 0.4)).toBe(0.1)
    expect(drag.end(1)).toBe(true)
  })

  test('a drag never activates a tile even if it returns to the start', () => {
    const drag = new ScrollDrag()
    drag.begin(1, 0, 0)
    expect(drag.move(1, 0.3, 2, 0.4)).toBeCloseTo(0.3)
    drag.move(1, 0, 2, 0.4)
    expect(drag.end(1)).toBe(false)
    expect(drag.pointerId).toBeNull()
  })

  test('clamps both ends and maps scrollbar movement in the opposite direction', () => {
    expect(clampScroll(-2, 2, 0.4)).toBe(0)
    expect(clampScroll(9, 2, 0.4)).toBe(1.6)
    expect(clampScroll(2, 0.2, 0.4)).toBe(0)
    const drag = new ScrollDrag()
    drag.begin(1, 0, 0.5, -4)
    expect(drag.move(1, -0.1, 2, 0.4)).toBeCloseTo(0.9)
    expect(drag.move(1, 5, 2, 0.4)).toBe(0)
  })

  test('another hand cannot steal or release the scroll', () => {
    const drag = new ScrollDrag()
    drag.begin(1, 0, 0)
    expect(drag.begin(2, 0, 0)).toBe(false)
    expect(drag.move(2, 0.5, 2, 0.4)).toBeUndefined()
    expect(drag.end(2)).toBe(false)
    expect(drag.pointerId).toBe(1)
    drag.cancel()
    expect(drag.begin(2, 0, 0)).toBe(true)
    expect(drag.end(2)).toBe(true)
  })
})
