import { describe, expect, it, vi } from 'vitest'

// Mock @aedifex/core before importing the module under test
vi.mock('@aedifex/core', () => ({
  isObject: (val: unknown): val is Record<string, unknown> =>
    val !== null && typeof val === 'object' && !Array.isArray(val),
}))

import {
  snapToGrid,
  snapToHalf,
  calculateCursorRotation,
  calculateItemRotation,
  getSideFromNormal,
  isValidWallSideFace,
  stripTransient,
} from '../placement-math'

// ---------------------------------------------------------------------------
// snapToGrid
// ---------------------------------------------------------------------------

describe('snapToGrid', () => {
  it('snaps to 0.5 grid with no offset for even dimensions (e.g. 2.0)', () => {
    // dimension=2.0 → halfDim=1.0 → (1.0*2)%1 = 0 → |0 - 0.5| = 0.5 ≥ 0.01 → needsOffset=false
    expect(snapToGrid(0.1, 2.0)).toBe(0)
    expect(snapToGrid(0.3, 2.0)).toBe(0.5)
    expect(snapToGrid(1.0, 2.0)).toBe(1.0)
    expect(snapToGrid(1.3, 2.0)).toBe(1.5)
    expect(snapToGrid(2.1, 2.0)).toBe(2.0)
  })

  it('adds 0.25 offset for odd-half dimensions (e.g. 2.5)', () => {
    // dimension=2.5 → halfDim=1.25 → (1.25*2)%1 = 0.5 → |0.5 - 0.5| = 0 < 0.01 → needsOffset=true
    // With offset=0.25: snapToGrid(0.25, 2.5) → round((0.25-0.25)*2)/2 + 0.25 = 0.25
    expect(snapToGrid(0.25, 2.5)).toBe(0.25)
    expect(snapToGrid(0.5, 2.5)).toBe(0.75)
    expect(snapToGrid(1.0, 2.5)).toBe(1.25)
    expect(snapToGrid(1.2, 2.5)).toBe(1.25)
  })

  it('handles dimension=1.0 (no offset)', () => {
    // halfDim=0.5 → (0.5*2)%1 = 0 → needsOffset=false
    expect(snapToGrid(0.0, 1.0)).toBe(0.0)
    expect(snapToGrid(0.3, 1.0)).toBe(0.5)
    expect(snapToGrid(0.7, 1.0)).toBe(0.5)
    expect(snapToGrid(0.9, 1.0)).toBe(1.0)
  })

  it('handles negative positions', () => {
    expect(snapToGrid(-0.1, 2.0)).toBe(0.0)
    expect(snapToGrid(-0.3, 2.0)).toBe(-0.5)
  })
})

// ---------------------------------------------------------------------------
// snapToHalf
// ---------------------------------------------------------------------------

describe('snapToHalf', () => {
  it('snaps to 0.5 increments', () => {
    expect(snapToHalf(0.0)).toBe(0.0)
    expect(snapToHalf(0.3)).toBe(0.5)
    expect(snapToHalf(0.7)).toBe(0.5)
    expect(snapToHalf(0.8)).toBe(1.0)
    expect(snapToHalf(1.2)).toBe(1.0)
    expect(snapToHalf(1.3)).toBe(1.5)
  })

  it('snaps negative values to 0.5 increments', () => {
    expect(snapToHalf(-0.3)).toBe(-0.5)
    expect(snapToHalf(-0.7)).toBe(-0.5)
    expect(snapToHalf(-0.9)).toBe(-1.0)
  })

  it('leaves values already on 0.5 grid unchanged', () => {
    expect(snapToHalf(0.5)).toBe(0.5)
    expect(snapToHalf(1.0)).toBe(1.0)
    expect(snapToHalf(2.5)).toBe(2.5)
  })
})

// ---------------------------------------------------------------------------
// calculateCursorRotation
// ---------------------------------------------------------------------------

describe('calculateCursorRotation', () => {
  it('returns 0 when normal is undefined', () => {
    expect(calculateCursorRotation(undefined, [0, 0], [1, 0])).toBe(0)
  })

  it('returns -wallAngle for front face (normal.z < 0) on axis-aligned wall', () => {
    // Wall along X axis: start=[0,0], end=[1,0] → wallAngle=atan2(0,1)=0
    // normal.z < 0 → result = -0 = 0
    const result = calculateCursorRotation([0, 0, -1], [0, 0], [1, 0])
    expect(result).toBeCloseTo(0, 10)
  })

  it('returns PI - wallAngle for back face (normal.z > 0) on axis-aligned wall', () => {
    // Wall along X axis: wallAngle=0 → result = PI - 0 = PI
    const result = calculateCursorRotation([0, 0, 1], [0, 0], [1, 0])
    expect(result).toBeCloseTo(Math.PI, 10)
  })

  it('calculates correctly for front face on a diagonal wall (45°)', () => {
    // Wall at 45°: start=[0,0], end=[1,1] → wallAngle=atan2(1,1)=PI/4
    // normal.z < 0 → result = -PI/4
    const result = calculateCursorRotation([0, 0, -1], [0, 0], [1, 1])
    expect(result).toBeCloseTo(-Math.PI / 4, 10)
  })

  it('calculates correctly for back face on a diagonal wall (45°)', () => {
    // Wall at 45°: wallAngle=PI/4 → result = PI - PI/4 = 3*PI/4
    const result = calculateCursorRotation([0, 0, 1], [0, 0], [1, 1])
    expect(result).toBeCloseTo((3 * Math.PI) / 4, 10)
  })

  it('calculates correctly for vertical wall (90°)', () => {
    // Wall along Z: start=[0,0], end=[0,1] → wallAngle=atan2(1,0)=PI/2
    // front face: result = -PI/2
    const resultFront = calculateCursorRotation([0, 0, -1], [0, 0], [0, 1])
    expect(resultFront).toBeCloseTo(-Math.PI / 2, 10)

    // back face: result = PI - PI/2 = PI/2
    const resultBack = calculateCursorRotation([0, 0, 1], [0, 0], [0, 1])
    expect(resultBack).toBeCloseTo(Math.PI / 2, 10)
  })
})

// ---------------------------------------------------------------------------
// calculateItemRotation
// ---------------------------------------------------------------------------

describe('calculateItemRotation', () => {
  it('returns 0 when normal is undefined', () => {
    expect(calculateItemRotation(undefined)).toBe(0)
  })

  it('returns 0 for front face (normal.z > 0)', () => {
    expect(calculateItemRotation([0, 0, 1])).toBe(0)
  })

  it('returns PI for back face (normal.z < 0)', () => {
    expect(calculateItemRotation([0, 0, -1])).toBe(Math.PI)
  })

  it('returns 0 for normal.z exactly 0 (edge case — not > 0)', () => {
    // normal[2] > 0 is false when z=0, so returns Math.PI
    expect(calculateItemRotation([1, 0, 0])).toBe(Math.PI)
  })

  it('handles mixed normals — only Z component determines rotation', () => {
    expect(calculateItemRotation([0.5, 0.3, 0.8])).toBe(0)
    expect(calculateItemRotation([0.5, 0.3, -0.8])).toBe(Math.PI)
  })
})

// ---------------------------------------------------------------------------
// getSideFromNormal
// ---------------------------------------------------------------------------

describe('getSideFromNormal', () => {
  it("returns 'front' when normal is undefined", () => {
    expect(getSideFromNormal(undefined)).toBe('front')
  })

  it("returns 'front' for positive Z normal", () => {
    expect(getSideFromNormal([0, 0, 1])).toBe('front')
  })

  it("returns 'front' for Z = 0 (boundary case, >= 0 → front)", () => {
    expect(getSideFromNormal([1, 0, 0])).toBe('front')
  })

  it("returns 'back' for negative Z normal", () => {
    expect(getSideFromNormal([0, 0, -1])).toBe('back')
  })

  it("returns 'front' for mixed normal with positive Z", () => {
    expect(getSideFromNormal([0.3, 0.2, 0.9])).toBe('front')
  })

  it("returns 'back' for mixed normal with negative Z", () => {
    expect(getSideFromNormal([0.3, 0.2, -0.9])).toBe('back')
  })
})

// ---------------------------------------------------------------------------
// isValidWallSideFace
// ---------------------------------------------------------------------------

describe('isValidWallSideFace', () => {
  it('returns false when normal is undefined', () => {
    expect(isValidWallSideFace(undefined)).toBe(false)
  })

  it('returns true for normal pointing straight in +Z direction (front face)', () => {
    expect(isValidWallSideFace([0, 0, 1])).toBe(true)
  })

  it('returns true for normal pointing straight in -Z direction (back face)', () => {
    expect(isValidWallSideFace([0, 0, -1])).toBe(true)
  })

  it('returns true for normal with Z magnitude just above threshold (0.71)', () => {
    expect(isValidWallSideFace([0, 0, 0.71])).toBe(true)
    expect(isValidWallSideFace([0, 0, -0.71])).toBe(true)
  })

  it('returns false for top face normal (Y dominant, Z low)', () => {
    expect(isValidWallSideFace([0, 1, 0])).toBe(false)
  })

  it('returns false for edge face (X dominant, Z low)', () => {
    expect(isValidWallSideFace([1, 0, 0])).toBe(false)
  })

  it('returns false for normal with Z magnitude exactly at threshold (0.7 is not > 0.7)', () => {
    expect(isValidWallSideFace([0, 0, 0.7])).toBe(false)
    expect(isValidWallSideFace([0, 0, -0.7])).toBe(false)
  })

  it('returns false for angled normals with Z magnitude below threshold', () => {
    expect(isValidWallSideFace([0.8, 0.6, 0.0])).toBe(false)
    expect(isValidWallSideFace([0.5, 0.5, 0.5])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// stripTransient
// ---------------------------------------------------------------------------

describe('stripTransient', () => {
  it('removes isTransient flag from metadata object', () => {
    const meta = { isTransient: true, name: 'door', color: 'red' }
    const result = stripTransient(meta)
    expect(result).not.toHaveProperty('isTransient')
    expect(result).toEqual({ name: 'door', color: 'red' })
  })

  it('preserves all other metadata properties', () => {
    const meta = {
      isTransient: false,
      width: 0.9,
      height: 2.1,
      side: 'front',
      nested: { a: 1 },
    }
    const result = stripTransient(meta)
    expect(result.width).toBe(0.9)
    expect(result.height).toBe(2.1)
    expect(result.side).toBe('front')
    expect(result.nested).toEqual({ a: 1 })
  })

  it('handles object without isTransient gracefully (no-op)', () => {
    const meta = { name: 'item', scale: [1, 1, 1] }
    const result = stripTransient(meta)
    expect(result).toEqual({ name: 'item', scale: [1, 1, 1] })
  })

  it('returns a string value as-is (non-object input)', () => {
    expect(stripTransient('raw-string')).toBe('raw-string')
  })

  it('returns a number value as-is', () => {
    expect(stripTransient(42)).toBe(42)
  })

  it('returns null as-is', () => {
    expect(stripTransient(null)).toBeNull()
  })

  it('returns undefined as-is', () => {
    expect(stripTransient(undefined)).toBeUndefined()
  })

  it('returns an array as-is (arrays are not plain objects)', () => {
    const arr = [1, 2, 3]
    expect(stripTransient(arr)).toBe(arr)
  })

  it('does not mutate the original object', () => {
    const meta = { isTransient: true, label: 'test' }
    stripTransient(meta)
    expect(meta).toHaveProperty('isTransient', true)
  })
})
