import { describe, expect, test } from 'bun:test'
import { ScanNode } from './scan'

function makeScan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'scan_abc',
    type: 'scan',
    parentId: null,
    url: 'asset://scan/room.ply',
    ...overrides,
  }
}

describe('ScanNode — required url + asset URL refine', () => {
  test('rejects when url is missing', () => {
    const r = ScanNode.safeParse({
      id: 'scan_abc',
      type: 'scan',
      parentId: null,
    })
    expect(r.success).toBe(false)
  })

  test('rejects javascript: url', () => {
    const r = ScanNode.safeParse(makeScan({ url: 'javascript:alert(1)' }))
    expect(r.success).toBe(false)
  })

  test('accepts asset:// url', () => {
    const r = ScanNode.safeParse(makeScan({ url: 'asset://scan/x' }))
    expect(r.success).toBe(true)
  })

  test('accepts https:// url', () => {
    const r = ScanNode.safeParse(makeScan({ url: 'https://cdn.example.com/scan.ply' }))
    expect(r.success).toBe(true)
  })
})

describe('ScanNode — opacity uses 0-100 range (NOT 0-1)', () => {
  test('opacity defaults to 100 (NOT 1)', () => {
    const r = ScanNode.parse(makeScan())
    expect(r.opacity).toBe(100)
  })

  test('opacity accepts value 50 (mid-range on 0-100)', () => {
    const r = ScanNode.parse(makeScan({ opacity: 50 }))
    expect(r.opacity).toBe(50)
  })

  test('opacity accepts boundary value 0', () => {
    const r = ScanNode.parse(makeScan({ opacity: 0 }))
    expect(r.opacity).toBe(0)
  })

  test('opacity accepts boundary value 100', () => {
    const r = ScanNode.parse(makeScan({ opacity: 100 }))
    expect(r.opacity).toBe(100)
  })

  test('opacity REJECTS value > 100 (e.g., 101)', () => {
    const r = ScanNode.safeParse(makeScan({ opacity: 101 }))
    expect(r.success).toBe(false)
  })

  test('opacity REJECTS negative values', () => {
    const r = ScanNode.safeParse(makeScan({ opacity: -1 }))
    expect(r.success).toBe(false)
  })

  test('UNIT MISMATCH GUARD: 0-1 callers would silently get 1 (not 100%) — regression pin', () => {
    // A caller assuming opacity is 0-1 would pass 0.5 expecting 50%; the schema
    // would happily store 0.5 (a value 1/200th of full opacity) — this test
    // pins current behavior so any future migration to 0-1 must be intentional.
    const r = ScanNode.parse(makeScan({ opacity: 0.5 }))
    expect(r.opacity).toBe(0.5)
    expect(r.opacity).not.toBe(50) // confirm we did NOT auto-convert
  })

  test('UNIT MISMATCH GUARD: opacity=1 in 0-1 world = opacity=1 (i.e., 1%) in 0-100 world', () => {
    const r = ScanNode.parse(makeScan({ opacity: 1 }))
    expect(r.opacity).toBe(1)
  })
})

describe('ScanNode — defaults', () => {
  test('position defaults to [0, 0, 0]', () => {
    const r = ScanNode.parse(makeScan())
    expect(r.position).toEqual([0, 0, 0])
  })

  test('rotation defaults to [0, 0, 0]', () => {
    const r = ScanNode.parse(makeScan())
    expect(r.rotation).toEqual([0, 0, 0])
  })

  test('scale defaults to 1 (number, not tuple)', () => {
    const r = ScanNode.parse(makeScan())
    expect(r.scale).toBe(1)
  })
})
