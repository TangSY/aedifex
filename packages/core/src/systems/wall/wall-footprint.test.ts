import { describe, expect, test } from 'bun:test'
import { WallNode } from '../../schema'
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  getWallPlanFootprint,
  getWallThickness,
} from './wall-footprint'
import { calculateLevelMiters } from './wall-mitering'

function makeWall(
  start: [number, number],
  end: [number, number],
  thickness?: number,
  curveOffset?: number,
  id?: string,
) {
  const base = WallNode.parse({
    name: 'w',
    start,
    end,
    ...(thickness !== undefined && { thickness }),
    ...(curveOffset !== undefined && { curveOffset }),
  })
  return id ? { ...base, id: id as typeof base.id } : base
}

describe('constants', () => {
  test('DEFAULT_WALL_THICKNESS and DEFAULT_WALL_HEIGHT are sensible', () => {
    expect(DEFAULT_WALL_THICKNESS).toBe(0.1)
    expect(DEFAULT_WALL_HEIGHT).toBe(2.5)
  })
})

describe('getWallThickness', () => {
  test('returns explicit thickness when set', () => {
    const w = makeWall([0, 0], [3, 0], 0.25)
    expect(getWallThickness(w)).toBe(0.25)
  })

  test('returns default when thickness is undefined', () => {
    const w = makeWall([0, 0], [3, 0])
    expect(getWallThickness(w)).toBe(DEFAULT_WALL_THICKNESS)
  })
})

describe('getWallPlanFootprint — straight wall (no junctions)', () => {
  test('isolated straight wall produces a 4-point rectangle around the centerline', () => {
    const w = makeWall([0, 0], [10, 0], 0.2)
    const miter = calculateLevelMiters([w])
    const polygon = getWallPlanFootprint(w, miter)
    // No junctions => exactly 4 points (right→endRight→endLeft→startLeft)
    expect(polygon).toHaveLength(4)
    // All coordinates finite
    for (const point of polygon) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
    // Wall along +x with thickness 0.2 — vertices should have y = ±0.1
    const ys = polygon.map((p) => p.y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(-0.1)
    expect(ys[ys.length - 1]!).toBeCloseTo(0.1)
  })

  test('zero-length wall returns empty polygon', () => {
    const w = makeWall([5, 5], [5, 5], 0.2)
    const miter = calculateLevelMiters([w])
    expect(getWallPlanFootprint(w, miter)).toEqual([])
  })
})

describe('getWallPlanFootprint — junctioned wall', () => {
  test('L-corner wall footprint includes the junction corner point and miter intersection', () => {
    const a = makeWall([0, 0], [10, 0], 0.2, undefined, 'a')
    const b = makeWall([10, 0], [10, 5], 0.2, undefined, 'b')
    const miter = calculateLevelMiters([a, b])
    const polygon = getWallPlanFootprint(a, miter)
    // At the end with the junction, the polygon should include wall.end (10,0)
    const hasEndPoint = polygon.some((p) => Math.abs(p.x - 10) < 0.01 && Math.abs(p.y) < 0.01)
    expect(hasEndPoint).toBe(true)
    // 5 points (no startJunction, has endJunction)
    expect(polygon).toHaveLength(5)
  })
})

describe('getWallPlanFootprint — curved wall', () => {
  test('curved wall returns a sampled polygon with >> 4 vertices', () => {
    const curved = makeWall([0, 0], [10, 0], 0.2, 1)
    const miter = calculateLevelMiters([curved])
    const polygon = getWallPlanFootprint(curved, miter)
    // CURVED_WALL_SURFACE_SEGMENTS = 24 => polygon has ~2*(24+1)=50 points
    expect(polygon.length).toBeGreaterThan(20)
    // No NaN
    for (const point of polygon) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })
})
