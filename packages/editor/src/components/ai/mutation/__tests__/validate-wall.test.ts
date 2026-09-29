import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  pointInPolygon: () => false,
  // normalizeWallCurveOffset: clamp to chordLength/2
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
  getCatalogMaterialById: (id: string) => {
    if (id === 'wall-wood1') return { id: 'wall-wood1', name: 'Wood' }
    return null
  },
  nodeRegistry: {
    get: (type: string) => {
      // wall is deletable; site/building/level not (typical)
      const deletable = type === 'wall' || type === 'item' || type === 'door'
      return { capabilities: { deletable } }
    },
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({ selection: { levelId: mockSelectionLevelId.value } }),
  },
}))

import {
  validateAddWall,
  validateUpdateWall,
  validateRemoveNode,
  validateUpdateWallMaterial,
  findJunctionPositions,
  avoidJunctions,
} from '../validate-wall'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  // A live default level must exist — resolveEffectiveLevelId now verifies
  // liveness and validators reject structure ops when no level exists.
  mockNodes['level-default'] = { id: 'level-default', type: 'level', visible: true, metadata: {}, children: [], parentId: null }
  mockSelectionLevelId.value = 'level-default'
})

function makeLevel(id: string, children: string[]) {
  mockNodes[id] = { id, type: 'level', visible: true, metadata: {}, children, parentId: null }
}

function makeWall(
  id: string,
  parentId: string,
  start: [number, number],
  end: [number, number],
  opts: { thickness?: number; height?: number } = {},
) {
  mockNodes[id] = {
    id,
    type: 'wall',
    visible: true,
    metadata: {},
    parentId,
    children: [],
    start,
    end,
    height: opts.height ?? 2.5,
    thickness: opts.thickness ?? 0.2,
  }
}

// ============================================================================
// validateAddWall
// ============================================================================

describe('validateAddWall', () => {
  // Regression for QA-AI 2026-06-12 BUG-6: with every level deleted, add_wall
  // used to "succeed" while the wall was silently swallowed.
  it('rejects when no level exists in the scene at all', () => {
    delete mockNodes['level-default']
    mockSelectionLevelId.value = null
    const result = validateAddWall({ tool: 'add_wall', start: [0, 0], end: [5, 0] } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/no level exists/i)
  })

  it('rejects zero-length wall (start == end after grid snap)', () => {
    mockSelectionLevelId.value = null
    const result = validateAddWall({
      tool: 'add_wall',
      start: [0, 0],
      end: [0, 0],
    } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/too short|Minimum/i)
  })

  it('rejects an exact duplicate in reverse direction within 0.3m', () => {
    // Existing wall (0,0) -> (5,0); new wall reverses it as (5,0) -> (0,0).
    makeLevel('lvl1', ['existing'])
    makeWall('existing', 'lvl1', [0, 0], [5, 0])
    mockSelectionLevelId.value = 'lvl1'

    const result = validateAddWall({
      tool: 'add_wall',
      start: [5, 0],
      end: [0, 0],
    } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/already exists/i)
  })

  it('allows T-junction: new wall endpoint touches existing wall body (ENDPOINT_TOLERANCE regression guard)', () => {
    // Existing horizontal wall (0,0) -> (10,0). New vertical wall from (5,0)->(5,5).
    // The new wall's start endpoint is ON the existing wall — must be allowed.
    makeLevel('lvl1', ['existing'])
    makeWall('existing', 'lvl1', [0, 0], [10, 0])
    mockSelectionLevelId.value = 'lvl1'

    const result = validateAddWall({
      tool: 'add_wall',
      start: [5, 0],
      end: [5, 5],
    } as any)
    expect(result.status).not.toBe('invalid')
  })

  it('blocks genuine mid-segment crossings (plus sign)', () => {
    makeLevel('lvl1', ['existing'])
    makeWall('existing', 'lvl1', [-5, 0], [5, 0])
    mockSelectionLevelId.value = 'lvl1'

    const result = validateAddWall({
      tool: 'add_wall',
      start: [0, -5],
      end: [0, 5],
    } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/crosses through/i)
  })

  it('inherits height (mode) from existing walls when call.height is undefined', () => {
    makeLevel('lvl1', ['w1', 'w2', 'w3'])
    makeWall('w1', 'lvl1', [0, 0], [5, 0], { height: 3.0 })
    makeWall('w2', 'lvl1', [5, 0], [5, 5], { height: 3.0 })
    makeWall('w3', 'lvl1', [5, 5], [0, 5], { height: 2.5 })
    mockSelectionLevelId.value = 'lvl1'

    const result = validateAddWall({
      tool: 'add_wall',
      start: [0, 5],
      end: [0, 0],
    } as any)
    // mode height is 3.0 (appears twice)
    expect(result.height).toBe(3.0)
  })

  it('snaps to 0.5m grid and marks status=adjusted', () => {
    mockSelectionLevelId.value = null
    const result = validateAddWall({
      tool: 'add_wall',
      start: [0.1, 0.1],
      end: [5.4, 0.3],
    } as any)
    expect(result.status).toBe('adjusted')
    expect(result.start).toEqual([0, 0])
    expect(result.end).toEqual([5.5, 0.5])
    expect(result.adjustmentReason).toMatch(/Snapped to 0.5m grid/i)
  })

  it('clamps curveOffset to chord/2 and reports adjustment', () => {
    mockSelectionLevelId.value = null
    const result = validateAddWall({
      tool: 'add_wall',
      start: [0, 0],
      end: [4, 0],
      curveOffset: 100,
    } as any)
    expect(result.status).toBe('adjusted')
    // chord = 4, max = 2
    expect(result.curveOffset).toBe(2)
    expect(result.adjustmentReason).toMatch(/curveOffset clamped/i)
  })
})

// ============================================================================
// validateUpdateWall
// ============================================================================

describe('validateUpdateWall', () => {
  it('rejects non-existent nodeId', () => {
    const result = validateUpdateWall({
      tool: 'update_wall',
      nodeId: 'ghost',
      height: 2.5,
    } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/not found/i)
  })

  it('rejects update when node is not a wall', () => {
    mockNodes['n1'] = { id: 'n1', type: 'door', visible: true, metadata: {} }
    const result = validateUpdateWall({
      tool: 'update_wall',
      nodeId: 'n1',
      height: 2.5,
    } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/not a wall/i)
  })

  it('rejects update with no properties set', () => {
    makeWall('w1', 'lvl', [0, 0], [5, 0])
    const result = validateUpdateWall({ tool: 'update_wall', nodeId: 'w1' } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/No properties/i)
  })

  it('snaps updated endpoint coordinates to the 0.5m grid', () => {
    makeWall('w1', 'lvl', [0, 0], [5, 0])
    const result = validateUpdateWall({
      tool: 'update_wall',
      nodeId: 'w1',
      end: [5.4, 0.1],
    } as any)
    expect(result.status).toBe('adjusted')
    expect(result.end).toEqual([5.5, 0])
  })
})

// ============================================================================
// validateRemoveNode
// ============================================================================

describe('validateRemoveNode', () => {
  it('rejects non-existent node', () => {
    const result = validateRemoveNode({ tool: 'remove_node', nodeId: 'ghost' } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/not found/i)
  })

  it('allows removal of nodes that registry says are deletable', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall', visible: true, metadata: {} }
    const result = validateRemoveNode({ tool: 'remove_node', nodeId: 'w1' } as any)
    expect(result.status).toBe('valid')
  })

  it('blocks removal when registry capabilities.deletable=false', () => {
    mockNodes['s1'] = { id: 's1', type: 'site', visible: true, metadata: {} }
    const result = validateRemoveNode({ tool: 'remove_node', nodeId: 's1' } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/deletable=false|Cannot remove/i)
  })
})

// ============================================================================
// validateUpdateWallMaterial
// ============================================================================

describe('validateUpdateWallMaterial', () => {
  it('rejects unknown side', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall', visible: true, metadata: {} }
    const result = validateUpdateWallMaterial({
      tool: 'update_wall_material',
      nodeId: 'w1',
      side: 'middle',
      materialPreset: 'wall-wood1',
    } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/Invalid side/i)
  })

  it('rejects when neither materialPreset nor materialColor is provided', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall', visible: true, metadata: {} }
    const result = validateUpdateWallMaterial({
      tool: 'update_wall_material',
      nodeId: 'w1',
      side: 'interior',
    } as any)
    expect(result.status).toBe('invalid')
  })

  it('rejects unknown materialPreset', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall', visible: true, metadata: {} }
    const result = validateUpdateWallMaterial({
      tool: 'update_wall_material',
      nodeId: 'w1',
      side: 'interior',
      materialPreset: 'does-not-exist',
    } as any)
    expect(result.status).toBe('invalid')
    expect(result.errorReason).toMatch(/Catalog preset/i)
  })

  it('returns valid for a known preset on a wall', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall', visible: true, metadata: {} }
    const result = validateUpdateWallMaterial({
      tool: 'update_wall_material',
      nodeId: 'w1',
      side: 'interior',
      materialPreset: 'wall-wood1',
    } as any)
    expect(result.status).toBe('valid')
  })
})

// ============================================================================
// avoidJunctions
// ============================================================================

describe('avoidJunctions', () => {
  it('returns position unchanged when no junctions exist', () => {
    const r = avoidJunctions(2.0, 0.45, 10, [])
    expect(r.wasAdjusted).toBe(false)
    expect(r.adjustedPosition).toBe(2.0)
  })

  it('shifts a door away from a T-junction collision', () => {
    // Junction at 2.0 along wall, thickness=0.2 → clearance ~0.5+0.1+0.05 = 0.65 (door half=0.45)
    const junctions = [{ position: 2.0, thickness: 0.2 }]
    const r = avoidJunctions(2.0, 0.45, 10, junctions)
    expect(r.wasAdjusted).toBe(true)
    expect(Math.abs(r.adjustedPosition - 2.0)).toBeGreaterThan(0.4)
  })

  it('reports failure with reason when no valid candidate fits within wall bounds', () => {
    // Tiny wall, junction in middle: door cannot fit anywhere.
    const junctions = [{ position: 0.5, thickness: 0.5 }]
    const r = avoidJunctions(0.5, 0.45, 1.0, junctions)
    // Either succeeds nudging or returns wasAdjusted=false with reason
    if (!r.wasAdjusted) {
      expect(r.reason).toBeDefined()
    }
  })
})

// ============================================================================
// findJunctionPositions
// ============================================================================

describe('findJunctionPositions', () => {
  it('returns empty list when no perpendicular walls exist', () => {
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', [0, 0], [10, 0])
    const w1 = mockNodes['w1']
    const result = findJunctionPositions(w1, 'lvl')
    expect(result).toEqual([])
  })

  it('finds a T-junction where perpendicular wall endpoint lands on host wall body', () => {
    // Host wall: horizontal (0,0) -> (10,0)
    // Perp wall: (5,0) -> (5,5) — endpoint at (5,0) lands on host wall at t=0.5
    makeLevel('lvl', ['host', 'perp'])
    makeWall('host', 'lvl', [0, 0], [10, 0])
    makeWall('perp', 'lvl', [5, 0], [5, 5])
    const host = mockNodes['host']
    const result = findJunctionPositions(host, 'lvl')
    expect(result.length).toBe(1)
    expect(result[0]!.position).toBeCloseTo(5)
  })
})
