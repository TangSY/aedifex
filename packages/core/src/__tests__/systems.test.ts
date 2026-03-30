import { describe, expect, it } from 'vitest'
import { getWallThickness, getWallPlanFootprint, DEFAULT_WALL_THICKNESS, DEFAULT_WALL_HEIGHT } from '../systems/wall/wall-footprint'
import { calculateLevelMiters, getAdjacentWallIds } from '../systems/wall/wall-mitering'
import type { WallNode } from '../schema/nodes/wall'

// ============================================================================
// Helpers
// ============================================================================

let _wallIdCounter = 0

function makeWall(
  start: [number, number],
  end: [number, number],
  opts?: { thickness?: number; id?: string },
): WallNode {
  _wallIdCounter++
  return {
    id: opts?.id ?? `wall_${_wallIdCounter}`,
    type: 'wall',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    children: [],
    start,
    end,
    thickness: opts?.thickness,
    frontSide: 'unknown',
    backSide: 'unknown',
  } as WallNode
}

/** Compute 2D wall length */
function wallLength(w: WallNode): number {
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  return Math.hypot(dx, dz)
}

/** Compute wall midpoint */
function wallMidpoint(w: WallNode): [number, number] {
  return [
    (w.start[0] + w.end[0]) / 2,
    (w.start[1] + w.end[1]) / 2,
  ]
}

/** Wall normal (left-perpendicular of direction vector, normalized) */
function wallNormal(w: WallNode): [number, number] {
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  const L = Math.hypot(dx, dz)
  return [-dz / L, dx / L]
}

// ============================================================================
// DEFAULT constants
// ============================================================================

describe('wall system defaults', () => {
  it('DEFAULT_WALL_THICKNESS is 0.1', () => {
    expect(DEFAULT_WALL_THICKNESS).toBe(0.1)
  })

  it('DEFAULT_WALL_HEIGHT is 2.5', () => {
    expect(DEFAULT_WALL_HEIGHT).toBe(2.5)
  })
})

// ============================================================================
// getWallThickness
// ============================================================================

describe('getWallThickness', () => {
  it('returns wall.thickness when defined', () => {
    const w = makeWall([0, 0], [3, 0], { thickness: 0.3 })
    expect(getWallThickness(w)).toBe(0.3)
  })

  it('returns DEFAULT_WALL_THICKNESS when thickness is undefined', () => {
    const w = makeWall([0, 0], [3, 0])
    expect(getWallThickness(w)).toBe(DEFAULT_WALL_THICKNESS)
  })
})

// ============================================================================
// Wall geometry helpers (unit tests of geometry logic)
// ============================================================================

describe('wall length calculation', () => {
  it('calculates length of a horizontal wall', () => {
    const w = makeWall([0, 0], [5, 0])
    expect(wallLength(w)).toBeCloseTo(5)
  })

  it('calculates length of a vertical wall', () => {
    const w = makeWall([0, 0], [0, 4])
    expect(wallLength(w)).toBeCloseTo(4)
  })

  it('calculates length of a diagonal wall (3-4-5 triangle)', () => {
    const w = makeWall([0, 0], [3, 4])
    expect(wallLength(w)).toBeCloseTo(5)
  })

  it('returns 0 for a degenerate wall', () => {
    const w = makeWall([2, 3], [2, 3])
    expect(wallLength(w)).toBe(0)
  })
})

describe('wall midpoint calculation', () => {
  it('calculates midpoint of horizontal wall', () => {
    const w = makeWall([0, 0], [4, 0])
    const [mx, mz] = wallMidpoint(w)
    expect(mx).toBeCloseTo(2)
    expect(mz).toBeCloseTo(0)
  })

  it('calculates midpoint of diagonal wall', () => {
    const w = makeWall([1, 1], [3, 5])
    const [mx, mz] = wallMidpoint(w)
    expect(mx).toBeCloseTo(2)
    expect(mz).toBeCloseTo(3)
  })
})

describe('wall normal direction', () => {
  it('normal of horizontal wall (along +X) points in +Z direction', () => {
    // Wall from left to right → normal points upward (+Z in 2D)
    const w = makeWall([0, 0], [1, 0])
    const [nx, nz] = wallNormal(w)
    expect(nx).toBeCloseTo(0)
    expect(nz).toBeCloseTo(1)
  })

  it('normal of vertical wall (along +Z) points in -X direction', () => {
    const w = makeWall([0, 0], [0, 1])
    const [nx, nz] = wallNormal(w)
    expect(nx).toBeCloseTo(-1)
    expect(nz).toBeCloseTo(0)
  })

  it('normal vector is unit length', () => {
    const w = makeWall([0, 0], [3, 4]) // diagonal
    const [nx, nz] = wallNormal(w)
    const len = Math.hypot(nx, nz)
    expect(len).toBeCloseTo(1)
  })
})

// ============================================================================
// getWallPlanFootprint
// ============================================================================

describe('getWallPlanFootprint', () => {
  it('returns empty array for a degenerate zero-length wall', () => {
    const w = makeWall([0, 0], [0, 0])
    const miterData = calculateLevelMiters([w])
    const footprint = getWallPlanFootprint(w, miterData)
    expect(footprint).toEqual([])
  })

  it('returns 4 corners for an isolated horizontal wall', () => {
    const w = makeWall([0, 0], [4, 0], { thickness: 0.2 })
    const miterData = calculateLevelMiters([w])
    const footprint = getWallPlanFootprint(w, miterData)
    expect(footprint.length).toBeGreaterThanOrEqual(4)
  })

  it('footprint extends by half-thickness on each side of wall axis', () => {
    const w = makeWall([0, 0], [4, 0], { thickness: 0.2 })
    const miterData = calculateLevelMiters([w])
    const footprint = getWallPlanFootprint(w, miterData)

    // Wall along x-axis: footprint should span y from -0.1 to +0.1
    const ys = footprint.map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(-0.1)
    expect(Math.max(...ys)).toBeCloseTo(0.1)
  })

  it('all footprint points have y-coordinates within half-thickness of wall axis for simple wall', () => {
    const thickness = 0.3
    const halfT = thickness / 2
    const w = makeWall([0, 0], [5, 0], { thickness })
    const miterData = calculateLevelMiters([w])
    const footprint = getWallPlanFootprint(w, miterData)

    for (const p of footprint) {
      expect(Math.abs(p.y)).toBeLessThanOrEqual(halfT + 0.001)
    }
  })
})

// ============================================================================
// calculateLevelMiters
// ============================================================================

describe('calculateLevelMiters', () => {
  it('returns empty junction data for a single isolated wall', () => {
    const w = makeWall([0, 0], [5, 0])
    const miterData = calculateLevelMiters([w])
    expect(miterData.junctions.size).toBe(0)
    expect(miterData.junctionData.size).toBe(0)
  })

  it('detects junction at corner where two walls meet', () => {
    // L-shaped corner: wall1 ends at (3,0), wall2 starts at (3,0)
    const w1 = makeWall([0, 0], [3, 0])
    const w2 = makeWall([3, 0], [3, 4])
    const miterData = calculateLevelMiters([w1, w2])

    expect(miterData.junctions.size).toBeGreaterThanOrEqual(1)
  })

  it('detects T-junction when wall endpoint lies on another wall segment', () => {
    // w1 is horizontal, w2 starts at its midpoint
    const w1 = makeWall([0, 0], [6, 0])
    const w2 = makeWall([3, 0], [3, 4]) // T-junction at (3,0)
    const miterData = calculateLevelMiters([w1, w2])

    expect(miterData.junctions.size).toBeGreaterThanOrEqual(1)
  })

  it('returns empty junctions for two disconnected walls', () => {
    const w1 = makeWall([0, 0], [2, 0])
    const w2 = makeWall([5, 5], [8, 5])
    const miterData = calculateLevelMiters([w1, w2])
    expect(miterData.junctions.size).toBe(0)
  })

  it('handles empty wall array', () => {
    const miterData = calculateLevelMiters([])
    expect(miterData.junctions.size).toBe(0)
    expect(miterData.junctionData.size).toBe(0)
  })

  it('detects all 4 corners of a closed room', () => {
    // Rectangle: 4 walls forming a closed loop
    const w1 = makeWall([0, 0], [4, 0]) // bottom
    const w2 = makeWall([4, 0], [4, 3]) // right
    const w3 = makeWall([4, 3], [0, 3]) // top
    const w4 = makeWall([0, 3], [0, 0]) // left

    const miterData = calculateLevelMiters([w1, w2, w3, w4])
    // 4 corners
    expect(miterData.junctions.size).toBe(4)
  })
})

// ============================================================================
// getAdjacentWallIds
// ============================================================================

describe('getAdjacentWallIds', () => {
  it('returns empty set when no walls share junctions with dirty walls', () => {
    const w1 = makeWall([0, 0], [2, 0], { id: 'wall_a' })
    const w2 = makeWall([5, 5], [8, 5], { id: 'wall_b' })

    const adjacent = getAdjacentWallIds([w1, w2], new Set(['wall_a']))
    expect(adjacent.size).toBe(0)
  })

  it('finds adjacent wall at L-corner', () => {
    const w1 = makeWall([0, 0], [3, 0], { id: 'wall_a' })
    const w2 = makeWall([3, 0], [3, 4], { id: 'wall_b' })

    const adjacent = getAdjacentWallIds([w1, w2], new Set(['wall_a']))
    expect(adjacent.has('wall_b')).toBe(true)
  })

  it('finds adjacent wall in T-junction', () => {
    const w1 = makeWall([0, 0], [6, 0], { id: 'wall_base' })
    const w2 = makeWall([3, 0], [3, 4], { id: 'wall_branch' })

    // Marking w2 dirty should find w_base as adjacent
    const adjacent = getAdjacentWallIds([w1, w2], new Set(['wall_branch']))
    expect(adjacent.has('wall_base')).toBe(true)
  })

  it('does not include dirty wall itself in result', () => {
    const w1 = makeWall([0, 0], [3, 0], { id: 'wall_a' })
    const w2 = makeWall([3, 0], [3, 4], { id: 'wall_b' })

    const adjacent = getAdjacentWallIds([w1, w2], new Set(['wall_a']))
    expect(adjacent.has('wall_a')).toBe(false)
  })

  it('returns empty set for empty dirty set', () => {
    const w1 = makeWall([0, 0], [3, 0], { id: 'wall_a' })
    const adjacent = getAdjacentWallIds([w1], new Set())
    expect(adjacent.size).toBe(0)
  })

  it('returns empty set for empty wall list', () => {
    const adjacent = getAdjacentWallIds([], new Set(['wall_a']))
    expect(adjacent.size).toBe(0)
  })

  it('finds multiple adjacent walls at a 3-way junction', () => {
    // Three walls meeting at (3, 0)
    const w1 = makeWall([0, 0], [3, 0], { id: 'wall_left' })
    const w2 = makeWall([3, 0], [6, 0], { id: 'wall_right' })
    const w3 = makeWall([3, 0], [3, 4], { id: 'wall_up' })

    const adjacent = getAdjacentWallIds([w1, w2, w3], new Set(['wall_left']))
    expect(adjacent.has('wall_right')).toBe(true)
    expect(adjacent.has('wall_up')).toBe(true)
  })
})
