import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import { visibleRows } from './visible-rows'
import { ScrollDrag } from './scroll-drag'

describe('virtual item rows', () => {
  test('empty and short lists only mount their existing rows', () => {
    assert.deepEqual(visibleRows(0, 0.54, 0.235, 0), { start: 0, end: 0 })
    assert.deepEqual(visibleRows(10, 0.54, 0.235, 2), { start: 0, end: 2 })
  })

  test('a thousand-item list mounts at most six rows, including the buffer', () => {
    const count = 250
    for (let offset = 0; offset <= count * 0.235; offset += 0.013) {
      const rows = visibleRows(offset, 0.54, 0.235, count)
      const current = Math.min(offset, count * 0.235 - 0.54)
      assert.ok(rows.start <= Math.floor(current / 0.235))
      assert.ok(rows.end >= Math.min(count, Math.ceil((current + 0.54) / 0.235)))
      assert.ok(rows.end - rows.start <= 6)
      assert.ok(rows.start >= 0 && rows.end <= count)
    }
  })

  test('small movements keep the mounted range stable', () => {
    assert.deepEqual(visibleRows(0, 0.54, 0.235, 250), visibleRows(0.01, 0.54, 0.235, 250))
  })

  test('scrollbar jumps and shrinking lists clamp to valid rows', () => {
    assert.equal(visibleRows(10000, 0.54, 0.235, 250).end, 250)
    assert.deepEqual(visibleRows(10000, 0.54, 0.235, 1), { start: 0, end: 1 })
    assert.deepEqual(visibleRows(-10, 0.54, 0.235, 250), visibleRows(0, 0.54, 0.235, 250))
  })

  test('a drag that unmounts its original row never activates the pressed item', () => {
    const drag = new ScrollDrag()
    drag.begin(1, 0, 0)
    const offset = drag.move(1, 5, 250 * 0.235, 0.54)!
    assert.ok(visibleRows(offset, 0.54, 0.235, 250).start > 0)
    assert.equal(drag.end(1), false)
    drag.begin(1, 0, offset)
    assert.equal(drag.end(1), true)
  })
})
