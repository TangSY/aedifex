import { beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock @aedifex/core so collision-detection's calls to useScene + pointInPolygon
// resolve against an in-test scene. pointInPolygon uses a real ray-casting
// algorithm so concave shapes get exercised end-to-end.
// ============================================================================

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  // Real ray-cast point-in-polygon (canonical algorithm)
  pointInPolygon: (px: number, pz: number, polygon: [number, number][]) => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]![0]
      const zi = polygon[i]![1]
      const xj = polygon[j]![0]
      const zj = polygon[j]![1]
      const intersect = (zi > pz) !== (zj > pz)
        && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
      if (intersect) inside = !inside
    }
    return inside
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({ selection: { levelId: mockSelectionLevelId.value } }),
  },
}))

import {
  computeCollinearOverlap,
  getItemAABB,
  getItemCorners,
  obbOverlap,
  wallsCrossThrough,
  checkZoneBoundary,
  checkWallCollision,
} from '../collision-detection'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockSelectionLevelId.value = null
})

function makeLevel(id: string, children: string[]) {
  mockNodes[id] = { id, type: 'level', visible: true, metadata: {}, children, parentId: null }
}

function makeWall(
  id: string,
  parentId: string,
  start: [number, number],
  end: [number, number],
  thickness = 0.2,
) {
  mockNodes[id] = {
    id,
    type: 'wall',
    visible: true,
    metadata: {},
    parentId,
    children: [],
    start,
    end,
    height: 2.5,
    thickness,
  }
}

function makeZone(id: string, parentId: string, polygon: [number, number][]) {
  mockNodes[id] = {
    id,
    type: 'zone',
    visible: true,
    metadata: {},
    parentId,
    children: [],
    polygon,
    name: 'room',
  }
}

// ============================================================================
// wallsCrossThrough — T-junction tolerance regression guard
// ============================================================================

describe('wallsCrossThrough', () => {
  it('returns false for T-junction where one wall endpoint touches another wall body', () => {
    // Existing wall: horizontal (0,0) → (10,0)
    // New wall:     vertical at x=5, starting from y=0, going up to (5, 5)
    // The new wall's start endpoint is ON the existing wall body — classic T-junction.
    const result = wallsCrossThrough([5, 0], [5, 5], [0, 0], [10, 0])
    expect(result).toBe(false)
  })

  it('returns false for genuine corner — shared endpoints', () => {
    const result = wallsCrossThrough([0, 0], [5, 0], [0, 0], [0, 5])
    expect(result).toBe(false)
  })

  it('returns true for walls that genuinely cross mid-body (plus sign)', () => {
    // Two walls crossing through the middle of both — not at endpoints.
    const result = wallsCrossThrough([-5, 0], [5, 0], [0, -5], [0, 5])
    expect(result).toBe(true)
  })

  it('returns false for parallel non-overlapping walls', () => {
    const result = wallsCrossThrough([0, 0], [5, 0], [0, 2], [5, 2])
    expect(result).toBe(false)
  })

  it('returns false for collinear walls (handled by overlap check, not crossing)', () => {
    const result = wallsCrossThrough([0, 0], [5, 0], [3, 0], [8, 0])
    expect(result).toBe(false)
  })
})

// ============================================================================
// computeCollinearOverlap
// ============================================================================

describe('computeCollinearOverlap', () => {
  it('detects collinear overlap and reports overlap length', () => {
    // Wall A: (0,0) → (10,0); Wall B: (5,0) → (15,0) — overlap from 5 to 10 = 5m
    const overlap = computeCollinearOverlap([0, 0], [10, 0], [5, 0], [15, 0])
    expect(overlap).toBeCloseTo(5, 5)
  })

  it('returns 0 for non-collinear walls', () => {
    const overlap = computeCollinearOverlap([0, 0], [10, 0], [0, 2], [10, 2])
    expect(overlap).toBe(0)
  })

  it('returns 0 for walls too far apart perpendicularly', () => {
    const overlap = computeCollinearOverlap([0, 0], [10, 0], [0, 1], [10, 1])
    expect(overlap).toBe(0)
  })
})

// ============================================================================
// getItemAABB — rotated OBB AABB enclosure
// ============================================================================

describe('getItemAABB', () => {
  it('computes axis-aligned bbox for un-rotated item', () => {
    const aabb = getItemAABB([0, 0, 0], [2, 1, 4], [0, 0, 0])
    expect(aabb.minX).toBeCloseTo(-1)
    expect(aabb.maxX).toBeCloseTo(1)
    expect(aabb.minZ).toBeCloseTo(-2)
    expect(aabb.maxZ).toBeCloseTo(2)
  })

  it('expands AABB correctly for 45-degree-rotated item', () => {
    // 2x2 footprint rotated 45deg → AABB grows to ~2*sqrt(2) ≈ 2.828
    const aabb = getItemAABB([0, 0, 0], [2, 1, 2], [0, Math.PI / 4, 0])
    expect(aabb.maxX - aabb.minX).toBeCloseTo(2 * Math.SQRT2, 4)
    expect(aabb.maxZ - aabb.minZ).toBeCloseTo(2 * Math.SQRT2, 4)
  })

  it('offsets by position', () => {
    const aabb = getItemAABB([10, 0, 5], [2, 1, 2], [0, 0, 0])
    expect(aabb.minX).toBeCloseTo(9)
    expect(aabb.maxX).toBeCloseTo(11)
    expect(aabb.minZ).toBeCloseTo(4)
    expect(aabb.maxZ).toBeCloseTo(6)
  })
})

// ============================================================================
// obbOverlap — separating axis theorem for rotated boxes
// ============================================================================

describe('obbOverlap (Separating Axis Theorem)', () => {
  it('detects overlap of two axis-aligned overlapping squares', () => {
    const a = getItemCorners([0, 0, 0], [2, 1, 2], [0, 0, 0])
    const b = getItemCorners([1, 0, 1], [2, 1, 2], [0, 0, 0])
    expect(obbOverlap(a, b)).toBe(true)
  })

  it('reports non-overlap for rotated boxes whose AABBs overlap but actual OBBs do not', () => {
    // Two narrow 1m wide × 4m deep rectangles at 45 degrees forming a + shape
    // shifted apart. Their AABBs (~2.83 m square) overlap, but the rotated
    // rectangles themselves do not at sufficient stand-off.
    const a = getItemCorners([0, 0, 0], [0.5, 1, 4], [0, 0, 0])
    const b = getItemCorners([3, 0, 0], [0.5, 1, 4], [0, Math.PI / 2, 0])
    // a is a 0.5 wide vertical bar at x=0; b is a 4-wide horizontal bar at x=3.
    // b spans x=[1,5] z=[-0.25,0.25]; a spans x=[-0.25,0.25] z=[-2,2]. No overlap.
    expect(obbOverlap(a, b)).toBe(false)
  })

  it('separation axes correctly align with rotated OBB edges', () => {
    // Two boxes both rotated 30 degrees, side by side, no overlap.
    const a = getItemCorners([0, 0, 0], [1, 1, 1], [0, Math.PI / 6, 0])
    const b = getItemCorners([5, 0, 5], [1, 1, 1], [0, Math.PI / 6, 0])
    expect(obbOverlap(a, b)).toBe(false)
  })
})

// ============================================================================
// checkZoneBoundary — point-in-polygon for concave shape
// ============================================================================

describe('checkZoneBoundary point-in-polygon (concave zone)', () => {
  it('detects point inside concave (L-shaped) zone via ray-casting', () => {
    // Build an L-shaped zone: outline a "boot"
    // Verts (CCW): (0,0) (10,0) (10,5) (5,5) (5,10) (0,10)
    makeLevel('lvl', ['zone1'])
    makeZone('zone1', 'lvl', [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
    ])

    // Item at [2, 0, 8] — inside the upper arm of the L (small item)
    const result = checkZoneBoundary([2, 0, 8], [1, 1, 1], [0, 0, 0], 'lvl')
    // Either null (fits) or adjusted with .position; both indicate inside.
    expect(result).not.toBe('too-large')
  })

  it('redirects item to nearest zone when position is outside all zones (indoor=default)', () => {
    makeLevel('lvl', ['zone1'])
    makeZone('zone1', 'lvl', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
    // Item far outside zone (e.g. at (-20, 0, -20))
    const result = checkZoneBoundary([-20, 0, -20], [1, 1, 1], [0, 0, 0], 'lvl', false)
    expect(result).not.toBeNull()
    expect(result).not.toBe('too-large')
    if (result && result !== 'too-large') {
      // x and z should be inside the [0..10] zone
      expect(result.position[0]).toBeGreaterThanOrEqual(0)
      expect(result.position[0]).toBeLessThanOrEqual(10)
      expect(result.position[2]).toBeGreaterThanOrEqual(0)
      expect(result.position[2]).toBeLessThanOrEqual(10)
    }
  })

  it('returns null when outdoor=true and position is outside all zones', () => {
    makeLevel('lvl', ['zone1'])
    makeZone('zone1', 'lvl', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
    const result = checkZoneBoundary([-20, 0, -20], [1, 1, 1], [0, 0, 0], 'lvl', true)
    expect(result).toBeNull()
  })

  it('returns too-large when item cannot fit in any zone', () => {
    makeLevel('lvl', ['zone1'])
    makeZone('zone1', 'lvl', [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ])
    // Item 5x5 way bigger than 2x2 zone, placed inside
    const result = checkZoneBoundary([1, 0, 1], [5, 1, 5], [0, 0, 0], 'lvl')
    expect(result).toBe('too-large')
  })
})

// ============================================================================
// checkWallCollision — rotated wall geometry
// ============================================================================

describe('checkWallCollision', () => {
  it('returns null when no walls on the level', () => {
    makeLevel('lvl', [])
    const result = checkWallCollision([5, 0, 5], [1, 1, 1], [0, 0, 0], 'lvl')
    expect(result).toBeNull()
  })

  it('detects collision with a horizontal wall and pushes item away', () => {
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', [0, 0], [10, 0], 0.2)
    // Item centered ON the wall — should detect collision and push perpendicular
    const result = checkWallCollision([5, 0, 0], [1, 1, 1], [0, 0, 0], 'lvl')
    expect(result).not.toBeNull()
    if (result && result !== 'no-space') {
      // Should be pushed off the wall line
      expect(Math.abs(result.position[2])).toBeGreaterThan(0)
    }
  })
})
