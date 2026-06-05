import { describe, expect, test } from 'bun:test'
import {
  getClampedWallCurveOffset,
  getMaxWallCurveOffset,
  getWallChordFrame,
  getWallChordLength,
  getWallCurveFrameAt,
  getWallCurveLength,
  getWallMidpointHandlePoint,
  getWallStraightSnapOffset,
  getWallSurfacePolygon,
  isCurvedWall,
  normalizeWallCurveOffset,
  sampleWallCenterline,
} from './wall-curve'

const straightWall = {
  start: [0, 0] as [number, number],
  end: [10, 0] as [number, number],
  curveOffset: 0,
}

const curvedWall = {
  start: [0, 0] as [number, number],
  end: [10, 0] as [number, number],
  curveOffset: 1,
}

describe('getWallChordLength / getWallChordFrame', () => {
  test('chord length matches Euclidean distance', () => {
    expect(getWallChordLength(straightWall)).toBeCloseTo(10)
    expect(getWallChordLength({ ...straightWall, end: [3, 4] })).toBeCloseTo(5)
  })

  test('chord frame midpoint, tangent, normal for axis-aligned wall', () => {
    const frame = getWallChordFrame(straightWall)
    expect(frame.midpoint.x).toBeCloseTo(5)
    expect(frame.midpoint.y).toBeCloseTo(0)
    expect(frame.tangent.x).toBeCloseTo(1)
    expect(frame.tangent.y).toBeCloseTo(0)
    // Normal: (-dy, dx)/L = (0,1)
    expect(frame.normal.x).toBeCloseTo(0)
    expect(frame.normal.y).toBeCloseTo(1)
    expect(frame.length).toBeCloseTo(10)
  })

  test('degenerate zero-length wall returns default tangent (1,0) and normal (0,1)', () => {
    const frame = getWallChordFrame({
      start: [3, 3],
      end: [3, 3],
      curveOffset: 0,
    })
    expect(frame.length).toBe(0)
    expect(frame.tangent).toEqual({ x: 1, y: 0 })
    expect(frame.normal).toEqual({ x: 0, y: 1 })
  })
})

describe('normalizeWallCurveOffset & isCurvedWall', () => {
  test('sagitta = 0 returns 0 (straight)', () => {
    expect(normalizeWallCurveOffset(straightWall, 0)).toBe(0)
    expect(isCurvedWall(straightWall)).toBe(false)
  })

  test('sagitta above snap threshold remains non-zero', () => {
    const snap = getWallStraightSnapOffset(curvedWall)
    expect(normalizeWallCurveOffset(curvedWall, snap * 2)).toBeGreaterThan(0)
    expect(isCurvedWall(curvedWall)).toBe(true)
  })

  test('sagitta below snap threshold is snapped to 0', () => {
    const snap = getWallStraightSnapOffset(curvedWall)
    expect(normalizeWallCurveOffset(curvedWall, snap / 2)).toBe(0)
  })

  test('extreme sagitta is clamped to max = chordLength/2', () => {
    const max = getMaxWallCurveOffset(curvedWall)
    const huge = max * 5
    expect(normalizeWallCurveOffset(curvedWall, huge)).toBeCloseTo(max)
    expect(normalizeWallCurveOffset(curvedWall, -huge)).toBeCloseTo(-max)
  })

  test('returns 0 when chord length is < epsilon (no max offset)', () => {
    const deg = { start: [0, 0] as [number, number], end: [0, 0] as [number, number], curveOffset: 5 }
    expect(normalizeWallCurveOffset(deg, 5)).toBe(0)
    expect(getClampedWallCurveOffset(deg)).toBe(0)
  })
})

describe('getWallCurveFrameAt — straight wall', () => {
  test('returns linear interpolation between endpoints when sagitta = 0', () => {
    const frameMid = getWallCurveFrameAt(straightWall, 0.5)
    expect(frameMid.point.x).toBeCloseTo(5)
    expect(frameMid.point.y).toBeCloseTo(0)
    const frameStart = getWallCurveFrameAt(straightWall, 0)
    expect(frameStart.point.x).toBeCloseTo(0)
    expect(frameStart.point.y).toBeCloseTo(0)
    const frameEnd = getWallCurveFrameAt(straightWall, 1)
    expect(frameEnd.point.x).toBeCloseTo(10)
    expect(frameEnd.point.y).toBeCloseTo(0)
  })

  test('clamps t to [0,1] for out-of-range inputs', () => {
    const before = getWallCurveFrameAt(straightWall, -1)
    expect(before.point.x).toBeCloseTo(0)
    const after = getWallCurveFrameAt(straightWall, 2)
    expect(after.point.x).toBeCloseTo(10)
  })
})

describe('getWallCurveFrameAt — curved wall (sagitta > 0)', () => {
  test('midpoint of curve offsets from chord midpoint by |sagitta| along normal direction', () => {
    // Chord length 10, sagitta 1. The arc midpoint is at chord_mid offset by |sagitta|
    // along the normal axis. The sign convention of the offset is determined by the
    // arc construction (center is placed on the positive normal side when sagitta > 0,
    // so the arc midpoint ends up on the negative normal side from the chord midpoint).
    const sagitta = 1
    const wall = { start: [0, 0] as [number, number], end: [10, 0] as [number, number], curveOffset: sagitta }
    const mid = getWallMidpointHandlePoint(wall)
    expect(mid.x).toBeCloseTo(5, 5)
    expect(Math.abs(mid.y)).toBeCloseTo(sagitta, 5)
  })

  test('sagitta=0 (straight) returns midpoint at chord midpoint', () => {
    const mid = getWallMidpointHandlePoint(straightWall)
    expect(mid.x).toBeCloseTo(5)
    expect(mid.y).toBeCloseTo(0)
  })

  test('negative sagitta flips midpoint to the other side relative to positive sagitta', () => {
    const pos = getWallMidpointHandlePoint({
      start: [0, 0],
      end: [10, 0],
      curveOffset: 1,
    })
    const neg = getWallMidpointHandlePoint({
      start: [0, 0],
      end: [10, 0],
      curveOffset: -1,
    })
    // Magnitude equal, sign opposite
    expect(Math.abs(neg.y)).toBeCloseTo(Math.abs(pos.y), 5)
    expect(Math.sign(neg.y)).toBe(-Math.sign(pos.y))
  })
})

describe('sampleWallCenterline & getWallCurveLength', () => {
  test('straight wall centerline has segments+1 evenly spaced points', () => {
    const samples = sampleWallCenterline(straightWall, 5)
    expect(samples).toHaveLength(6)
    expect(samples[0]!.x).toBeCloseTo(0)
    expect(samples[samples.length - 1]!.x).toBeCloseTo(10)
  })

  test('straight wall length matches chord length', () => {
    expect(getWallCurveLength(straightWall, 16)).toBeCloseTo(10)
  })

  test('curved wall length > chord length', () => {
    const len = getWallCurveLength(curvedWall, 64)
    expect(len).toBeGreaterThan(getWallChordLength(curvedWall))
  })
})

describe('getWallSurfacePolygon', () => {
  test('straight wall produces 2*(segments+1) points', () => {
    const polygon = getWallSurfacePolygon(
      { ...straightWall, thickness: 0.2 },
      4,
    )
    expect(polygon).toHaveLength(10)
  })

  test('miter overrides replace the four corner points', () => {
    const override = {
      startLeft: { x: -1, y: -1 },
      startRight: { x: -2, y: -2 },
      endLeft: { x: 99, y: 99 },
      endRight: { x: 88, y: 88 },
    }
    const polygon = getWallSurfacePolygon({ ...straightWall, thickness: 0.2 }, 4, override)
    // The polygon is [...right, ...left.reverse()]; right[0] is startRight override
    expect(polygon[0]).toEqual(override.startRight)
    // The last element is left[0] (startLeft override)
    expect(polygon[polygon.length - 1]).toEqual(override.startLeft)
  })
})
