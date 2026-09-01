import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  pointInPolygon: () => false,
  getScaledDimensions: (item: any) => {
    const dims = item.asset?.dimensions ?? [1, 1, 1]
    return [dims[0], dims[1], dims[2]]
  },
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
  validateAddDoor,
  validateAddWindow,
  validateUpdateDoor,
  validateUpdateWindow,
} from '../validate-opening'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockSelectionLevelId.value = null
})

function makeLevel(id: string, children: string[] = []) {
  mockNodes[id] = { id, type: 'level', visible: true, metadata: {}, children, parentId: null }
}

function makeWall(
  id: string,
  parentId: string | null,
  opts: { start?: [number, number]; end?: [number, number]; height?: number; thickness?: number; children?: string[] } = {},
) {
  mockNodes[id] = {
    id,
    type: 'wall',
    visible: true,
    metadata: {},
    parentId,
    children: opts.children ?? [],
    start: opts.start ?? [0, 0],
    end: opts.end ?? [10, 0],
    height: opts.height ?? 2.8,
    thickness: opts.thickness ?? 0.2,
  }
}

// ============================================================================
// validateAddDoor
// ============================================================================

describe('validateAddDoor', () => {
  it('rejects when wallId does not point to a wall node', () => {
    mockNodes['x1'] = { id: 'x1', type: 'item', visible: true, metadata: {} }
    const r = validateAddDoor({
      tool: 'add_door',
      wallId: 'x1',
      positionAlongWall: 2,
      width: 0.9,
      height: 2.1,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/not found/i)
  })

  it('rejects when wallId does not exist', () => {
    const r = validateAddDoor({
      tool: 'add_door',
      wallId: 'ghost',
      positionAlongWall: 2,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/not found/i)
  })

  it('clamps positionAlongWall when too close to wall end (> wallLength - width/2)', () => {
    // wall length 10, door width 1.0 → max position = 10 - 0.5 = 9.5
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', { start: [0, 0], end: [10, 0] })
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddDoor({
      tool: 'add_door',
      wallId: 'w1',
      positionAlongWall: 15,
      width: 1.0,
      height: 2.1,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.localX).toBeCloseTo(9.5)
    expect(r.adjustmentReason).toMatch(/clamped to wall bounds/i)
  })

  it('clamps positionAlongWall when negative or near start (< width/2)', () => {
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', { start: [0, 0], end: [10, 0] })
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddDoor({
      tool: 'add_door',
      wallId: 'w1',
      positionAlongWall: 0.1,
      width: 1.0,
      height: 2.1,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.localX).toBeCloseTo(0.5)
  })

  it('applies default width=0.9 / height=2.1 / hingesSide=left / swingDirection=inward', () => {
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', { start: [0, 0], end: [10, 0] })
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddDoor({
      tool: 'add_door', wallId: 'w1', positionAlongWall: 5,
    } as any)
    expect(r.width).toBe(0.9)
    expect(r.height).toBe(2.1)
    expect(r.hingesSide).toBe('left')
    expect(r.swingDirection).toBe('inward')
  })

  it('shifts door away from T-junction conflict (junction avoidance)', async () => {
    // Host wall (0,0)->(20,0); perpendicular wall makes T at x=3.0.
    // Door at 3.0 with width 0.8 → clearance 0.55. Forbidden zone [2.45, 3.55].
    // Both candidates fall within wall bounds and out of conflict zones at boundary
    // (due to floating-point the function's strict < boundary check rejects exact
    // edges, but we offset enough by using a smaller thickness perpendicular wall).
    makeLevel('lvl', ['host', 'perp'])
    makeWall('host', 'lvl', { start: [0, 0], end: [20, 0], children: [] })
    // Very thin perpendicular wall → smaller forbidden zone
    makeWall('perp', 'lvl', { start: [3, 0], end: [3, 5], thickness: 0.05 })
    mockSelectionLevelId.value = 'lvl'

    // Sanity: junction detection sees one junction at position 3.
    const { findJunctionPositions, avoidJunctions } = await import('../validate-wall')
    const junctions = findJunctionPositions(mockNodes['host'] as any, 'lvl')
    expect(junctions.length).toBe(1)
    expect(junctions[0]!.position).toBeCloseTo(3)
    // Door placed at junction position 3 with halfWidth 0.4 → conflict, then shift.
    // clearance = 0.4 + 0.025 + 0.05 = 0.475 → forbidden [2.525, 3.475]
    const avoid = avoidJunctions(3, 0.4, 20, junctions)
    expect(avoid.wasAdjusted).toBe(true)

    const r = validateAddDoor({
      tool: 'add_door',
      wallId: 'host',
      positionAlongWall: 3,
      width: 0.8,
    } as any)
    expect(r.status).not.toBe('valid')
    // Door should have shifted away from x=3 by at least the clearance distance.
    expect(Math.abs(r.localX - 3)).toBeGreaterThan(0.3)
  })
})

// ============================================================================
// validateAddWindow
// ============================================================================

describe('validateAddWindow', () => {
  it('rejects when wallId is not a wall', () => {
    mockNodes['x1'] = { id: 'x1', type: 'door', visible: true, metadata: {} }
    const r = validateAddWindow({
      tool: 'add_window', wallId: 'x1', positionAlongWall: 2,
    } as any)
    expect(r.status).toBe('invalid')
  })

  it('clamps Y when heightFromFloor + height/2 > wallHeight', () => {
    // wallHeight=2.8, window height=1.5 → max Y center = 2.8 - 0.75 = 2.05
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', { start: [0, 0], end: [10, 0], height: 2.8 })
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddWindow({
      tool: 'add_window',
      wallId: 'w1',
      positionAlongWall: 5,
      heightFromFloor: 5, // way too high
      width: 1.5,
      height: 1.5,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.localY).toBeCloseTo(2.05)
  })

  it('uses defaults width=1.5 / height=1.5 / heightFromFloor=1.2', () => {
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', { start: [0, 0], end: [10, 0] })
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddWindow({
      tool: 'add_window', wallId: 'w1', positionAlongWall: 5,
    } as any)
    expect(r.width).toBe(1.5)
    expect(r.height).toBe(1.5)
    expect(r.localY).toBe(1.2)
  })

  it('clamps positionAlongWall to [width/2, wallLength - width/2]', () => {
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', { start: [0, 0], end: [10, 0] })
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddWindow({
      tool: 'add_window',
      wallId: 'w1',
      positionAlongWall: 20,
      width: 1.5,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.localX).toBeCloseTo(9.25)
  })
})

// ============================================================================
// validateUpdateDoor / validateUpdateWindow
// ============================================================================

describe('validateUpdateDoor', () => {
  it('rejects non-existent door', () => {
    const r = validateUpdateDoor({ tool: 'update_door', nodeId: 'ghost' } as any)
    expect(r.status).toBe('invalid')
  })

  it('rejects when node is not a door', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall', visible: true }
    const r = validateUpdateDoor({ tool: 'update_door', nodeId: 'w1' } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/not a door/i)
  })

  it('clamps positionAlongWall to parent wall bounds when provided', () => {
    makeWall('w1', 'lvl', { start: [0, 0], end: [10, 0] })
    mockNodes['d1'] = {
      id: 'd1', type: 'door', visible: true, parentId: 'w1', width: 1.0, height: 2.1,
      position: [5, 1.05, 0],
    }
    const r = validateUpdateDoor({
      tool: 'update_door',
      nodeId: 'd1',
      positionAlongWall: 20,
      width: 1.0,
    } as any)
    expect(r.status).toBe('valid')
    expect(r.localX).toBeCloseTo(9.5)
  })
})

describe('validateUpdateWindow', () => {
  it('rejects when node is not a window', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall', visible: true }
    const r = validateUpdateWindow({ tool: 'update_window', nodeId: 'w1' } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/not a window/i)
  })

  it('passes through heightFromFloor as localY', () => {
    mockNodes['win1'] = {
      id: 'win1', type: 'window', visible: true, parentId: null, width: 1.5, height: 1.5,
      position: [3, 1.2, 0],
    }
    const r = validateUpdateWindow({
      tool: 'update_window',
      nodeId: 'win1',
      heightFromFloor: 0.8,
    } as any)
    expect(r.status).toBe('valid')
    expect(r.localY).toBe(0.8)
  })
})
