import { describe, expect, test } from 'bun:test'
import { itemOverlapsPolygon, pointInPolygon, wallOverlapsPolygon } from './spatial-grid-manager'

// Pure geometry helpers (no useScene dependency).
// These exports back the slab elevation lookup used for walls and items.

const SQUARE_4x4: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
]

describe('pointInPolygon (manager export)', () => {
  test('interior point', () => {
    expect(pointInPolygon(2, 2, SQUARE_4x4)).toBe(true)
  })

  test('clearly exterior point', () => {
    expect(pointInPolygon(10, 10, SQUARE_4x4)).toBe(false)
  })

  test('point near top-right vertex (outside by epsilon)', () => {
    expect(pointInPolygon(4.001, 4.001, SQUARE_4x4)).toBe(false)
  })
})

describe('wallOverlapsPolygon - along-wall nudge regression guard', () => {
  // Per spatial-grid-manager.ts: walls that merely touch a polygon at a corner
  // and extend outward must NOT be reported as overlapping. The 1e-6 nudge
  // into the wall pushes the endpoint test off the corner.

  test('wall touching polygon at a single corner (extending outward) does NOT overlap', () => {
    // Wall starts at (0,0) corner of slab, extends outward to (-2, -2)
    const start: [number, number] = [0, 0]
    const end: [number, number] = [-2, -2]
    expect(wallOverlapsPolygon(start, end, SQUARE_4x4)).toBe(false)
  })

  test('wall entirely outside slab does not overlap', () => {
    expect(wallOverlapsPolygon([-1, -1], [-3, -3], SQUARE_4x4)).toBe(false)
  })

  test('wall crossing through slab interior overlaps', () => {
    // Midpoint at (2,2) is clearly inside
    expect(wallOverlapsPolygon([-1, 2], [5, 2], SQUARE_4x4)).toBe(true)
  })

  test('wall with one endpoint clearly inside overlaps', () => {
    expect(wallOverlapsPolygon([2, 2], [10, 10], SQUARE_4x4)).toBe(true)
  })

  test('wall collinear with a polygon edge (both endpoints on the edge) overlaps', () => {
    // Along the bottom edge from (1,0) to (3,0)
    expect(wallOverlapsPolygon([1, 0], [3, 0], SQUARE_4x4)).toBe(true)
  })

  test('zero-length degenerate wall: no crash, treated as not overlapping outside', () => {
    // len=0 path: nudge skipped, midpoint == start at (-5,-5)
    expect(wallOverlapsPolygon([-5, -5], [-5, -5], SQUARE_4x4)).toBe(false)
  })
})

describe('wallOverlapsPolygon - 5-point sampling for holes', () => {
  // Real scenario: wall's midpoint might fall in a hole (stair opening) but
  // endpoints are on solid slab. The wallOverlapsPolygon test alone (without
  // hole subtraction) just verifies the wall is on the outer polygon.
  // Hole sampling lives in SpatialGridManager.getSlabElevationForWall using 5 points.

  test('wall crossing slab interior — overlaps outer polygon regardless of mid-position', () => {
    // (Hole-aware sampling is integration-level — here we verify outer overlap)
    expect(wallOverlapsPolygon([0.5, 2], [3.5, 2], SQUARE_4x4)).toBe(true)
  })
})

describe('itemOverlapsPolygon - footprint vs polygon', () => {
  test('item fully inside polygon: overlaps', () => {
    const overlap = itemOverlapsPolygon([2, 0, 2], [1, 1, 1], [0, 0, 0], SQUARE_4x4)
    expect(overlap).toBe(true)
  })

  test('item fully outside polygon: no overlap', () => {
    const overlap = itemOverlapsPolygon([10, 0, 10], [1, 1, 1], [0, 0, 0], SQUARE_4x4)
    expect(overlap).toBe(false)
  })

  test('item straddling polygon edge: overlaps via edge intersection', () => {
    // Centered on x=4 edge, half inside half outside
    const overlap = itemOverlapsPolygon([4, 0, 2], [1, 1, 1], [0, 0, 0], SQUARE_4x4)
    expect(overlap).toBe(true)
  })

  test('large item containing entire polygon: overlap detected via polygon-vertex-in-item', () => {
    const overlap = itemOverlapsPolygon([2, 0, 2], [20, 1, 20], [0, 0, 0], SQUARE_4x4)
    expect(overlap).toBe(true)
  })

  test('inset shrinks item footprint — inset=2 shrinks 1x1 item to ~zero footprint, may miss tiny polygon overlap', () => {
    // 0.5x0.5 item with inset 0.3 shrinks footprint to 0.2-wide; placed clearly outside polygon
    const overlap = itemOverlapsPolygon([10, 0, 10], [0.5, 1, 0.5], [0, 0, 0], SQUARE_4x4, 0.3)
    expect(overlap).toBe(false)
  })
})
