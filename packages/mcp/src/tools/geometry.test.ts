import { describe, expect, test } from 'bun:test'
import {
  clamp,
  distance2D,
  pointInPolygon,
  pointOnSegment,
  polygonArea,
  polygonBounds,
  polygonContainsPolygon,
  projectWorldPointToWallLocalX,
  type Vec2,
  wallLength,
  wallLocalXFromT,
} from './geometry'

describe('clamp', () => {
  test('clamps inside [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  test('returns midpoint when max < min (defensive fallback)', () => {
    // Verifies the explicit guard in clamp().
    expect(clamp(7, 10, 0)).toBe(5)
    expect(clamp(0, 4, -2)).toBe(1)
  })

  test('passes through when value sits exactly on a bound', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('distance2D / wallLength', () => {
  test('distance2D computes euclidean distance', () => {
    expect(distance2D([0, 0], [3, 4])).toBe(5)
  })

  test('wallLength reuses distance2D over start/end', () => {
    expect(wallLength({ start: [0, 0], end: [3, 4] })).toBe(5)
    expect(wallLength({ start: [1, 1], end: [1, 1] })).toBe(0)
  })
})

describe('wallLocalXFromT', () => {
  test('places at t=0.5 → middle of wall, but clamped to keep width inside', () => {
    expect(wallLocalXFromT({ start: [0, 0], end: [10, 0] }, 0.5, 1)).toBe(5)
  })

  test('clamps when t pushes opening past the end of the wall', () => {
    // length=10, width=2 → max localX = 9.
    expect(wallLocalXFromT({ start: [0, 0], end: [10, 0] }, 1.5, 2)).toBe(9)
  })

  test('clamps when t is negative (start side)', () => {
    expect(wallLocalXFromT({ start: [0, 0], end: [10, 0] }, -1, 2)).toBe(1)
  })
})

describe('projectWorldPointToWallLocalX', () => {
  test('returns 0 for zero-length wall (guards divide-by-zero)', () => {
    expect(projectWorldPointToWallLocalX({ start: [1, 1], end: [1, 1] }, [5, 0, 7])).toBe(0)
  })

  test('projects + clamps to [0, length]', () => {
    // axis-aligned wall along x from 0..10 at z=0.
    expect(projectWorldPointToWallLocalX({ start: [0, 0], end: [10, 0] }, [3, 0, 0])).toBe(3)
    // point beyond end gets clamped.
    expect(projectWorldPointToWallLocalX({ start: [0, 0], end: [10, 0] }, [50, 0, 0])).toBe(10)
    expect(projectWorldPointToWallLocalX({ start: [0, 0], end: [10, 0] }, [-5, 0, 0])).toBe(0)
  })
})

describe('polygonArea', () => {
  test('returns 0 for degenerate polygons (<3 points)', () => {
    expect(polygonArea([])).toBe(0)
    expect(polygonArea([[0, 0]])).toBe(0)
    expect(
      polygonArea([
        [0, 0],
        [1, 0],
      ]),
    ).toBe(0)
  })

  test('shoelace area for a 3x4 rect = 12', () => {
    expect(
      polygonArea([
        [0, 0],
        [3, 0],
        [3, 4],
        [0, 4],
      ]),
    ).toBe(12)
  })

  test('CCW and CW windings produce the same magnitude', () => {
    const ccw: Vec2[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]
    const cw = [...ccw].reverse() as Vec2[]
    expect(polygonArea(ccw)).toBe(polygonArea(cw))
  })
})

describe('polygonBounds', () => {
  test('returns min/max/center/width/depth for a rectangle', () => {
    const b = polygonBounds([
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ])
    expect(b.minX).toBe(0)
    expect(b.maxX).toBe(4)
    expect(b.minZ).toBe(0)
    expect(b.maxZ).toBe(2)
    expect(b.width).toBe(4)
    expect(b.depth).toBe(2)
    expect(b.centerX).toBe(2)
    expect(b.centerZ).toBe(1)
  })
})

describe('pointInPolygon / polygonContainsPolygon', () => {
  const square: Vec2[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ]

  test('interior point is inside', () => {
    expect(pointInPolygon([2, 2], square)).toBe(true)
  })

  test('exterior point is outside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(false)
  })

  test('boundary point: respects includeBoundary flag', () => {
    expect(pointInPolygon([0, 2], square, true)).toBe(true)
    expect(pointInPolygon([0, 2], square, false)).toBe(false)
  })

  test('polygonContainsPolygon: inner inside outer', () => {
    const inner: Vec2[] = [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
    ]
    expect(polygonContainsPolygon(square, inner)).toBe(true)
  })

  test('polygonContainsPolygon: poking out → false', () => {
    const inner: Vec2[] = [
      [1, 1],
      [5, 1],
      [5, 3],
      [1, 3],
    ]
    expect(polygonContainsPolygon(square, inner)).toBe(false)
  })
})

describe('pointOnSegment', () => {
  test('point on segment endpoints + midpoint', () => {
    expect(pointOnSegment([0, 0], [0, 0], [4, 0])).toBe(true)
    expect(pointOnSegment([2, 0], [0, 0], [4, 0])).toBe(true)
    expect(pointOnSegment([4, 0], [0, 0], [4, 0])).toBe(true)
  })

  test('point off segment line returns false', () => {
    expect(pointOnSegment([2, 1], [0, 0], [4, 0])).toBe(false)
  })

  test('point on segment line but past endpoint returns false', () => {
    expect(pointOnSegment([5, 0], [0, 0], [4, 0])).toBe(false)
    expect(pointOnSegment([-1, 0], [0, 0], [4, 0])).toBe(false)
  })
})
