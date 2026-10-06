import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  pointInPolygon: () => false,
  normalizeWallCurveOffset: (
    wall: { start: [number, number]; end: [number, number] },
    offset: number,
  ) => {
    const chord = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    const max = chord / 2
    if (offset > max) return max
    if (offset < -max) return -max
    return offset
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: { getState: () => ({ selection: { levelId: mockSelectionLevelId.value } }) },
}))

import {
  validateAddFence,
  validateUpdateFence,
  validateAddCutOut,
} from '../validate-fence'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockSelectionLevelId.value = null
})

// ============================================================================
// validateAddFence
// ============================================================================

describe('validateAddFence boundaries', () => {
  it('rejects missing start or end', () => {
    const r = validateAddFence({ tool: 'add_fence' } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/start.*end/i)
  })

  it('rejects fence length < 0.3m', () => {
    const r = validateAddFence({
      tool: 'add_fence',
      start: [0, 0],
      end: [0.2, 0],
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/too short/i)
  })

  it('rejects unknown style', () => {
    const r = validateAddFence({
      tool: 'add_fence',
      start: [0, 0],
      end: [5, 0],
      style: 'electric-zap',
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/Invalid fence style/i)
  })

  it('rejects height < 0.3 or > 5.0', () => {
    const r1 = validateAddFence({
      tool: 'add_fence', start: [0, 0], end: [5, 0], height: 0.1,
    } as any)
    expect(r1.status).toBe('invalid')
    const r2 = validateAddFence({
      tool: 'add_fence', start: [0, 0], end: [5, 0], height: 6,
    } as any)
    expect(r2.status).toBe('invalid')
  })

  it('rejects invalid baseStyle', () => {
    const r = validateAddFence({
      tool: 'add_fence', start: [0, 0], end: [5, 0], baseStyle: 'floating-on-air',
    } as any)
    expect(r.status).toBe('invalid')
  })

  it('clamps curveOffset to chord/2 with adjustment reason', () => {
    const r = validateAddFence({
      tool: 'add_fence',
      start: [0, 0],
      end: [4, 0],
      curveOffset: 100,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.curveOffset).toBe(2)
    expect(r.adjustmentReason).toMatch(/curveOffset clamped/i)
  })

  it('applies all defaults when only start/end provided', () => {
    const r = validateAddFence({
      tool: 'add_fence', start: [0, 0], end: [5, 0],
    } as any)
    expect(r.status).toBe('valid')
    expect(r.height).toBe(1.8)
    expect(r.thickness).toBe(0.08)
    expect(r.style).toBe('slat')
    expect(r.baseStyle).toBe('grounded')
    expect(r.postSpacing).toBe(2)
  })
})

// ============================================================================
// validateUpdateFence
// ============================================================================

describe('validateUpdateFence', () => {
  it('rejects non-existent fence', () => {
    const r = validateUpdateFence({ tool: 'update_fence', nodeId: 'ghost' } as any)
    expect(r.status).toBe('invalid')
  })

  it('rejects non-fence node', () => {
    mockNodes['x'] = { id: 'x', type: 'wall' }
    const r = validateUpdateFence({ tool: 'update_fence', nodeId: 'x' } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/not a fence/i)
  })

  it('rejects height out of range', () => {
    mockNodes['f1'] = { id: 'f1', type: 'fence', start: [0, 0], end: [5, 0] }
    const r = validateUpdateFence({ tool: 'update_fence', nodeId: 'f1', height: 10 } as any)
    expect(r.status).toBe('invalid')
  })

  it('rejects new length < 0.3m', () => {
    mockNodes['f1'] = { id: 'f1', type: 'fence', start: [0, 0], end: [5, 0] }
    const r = validateUpdateFence({
      tool: 'update_fence', nodeId: 'f1', start: [0, 0], end: [0.1, 0],
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/too short/i)
  })

  it('clamps curveOffset on update against effective chord', () => {
    mockNodes['f1'] = { id: 'f1', type: 'fence', start: [0, 0], end: [4, 0] }
    const r = validateUpdateFence({
      tool: 'update_fence', nodeId: 'f1', curveOffset: 100,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.curveOffset).toBe(2)
  })
})

// ============================================================================
// validateAddCutOut
// ============================================================================

describe('validateAddCutOut', () => {
  it('rejects when target node not found', () => {
    const r = validateAddCutOut({ tool: 'add_cut_out', nodeId: 'ghost', hole: [[0, 0], [1, 0], [1, 1]] } as any)
    expect(r.status).toBe('invalid')
  })

  it('rejects when target is not a slab or ceiling', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall' }
    const r = validateAddCutOut({
      tool: 'add_cut_out', nodeId: 'w1', hole: [[0, 0], [1, 0], [1, 1]],
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/only be added to slabs or ceilings/i)
  })

  it('rejects hole polygon with < 3 points', () => {
    mockNodes['s1'] = { id: 's1', type: 'slab', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }
    const r = validateAddCutOut({
      tool: 'add_cut_out', nodeId: 's1', hole: [[0, 0], [1, 0]],
    } as any)
    expect(r.status).toBe('invalid')
  })

  it('rejects hole area < 0.1m²', () => {
    mockNodes['s1'] = { id: 's1', type: 'slab', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }
    const r = validateAddCutOut({
      tool: 'add_cut_out', nodeId: 's1',
      hole: [[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]],
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/too small/i)
  })

  it('rejects hole area > 90% of parent area', () => {
    mockNodes['s1'] = { id: 's1', type: 'slab', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }
    // Hole area = 95 (close to parent area 100)
    const r = validateAddCutOut({
      tool: 'add_cut_out', nodeId: 's1',
      hole: [[0.5, 0.5], [9.5, 0.5], [9.5, 11], [0.5, 11]],
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/too large/i)
  })

  it('accepts a valid hole inside a slab', () => {
    mockNodes['s1'] = { id: 's1', type: 'slab', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }
    const r = validateAddCutOut({
      tool: 'add_cut_out', nodeId: 's1',
      hole: [[2, 2], [4, 2], [4, 4], [2, 4]],
    } as any)
    expect(r.status).toBe('valid')
  })
})
