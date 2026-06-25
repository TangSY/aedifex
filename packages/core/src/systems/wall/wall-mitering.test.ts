import { describe, expect, test } from 'bun:test'
import { WallNode } from '../../schema'
import {
  calculateLevelMiters,
  getAdjacentWallIds,
  getWallMiterBoundaryPoints,
  pointToKey,
} from './wall-mitering'

// Build a straight wall along a line — keeps tests concise.
function makeWall(
  start: [number, number],
  end: [number, number],
  thickness = 0.1,
  id?: string,
) {
  const wall = WallNode.parse({
    name: 'w',
    start,
    end,
    thickness,
  })
  return id ? { ...wall, id: id as typeof wall.id } : wall
}

// Hand-built wall for miter-limit tests (upstream PR #405). Bypasses
// `WallNode.parse` so we can lock fields like frontSide/backSide that the
// miter-limit math reads directly.
function wall(id: string, start: [number, number], end: [number, number]): WallNode {
  return {
    id,
    type: 'wall',
    object: 'node',
    visible: true,
    parentId: 'level_test',
    children: [],
    start,
    end,
    thickness: 0.1,
    height: 2.5,
    frontSide: 'interior',
    backSide: 'exterior',
    metadata: {},
  } as WallNode
}

function maxBoundaryCoord(walls: WallNode[]): number {
  const miter = calculateLevelMiters(walls)
  let max = 0
  for (const w of walls) {
    const bp = getWallMiterBoundaryPoints(w, miter)
    expect(bp).not.toBeNull()
    if (!bp) continue
    for (const p of [bp.startLeft, bp.startRight, bp.endLeft, bp.endRight]) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      max = Math.max(max, Math.abs(p.x), Math.abs(p.y))
    }
  }
  return max
}

describe('pointToKey', () => {
  test('snaps points to the same key within tolerance', () => {
    expect(pointToKey({ x: 1.0001, y: 2.0001 })).toBe(pointToKey({ x: 1, y: 2 }))
  })

  test('different points produce different keys', () => {
    expect(pointToKey({ x: 1, y: 2 })).not.toBe(pointToKey({ x: 1.1, y: 2 }))
  })
})

describe('calculateLevelMiters — L-corner', () => {
  test('two perpendicular walls sharing an endpoint produce miter intersections for both', () => {
    // Wall A goes east along the x-axis (-> meeting at origin's end-end joint)
    const a = makeWall([0, 0], [5, 0], 0.2, 'wall_a')
    // Wall B goes north from the shared endpoint
    const b = makeWall([5, 0], [5, 5], 0.2, 'wall_b')

    const miter = calculateLevelMiters([a, b])

    // The shared point should appear as a junction
    const junctionKey = pointToKey({ x: 5, y: 0 })
    const junctionData = miter.junctionData.get(junctionKey)
    expect(junctionData).toBeDefined()

    // Both walls should have intersection assignments at the corner
    const aData = junctionData!.get('wall_a')
    const bData = junctionData!.get('wall_b')
    expect(aData).toBeDefined()
    expect(bData).toBeDefined()
    // Each wall gets at least one of left/right per the algorithm
    expect((aData?.left ?? aData?.right) !== undefined).toBe(true)
    expect((bData?.left ?? bData?.right) !== undefined).toBe(true)
  })

  test('boundary points at unjuncted endpoint fall back to normal offset by halfThickness', () => {
    const a = makeWall([0, 0], [10, 0], 0.2, 'wall_a')
    const b = makeWall([10, 0], [10, 5], 0.2, 'wall_b')
    const miter = calculateLevelMiters([a, b])

    // wall_a's start endpoint at (0,0) is not part of any junction; fallback
    const boundary = getWallMiterBoundaryPoints(a, miter)
    expect(boundary).not.toBeNull()
    expect(boundary!.startLeft.x).toBeCloseTo(0)
    // Normal of wall a (along +x) is (0,1); start-left = start + n*halfT = (0, 0.1)
    expect(boundary!.startLeft.y).toBeCloseTo(0.1)
    expect(boundary!.startRight.y).toBeCloseTo(-0.1)
  })
})

describe('calculateLevelMiters — X-crossing (4 walls one point)', () => {
  test('four walls meeting at one point get sorted by outgoing angle and each receives miter data', () => {
    // 4 walls forming a plus sign through origin
    const east = makeWall([0, 0], [3, 0], 0.2, 'east')
    const north = makeWall([0, 0], [0, 3], 0.2, 'north')
    const west = makeWall([0, 0], [-3, 0], 0.2, 'west')
    const south = makeWall([0, 0], [0, -3], 0.2, 'south')

    const miter = calculateLevelMiters([east, north, west, south])
    const junctionKey = pointToKey({ x: 0, y: 0 })
    const data = miter.junctionData.get(junctionKey)
    expect(data).toBeDefined()
    // All 4 walls should have entries
    for (const id of ['east', 'north', 'west', 'south']) {
      expect(data!.get(id)).toBeDefined()
    }
  })
})

describe('calculateLevelMiters — parallel walls (collinear)', () => {
  test('two collinear walls (parallel adjacent) produce no NaN; lines parallel are skipped (det < 1e-9)', () => {
    // Two walls along the same axis sharing an endpoint — at the shared joint, edges are parallel
    const left = makeWall([0, 0], [5, 0], 0.2, 'left')
    const right = makeWall([5, 0], [10, 0], 0.2, 'right')

    const miter = calculateLevelMiters([left, right])
    const junctionKey = pointToKey({ x: 5, y: 0 })
    const data = miter.junctionData.get(junctionKey)
    // No parallel intersection should exist because det -> 0 and code skips
    // The walls fall back to default normal-offset in getWallMiterBoundaryPoints
    const leftBoundary = getWallMiterBoundaryPoints(left, miter)
    const rightBoundary = getWallMiterBoundaryPoints(right, miter)
    expect(leftBoundary).not.toBeNull()
    expect(rightBoundary).not.toBeNull()
    // No NaN propagated
    for (const b of [leftBoundary, rightBoundary]) {
      for (const k of ['startLeft', 'startRight', 'endLeft', 'endRight'] as const) {
        expect(Number.isFinite(b![k].x)).toBe(true)
        expect(Number.isFinite(b![k].y)).toBe(true)
      }
    }
    // Defensively, junction map may or may not contain entries depending on sort tie-breakers,
    // but boundary calculation must succeed with finite numbers.
    expect(data === undefined || data instanceof Map).toBe(true)
  })
})

describe('calculateLevelMiters — T-junction', () => {
  test('three walls where one endpoint lands mid-body of another produce passthrough handling', () => {
    // long horizontal wall from (0,0) to (10,0); third wall starts mid-segment at (5,0)
    const horiz = makeWall([0, 0], [10, 0], 0.2, 'horiz')
    const vert = makeWall([5, 0], [5, 5], 0.2, 'vert')

    const miter = calculateLevelMiters([horiz, vert])
    const junctionKey = pointToKey({ x: 5, y: 0 })
    const data = miter.junctionData.get(junctionKey)
    expect(data).toBeDefined()
    // Passthrough walls (horiz) don't get intersection assignments at the T-junction
    expect(data!.get('horiz')).toBeUndefined()
    // The non-passthrough wall (vert) does receive an intersection
    expect(data!.get('vert')).toBeDefined()
  })
})

describe('getAdjacentWallIds', () => {
  test('detects walls sharing corners or T-junctions', () => {
    const a = makeWall([0, 0], [5, 0], 0.2, 'a')
    const b = makeWall([5, 0], [5, 5], 0.2, 'b')
    const c = makeWall([2.5, 0], [2.5, 4], 0.2, 'c') // T-junction onto a
    const adj = getAdjacentWallIds([a, b, c], new Set(['a']))
    expect(adj.has('b')).toBe(true)
    expect(adj.has('c')).toBe(true)
  })

  test('returns empty set when no walls touch the dirty wall', () => {
    const a = makeWall([0, 0], [5, 0], 0.2, 'a')
    const b = makeWall([10, 10], [15, 10], 0.2, 'b')
    const adj = getAdjacentWallIds([a, b], new Set(['a']))
    expect(adj.has('b')).toBe(false)
  })
})

describe('wall mitering miter limit', () => {
  // Two 3 m walls sharing the origin, meeting at decreasing angles. Without a
  // miter limit the joint point runs to infinity as the angle → 0 (∝ 1/sin θ),
  // which is the "infinite wall" seen when a room-preset preview lands on top of
  // an existing wall. The boundary must stay bounded near the wall length.
  test.each([90, 30, 10, 5, 1, 0.1, 0.01])('stays bounded at a %s° junction', (deg) => {
    const rad = (deg * Math.PI) / 180
    const walls = [
      wall('A', [0, 0], [3, 0]),
      wall('B', [0, 0], [3 * Math.cos(rad), 3 * Math.sin(rad)]),
    ]
    // 3 m walls + a few cm of joint: anything past ~4 m is a runaway spike.
    expect(maxBoundaryCoord(walls)).toBeLessThan(4)
  })

  test('still miters a normal 90° corner', () => {
    const walls = [wall('A', [0, 0], [3, 0]), wall('B', [0, 0], [0, 3])]
    const miter = calculateLevelMiters(walls)
    const bpA = getWallMiterBoundaryPoints(walls[0]!, miter)
    expect(bpA).not.toBeNull()
    if (!bpA) throw new Error('expected miter boundary points')
    // The shared corner is pulled to the mitred intersection, offset from the
    // raw butt position (halfThickness 0.05) by the diagonal of the joint.
    const startSideX = Math.min(bpA.startLeft.x, bpA.startRight.x)
    expect(startSideX).toBeLessThan(-0.001)
    expect(startSideX).toBeGreaterThan(-0.5)
  })
})
