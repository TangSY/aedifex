import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WALL_THICKNESS,
  DEFAULT_WALL_HEIGHT,
  getWallThickness,
  getWallPlanFootprint,
} from '../systems/wall/wall-footprint'
import type { WallMiterData, Point2D } from '../systems/wall/wall-mitering'
import type { WallNode } from '../schema'

// ============================================================================
// Helpers
// ============================================================================

function makeWall(
  overrides: Partial<{
    id: string
    start: [number, number]
    end: [number, number]
    thickness: number
  }> = {},
): WallNode {
  return {
    object: 'node',
    id: overrides.id ?? 'wall_test',
    type: 'wall',
    parentId: null,
    visible: true,
    metadata: {},
    children: [],
    start: overrides.start ?? [0, 0],
    end: overrides.end ?? [1, 0],
    frontSide: 'unknown',
    backSide: 'unknown',
    ...(overrides.thickness !== undefined ? { thickness: overrides.thickness } : {}),
  } as WallNode
}

/** Build an empty WallMiterData with no junctions */
function emptyMiterData(): WallMiterData {
  return {
    junctionData: new Map(),
    junctions: new Map(),
  }
}

/**
 * Build a WallMiterData where the start and/or end junction of `wallId`
 * has provided left/right intersection points.
 */
function miterDataWithJunctions(
  wallNode: WallNode,
  opts: {
    start?: { left?: Point2D; right?: Point2D }
    end?: { left?: Point2D; right?: Point2D }
  },
): WallMiterData {
  const junctionData: WallMiterData['junctionData'] = new Map()

  const snapFactor = 1 / 0.001 // matches TOLERANCE=0.001 in wall-mitering

  function pointKey(p: [number, number]): string {
    return `${Math.round(p[0] * snapFactor)},${Math.round(p[1] * snapFactor)}`
  }

  if (opts.start) {
    const key = pointKey(wallNode.start as [number, number])
    const wallMap = new Map<string, { left?: Point2D; right?: Point2D }>()
    wallMap.set(wallNode.id, opts.start)
    junctionData.set(key, wallMap)
  }

  if (opts.end) {
    const key = pointKey(wallNode.end as [number, number])
    const wallMap = new Map<string, { left?: Point2D; right?: Point2D }>()
    wallMap.set(wallNode.id, opts.end)
    junctionData.set(key, wallMap)
  }

  return { junctionData, junctions: new Map() }
}

// ============================================================================
// Constants
// ============================================================================

describe('wall-footprint constants', () => {
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
  it('returns the thickness set on the wall node', () => {
    const wall = makeWall({ thickness: 0.3 })
    expect(getWallThickness(wall)).toBe(0.3)
  })

  it('returns DEFAULT_WALL_THICKNESS when thickness is not set', () => {
    const wall = makeWall()
    expect(getWallThickness(wall)).toBe(DEFAULT_WALL_THICKNESS)
  })

  it('returns zero when thickness is explicitly 0', () => {
    const wall = makeWall({ thickness: 0 })
    expect(getWallThickness(wall)).toBe(0)
  })
})

// ============================================================================
// getWallPlanFootprint
// ============================================================================

describe('getWallPlanFootprint', () => {
  describe('simple horizontal wall (no junctions)', () => {
    it('returns a polygon with 4 points for a wall with no junction data', () => {
      // Wall from (0,0) to (2,0), thickness 0.1
      const wall = makeWall({ start: [0, 0], end: [2, 0], thickness: 0.1 })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())

      expect(polygon).toHaveLength(4)
    })

    it('polygon points are symmetrically offset from wall axis (perpendicular)', () => {
      // Horizontal wall along X-axis: normal is along Y-axis
      const thickness = 0.2
      const halfT = thickness / 2
      const wall = makeWall({ start: [0, 0], end: [4, 0], thickness })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())

      // All Y values should be either +halfT or -halfT
      const yValues = polygon.map((p) => p.y)
      expect(yValues.every((y) => Math.abs(Math.abs(y) - halfT) < 1e-9)).toBe(true)
    })

    it('polygon X values span from wall start to wall end', () => {
      const wall = makeWall({ start: [0, 0], end: [3, 0], thickness: 0.1 })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())

      const xValues = polygon.map((p) => p.x)
      expect(Math.min(...xValues)).toBeCloseTo(0)
      expect(Math.max(...xValues)).toBeCloseTo(3)
    })
  })

  describe('vertical wall (no junctions)', () => {
    it('returns 4 points for a vertical wall', () => {
      const wall = makeWall({ start: [0, 0], end: [0, 5], thickness: 0.1 })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())
      expect(polygon).toHaveLength(4)
    })

    it('polygon is offset perpendicular to the wall direction', () => {
      // Vertical wall along Y-axis: normal is along -X/+X axis
      const thickness = 0.2
      const halfT = thickness / 2
      const wall = makeWall({ start: [0, 0], end: [0, 4], thickness })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())

      const xValues = polygon.map((p) => p.x)
      expect(xValues.every((x) => Math.abs(Math.abs(x) - halfT) < 1e-9)).toBe(true)
    })
  })

  describe('zero-length wall', () => {
    it('returns empty array for a wall where start equals end', () => {
      const wall = makeWall({ start: [1, 1], end: [1, 1] })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())
      expect(polygon).toHaveLength(0)
    })

    it('returns empty array for a wall with near-zero length below epsilon', () => {
      const wall = makeWall({ start: [0, 0], end: [1e-10, 0] })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())
      expect(polygon).toHaveLength(0)
    })
  })

  describe('wall with junction data', () => {
    it('returns 5 points when only the start has a junction', () => {
      const wall = makeWall({ id: 'wall_test', start: [0, 0], end: [2, 0], thickness: 0.1 })
      const miter = miterDataWithJunctions(wall, {
        start: {
          left: { x: -0.05, y: 0.05 },
          right: { x: 0.05, y: -0.05 },
        },
      })

      const polygon = getWallPlanFootprint(wall, miter)
      // 4 base points + 1 for start junction = 5
      expect(polygon).toHaveLength(5)
    })

    it('returns 5 points when only the end has a junction', () => {
      const wall = makeWall({ id: 'wall_test', start: [0, 0], end: [2, 0], thickness: 0.1 })
      const miter = miterDataWithJunctions(wall, {
        end: {
          left: { x: 2.05, y: 0.05 },
          right: { x: 1.95, y: -0.05 },
        },
      })

      const polygon = getWallPlanFootprint(wall, miter)
      // 4 base points + 1 for end junction = 5
      expect(polygon).toHaveLength(5)
    })

    it('returns 6 points when both start and end have junctions', () => {
      const wall = makeWall({ id: 'wall_test', start: [0, 0], end: [2, 0], thickness: 0.1 })
      const miter = miterDataWithJunctions(wall, {
        start: {
          left: { x: -0.05, y: 0.05 },
          right: { x: 0.05, y: -0.05 },
        },
        end: {
          left: { x: 2.05, y: 0.05 },
          right: { x: 1.95, y: -0.05 },
        },
      })

      const polygon = getWallPlanFootprint(wall, miter)
      // 4 base points + 1 for start junction + 1 for end junction = 6
      expect(polygon).toHaveLength(6)
    })

    it('uses junction left/right points instead of default offsets', () => {
      const wall = makeWall({ id: 'wall_test', start: [0, 0], end: [2, 0], thickness: 0.1 })
      const customLeft: Point2D = { x: -0.1, y: 0.2 }
      const customRight: Point2D = { x: 0.1, y: -0.2 }

      const miter = miterDataWithJunctions(wall, {
        start: { left: customLeft, right: customRight },
      })

      const polygon = getWallPlanFootprint(wall, miter)

      // The start-right corner should match the custom right point
      // (polygon starts with pStartRight)
      expect(polygon[0]).toEqual(customRight)
      // pStartLeft should be the custom left point (last point before closing or near end)
      const hasCustomLeft = polygon.some((p) => p.x === customLeft.x && p.y === customLeft.y)
      expect(hasCustomLeft).toBe(true)
    })
  })

  describe('diagonal wall', () => {
    it('returns 4 points for a diagonal wall', () => {
      const wall = makeWall({ start: [0, 0], end: [3, 4], thickness: 0.1 })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())
      expect(polygon).toHaveLength(4)
    })

    it('polygon points are offset perpendicular to the diagonal direction', () => {
      // Wall direction: (3,4), length=5, normal=(-4/5, 3/5)
      const wall = makeWall({ start: [0, 0], end: [3, 4], thickness: 0.2 })
      const polygon = getWallPlanFootprint(wall, emptyMiterData())
      const halfT = 0.1

      // Normal unit vector to (3,4) direction: n = (-4/5, 3/5)
      const nx = -4 / 5
      const ny = 3 / 5

      // pStartLeft should be start + n * halfT = (nx*halfT, ny*halfT)
      const hasStartLeft = polygon.some(
        (p) =>
          Math.abs(p.x - nx * halfT) < 1e-9 && Math.abs(p.y - ny * halfT) < 1e-9,
      )
      expect(hasStartLeft).toBe(true)
    })
  })
})
