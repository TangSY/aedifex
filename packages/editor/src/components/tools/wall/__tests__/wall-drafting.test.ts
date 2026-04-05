import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — both external packages must be mocked before importing wall-drafting
// ---------------------------------------------------------------------------

vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => ({
      nodes: {},
      createNode: vi.fn(),
    }),
  },
  WallNode: {
    parse: vi.fn((input: unknown) => input),
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({
      selection: { levelId: 'level:1' },
    }),
  },
}))

// sfx-bus is internal — mock it to avoid audio side-effects
vi.mock('../../../lib/sfx-bus', () => ({
  sfxEmitter: {
    emit: vi.fn(),
  },
}))

import {
  snapPointToGrid,
  snapPointTo45Degrees,
  findWallSnapTarget,
  snapWallDraftPoint,
  isWallLongEnough,
  WALL_GRID_STEP,
  WALL_JOIN_SNAP_RADIUS,
  WALL_MIN_LENGTH,
  type WallPlanPoint,
} from '../wall-drafting'
import type { WallNode } from '@aedifex/core'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeWall(
  id: string,
  start: [number, number],
  end: [number, number],
): WallNode {
  return {
    id: id as WallNode['id'],
    type: 'wall',
    name: 'Test Wall',
    start,
    end,
    children: [],
    frontSide: 'unknown',
    backSide: 'unknown',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: null,
  } as WallNode
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('wall-drafting constants', () => {
  it('WALL_GRID_STEP is 0.5', () => {
    expect(WALL_GRID_STEP).toBe(0.5)
  })

  it('WALL_JOIN_SNAP_RADIUS is 0.35', () => {
    expect(WALL_JOIN_SNAP_RADIUS).toBe(0.35)
  })

  it('WALL_MIN_LENGTH is 0.5', () => {
    expect(WALL_MIN_LENGTH).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// snapPointToGrid
// ---------------------------------------------------------------------------

describe('snapPointToGrid', () => {
  it('snaps both axes to 0.5 grid with default step', () => {
    expect(snapPointToGrid([0.3, 0.6])).toEqual([0.5, 0.5])
    expect(snapPointToGrid([1.3, 2.6])).toEqual([1.5, 2.5])
    expect(snapPointToGrid([0.0, 0.0])).toEqual([0.0, 0.0])
    expect(snapPointToGrid([1.0, 2.0])).toEqual([1.0, 2.0])
  })

  it('rounds to nearest 0.5 (0.25 boundary snaps up)', () => {
    // 0.25 → round(0.25/0.5)*0.5 = round(0.5)*0.5 = 0.5
    expect(snapPointToGrid([0.25, 0.25])).toEqual([0.5, 0.5])
  })

  it('rounds down when value is just below 0.25', () => {
    // 0.24 → round(0.24/0.5)*0.5 = round(0.48)*0.5 = 0.0
    expect(snapPointToGrid([0.24, 0.24])).toEqual([0.0, 0.0])
  })

  it('uses custom step size when provided', () => {
    expect(snapPointToGrid([0.3, 0.7], 1.0)).toEqual([0.0, 1.0])
    expect(snapPointToGrid([1.4, 2.6], 1.0)).toEqual([1.0, 3.0])
  })

  it('snaps with custom step of 0.25', () => {
    expect(snapPointToGrid([0.1, 0.2], 0.25)).toEqual([0.0, 0.25])
    expect(snapPointToGrid([0.13, 0.37], 0.25)).toEqual([0.25, 0.25])
  })

  it('handles negative coordinates', () => {
    expect(snapPointToGrid([-0.3, -0.6])).toEqual([-0.5, -0.5])
    expect(snapPointToGrid([-1.2, -1.8])).toEqual([-1.0, -2.0])
  })
})

// ---------------------------------------------------------------------------
// snapPointTo45Degrees
// ---------------------------------------------------------------------------

describe('snapPointTo45Degrees', () => {
  const start: WallPlanPoint = [0, 0]

  it('snaps horizontal movement (0°) to horizontal', () => {
    // angle≈0, nearest 45° = 0 → stays horizontal
    const result = snapPointTo45Degrees(start, [2.0, 0.1])
    expect(result[1]).toBeCloseTo(0, 1) // near-zero Z
  })

  it('snaps vertical movement (90°) to vertical', () => {
    const result = snapPointTo45Degrees(start, [0.05, 2.0])
    expect(result[0]).toBeCloseTo(0, 1)
  })

  it('snaps diagonal movement (45°) to 45°', () => {
    const result = snapPointTo45Degrees(start, [1.0, 1.0])
    expect(result[0]).toBeCloseTo(result[1], 5)
  })

  it('snaps to nearest 45° for near-30° angle', () => {
    // atan2(1, sqrt(3)) ≈ 30° → snaps to 45°
    const result = snapPointTo45Degrees(start, [Math.sqrt(3), 1.0])
    // At 45°, the snapped X and Z should be equal
    expect(result[0]).toBeCloseTo(result[1], 1)
  })

  it('preserves distance from start (within 0.5 grid snap tolerance)', () => {
    // The original distance and snapped distance should be similar
    // (snapPointToGrid is applied after angle snap, altering distance slightly)
    const cursor: WallPlanPoint = [3.0, 0.2]
    const result = snapPointTo45Degrees(start, cursor)
    const origDist = Math.sqrt(3.0 * 3.0 + 0.2 * 0.2)
    const snappedDist = Math.sqrt(result[0] ** 2 + result[1] ** 2)
    // Distance should be within 0.5 grid step of original
    expect(Math.abs(snappedDist - origDist)).toBeLessThan(WALL_GRID_STEP)
  })

  it('works with non-origin start point', () => {
    const s: WallPlanPoint = [2, 3]
    const cursor: WallPlanPoint = [4, 5] // dx=2, dz=2 → 45°
    const result = snapPointTo45Degrees(s, cursor)
    // At 45° from [2,3], X and Z offsets from start should be equal
    expect(result[0] - s[0]).toBeCloseTo(result[1] - s[1], 1)
  })

  it('snaps 135° movement correctly', () => {
    // cursor to upper-left → angle ≈ 135°, nearest 45° multiple = 3*PI/4
    const result = snapPointTo45Degrees(start, [-1.0, 1.0])
    expect(result[0]).toBeCloseTo(-result[1], 1)
  })

  it('snaps 180° movement (leftward)', () => {
    const result = snapPointTo45Degrees(start, [-2.0, 0.05])
    // Should snap to pure horizontal (Z ≈ 0)
    expect(result[1]).toBeCloseTo(0, 1)
    expect(result[0]).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// findWallSnapTarget
// ---------------------------------------------------------------------------

describe('findWallSnapTarget', () => {
  const wall1 = makeWall('wall:1', [0, 0], [4, 0])
  const wall2 = makeWall('wall:2', [0, 0], [0, 4])

  it('returns null when there are no walls', () => {
    const result = findWallSnapTarget([1, 1], [])
    expect(result).toBeNull()
  })

  it('returns null when point is far from all walls', () => {
    const result = findWallSnapTarget([10, 10], [wall1, wall2])
    expect(result).toBeNull()
  })

  it('snaps to wall start endpoint when query is near it and off the wall line', () => {
    // wall1.start = [0,0], query point [-0.1, 0.1] — off wall line, within 0.35 radius of start
    // distSq to start = 0.01+0.01=0.02; projection t<0 so no projection candidate
    const result = findWallSnapTarget([-0.1, 0.1], [wall1])
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(0, 10)
    expect(result![1]).toBeCloseTo(0, 10)
  })

  it('snaps to wall end endpoint when query is near it and off the wall line', () => {
    // wall1.end = [4,0], query [4.1, 0.1] — off wall line, within 0.35 radius of end
    // projection t>1 so no projection candidate
    const result = findWallSnapTarget([4.1, 0.1], [wall1])
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(4, 10)
    expect(result![1]).toBeCloseTo(0, 10)
  })

  it('snaps to projection point on wall interior', () => {
    // wall1 runs along X axis from 0 to 4
    // Query [2, 0.2] — within 0.35 of wall line at y=0
    // Projection = [2, 0] (distSq=0.04); endpoints far away
    const result = findWallSnapTarget([2, 0.2], [wall1])
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(2, 5)
    expect(result![1]).toBeCloseTo(0, 5)
  })

  it('returns null when point is just beyond snap radius', () => {
    // radius = 0.35, point [2, 0.4] — perpendicular dist=0.4 > 0.35
    const result = findWallSnapTarget([2, 0.4], [wall1])
    expect(result).toBeNull()
  })

  it('ignores walls listed in ignoreWallIds', () => {
    const result = findWallSnapTarget([0.1, 0.0], [wall1, wall2], {
      ignoreWallIds: ['wall:1'],
    })
    // wall1 is ignored; wall2 goes from [0,0] to [0,4] — start [0,0] is also within radius
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(0, 10)
    expect(result![1]).toBeCloseTo(0, 10)
  })

  it('ignores all walls when all IDs are in ignoreWallIds', () => {
    const result = findWallSnapTarget([0.1, 0.0], [wall1, wall2], {
      ignoreWallIds: ['wall:1', 'wall:2'],
    })
    expect(result).toBeNull()
  })

  it('picks the closest candidate when multiple endpoints are near', () => {
    // wallA.start = [0,0], wallB.start = [0.3, 0]
    // Query [-0.05, 0.05] — off wall lines; distSq to wallA.start ≈ 0.005, distSq to wallB.start ≈ 0.125
    const wallA = makeWall('wall:A', [0, 0], [4, 0])
    const wallB = makeWall('wall:B', [0.3, 0], [4, 0])
    const result = findWallSnapTarget([-0.05, 0.05], [wallA, wallB])
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(0, 10) // wallA.start is the closest candidate
    expect(result![1]).toBeCloseTo(0, 10)
  })

  it('respects custom snap radius — query on wall line but far from endpoints stays as projection', () => {
    // With radius=0.1 and query [2, 0.05] — projection [2,0] distSq=0.0025 < 0.01 (radius^2)
    // So it still snaps to the projection
    const result = findWallSnapTarget([2, 0.05], [wall1], { radius: 0.1 })
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(2, 5)
    expect(result![1]).toBeCloseTo(0, 5)
  })

  it('custom radius=0.1: query perpendicular distance beyond radius returns null', () => {
    // Query [2, 0.15] — perpendicular dist to wall=0.15 > radius=0.1
    const result = findWallSnapTarget([2, 0.15], [wall1], { radius: 0.1 })
    expect(result).toBeNull()
  })

  it('uses larger custom radius to capture further points', () => {
    const result = findWallSnapTarget([0.5, 0], [wall1], { radius: 1.0 })
    // Both start [0,0] and projection [0.5,0] are within radius=1.0
    // Projection at [0.5,0] dist=0, endpoint [0,0] dist=0.5
    // Should snap to something within radius
    expect(result).not.toBeNull()
  })

  it('does not snap to projection at t=0 or t=1 (endpoint range excluded)', () => {
    // For wall1 [0,0]→[4,0], projection at t=0 would be start; t=1 would be end
    // The projection function returns null for t<=0 or t>=1
    // Query at exact start position — should snap to start endpoint, not projection
    const result = findWallSnapTarget([0, 0], [wall1])
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(0, 10)
    expect(result![1]).toBeCloseTo(0, 10)
  })
})

// ---------------------------------------------------------------------------
// snapWallDraftPoint
// ---------------------------------------------------------------------------

describe('snapWallDraftPoint', () => {
  const walls = [makeWall('wall:1', [0, 0], [4, 0])]

  it('snaps to grid when no special conditions apply', () => {
    const result = snapWallDraftPoint({
      point: [1.3, 0.6],
      walls: [],
    })
    // No walls nearby and no angleSnap → grid snap: [1.5, 0.5]
    expect(result).toEqual([1.5, 0.5])
  })

  it('uses wall snap target when point is near a wall endpoint', () => {
    const result = snapWallDraftPoint({
      point: [0.1, 0.0],
      walls,
    })
    // grid snap of [0.1, 0.0] = [0, 0]; then findWallSnapTarget [0,0] → snaps to wall start
    expect(result[0]).toBeCloseTo(0, 10)
    expect(result[1]).toBeCloseTo(0, 10)
  })

  it('applies angle snap when angleSnap=true and start is provided', () => {
    const start: WallPlanPoint = [0, 0]
    const result = snapWallDraftPoint({
      point: [2.1, 0.15], // near-horizontal
      walls: [],
      start,
      angleSnap: true,
    })
    // snapPointTo45Degrees would lock to horizontal (0°) → Z near 0
    expect(result[1]).toBeCloseTo(0, 1)
  })

  it('falls back to grid snap when angleSnap=false (default)', () => {
    const start: WallPlanPoint = [0, 0]
    const result = snapWallDraftPoint({
      point: [1.3, 0.6],
      walls: [],
      start,
      angleSnap: false,
    })
    expect(result).toEqual([1.5, 0.5])
  })

  it('skips angle snap when start is not provided even if angleSnap=true', () => {
    // Without start, the basePoint uses grid snap
    const result = snapWallDraftPoint({
      point: [1.3, 0.6],
      walls: [],
      angleSnap: true,
    })
    expect(result).toEqual([1.5, 0.5])
  })

  it('respects ignoreWallIds when checking snap targets', () => {
    // wall:1 has end at [4,0]; query near [4.1, 0]
    // Without ignoring: should snap to wall end
    const resultWithSnap = snapWallDraftPoint({
      point: [4.1, 0.0],
      walls,
    })
    expect(resultWithSnap[0]).toBeCloseTo(4, 10)

    // With ignoring wall:1: no snap target, falls back to grid
    const resultIgnored = snapWallDraftPoint({
      point: [4.1, 0.0],
      walls,
      ignoreWallIds: ['wall:1'],
    })
    expect(resultIgnored).toEqual([4.0, 0.0])
  })
})

// ---------------------------------------------------------------------------
// isWallLongEnough
// ---------------------------------------------------------------------------

describe('isWallLongEnough', () => {
  it('returns true for a wall longer than minimum length (0.5)', () => {
    expect(isWallLongEnough([0, 0], [1, 0])).toBe(true)
    expect(isWallLongEnough([0, 0], [0, 2])).toBe(true)
    expect(isWallLongEnough([0, 0], [3, 4])).toBe(true) // length=5
  })

  it('returns true for wall exactly at minimum length (0.5)', () => {
    // distanceSquared([0,0],[0.5,0]) = 0.25 = 0.5*0.5 ✓
    expect(isWallLongEnough([0, 0], [0.5, 0])).toBe(true)
  })

  it('returns false for a wall shorter than minimum length', () => {
    expect(isWallLongEnough([0, 0], [0.3, 0])).toBe(false)
    expect(isWallLongEnough([0, 0], [0, 0.4])).toBe(false)
  })

  it('returns false for zero-length wall (start equals end)', () => {
    expect(isWallLongEnough([1, 1], [1, 1])).toBe(false)
  })

  it('returns false for near-zero diagonal wall', () => {
    // sqrt(0.1^2 + 0.1^2) ≈ 0.141 < 0.5
    expect(isWallLongEnough([0, 0], [0.1, 0.1])).toBe(false)
  })

  it('handles walls with negative coordinates', () => {
    expect(isWallLongEnough([-2, -3], [-1, -3])).toBe(true) // length=1
    expect(isWallLongEnough([-0.1, 0], [0.1, 0])).toBe(false) // length=0.2
  })

  it('returns true for long diagonal wall', () => {
    // start=[1,1], end=[4,5] → dist=sqrt(9+16)=5
    expect(isWallLongEnough([1, 1], [4, 5])).toBe(true)
  })
})
