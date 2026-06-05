import { describe, expect, test } from 'bun:test'
import { SlabNode } from '../schema'
import { getRenderableSlabPolygon } from './slab-polygon'

// getRenderableSlabPolygon transforms the editor polygon into what gets rendered:
//   - autoFromWalls=true  → insetPolygonFromCentroid by 0.02 + simplifyClosedPolygon(0.08)
//   - autoFromWalls=false → outsetPolygon by 0.05 (CCW/CW winding-aware via signed area)

const SQUARE_CCW: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

const SQUARE_CW: [number, number][] = [
  [0, 0],
  [0, 4],
  [4, 4],
  [4, 0],
]

function makeManual(polygon: [number, number][]) {
  return SlabNode.parse({ polygon, holes: [], elevation: 0.05, autoFromWalls: false })
}

function makeAuto(polygon: [number, number][]) {
  return SlabNode.parse({ polygon, holes: [], elevation: 0.05, autoFromWalls: true })
}

function bbox(poly: Array<[number, number]>) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of poly) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ }
}

describe('getRenderableSlabPolygon - manual slabs (outsetPolygon by SLAB_OUTSET=0.05)', () => {
  test('CCW square: outset expands bounding box by ~0.1 (0.05 each side)', () => {
    const slab = makeManual(SQUARE_CCW)
    const result = getRenderableSlabPolygon(slab)
    const b = bbox(result)
    expect(b.width).toBeCloseTo(4.1, 3)
    expect(b.depth).toBeCloseTo(4.1, 3)
    expect(b.minX).toBeCloseTo(-0.05, 3)
    expect(b.maxX).toBeCloseTo(4.05, 3)
  })

  test('CW square: signed-area-aware outset also expands outward (not inward)', () => {
    const slab = makeManual(SQUARE_CW)
    const result = getRenderableSlabPolygon(slab)
    const b = bbox(result)
    // Winding-aware: regardless of CW/CCW, the polygon should grow outward
    expect(b.width).toBeCloseTo(4.1, 3)
    expect(b.depth).toBeCloseTo(4.1, 3)
  })

  test('produces same vertex count as input for a simple convex polygon', () => {
    const slab = makeManual(SQUARE_CCW)
    const result = getRenderableSlabPolygon(slab)
    expect(result.length).toBe(SQUARE_CCW.length)
  })

  test('concave L-shape preserves vertex count and does not collapse', () => {
    // L-shape (6 vertices, concave)
    const L_SHAPE: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 2],
      [2, 2],
      [2, 4],
      [0, 4],
    ]
    const slab = makeManual(L_SHAPE)
    const result = getRenderableSlabPolygon(slab)
    // Outset of an L-shape should still produce 6 vertices (no degenerate collapse)
    expect(result.length).toBe(L_SHAPE.length)
    // Polygon should remain finite numerically (no NaN / Infinity from degenerate intersection)
    for (const [x, z] of result) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(z)).toBe(true)
    }
  })

  test('triangle: 3 vertices in, 3 vertices out', () => {
    const tri: [number, number][] = [
      [0, 0],
      [4, 0],
      [2, 4],
    ]
    const slab = makeManual(tri)
    const result = getRenderableSlabPolygon(slab)
    expect(result.length).toBe(3)
  })

  test('degenerate polygon (< 3 vertices) returned unchanged', () => {
    const slab = makeManual([
      [0, 0],
      [1, 0],
    ])
    const result = getRenderableSlabPolygon(slab)
    expect(result.length).toBe(2)
  })
})

describe('getRenderableSlabPolygon - auto slabs (inset 0.02 + simplify 0.08)', () => {
  test('auto-slab square: bounding box shrinks slightly inward (inset 0.02)', () => {
    const slab = makeAuto(SQUARE_CCW)
    const result = getRenderableSlabPolygon(slab)
    const b = bbox(result)
    // The simplifier might reduce to a smaller polygon, but the geometry should
    // be at most as large as the original (and roughly the same dimensions)
    expect(b.width).toBeLessThanOrEqual(4)
    expect(b.depth).toBeLessThanOrEqual(4)
    expect(b.width).toBeGreaterThanOrEqual(3.9)
  })

  test('auto-slab simplify tolerance reduces near-collinear runs', () => {
    // Square with redundant midpoints along each edge
    const dense: [number, number][] = [
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 2],
      [4, 4],
      [2, 4],
      [0, 4],
      [0, 2],
    ]
    const slab = makeAuto(dense)
    const result = getRenderableSlabPolygon(slab)
    // With 0.08 tolerance the dense edge midpoints should collapse out
    expect(result.length).toBeLessThan(dense.length)
  })
})
