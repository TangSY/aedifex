import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }

// spatialGridManager state — tests inject behavior via these knobs.
const sgmState = {
  canPlaceOnFloor: vi.fn(),
  getSlabElevationForItem: vi.fn(() => 0),
}

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  pointInPolygon: (px: number, pz: number, polygon: [number, number][]) => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]![0]
      const zi = polygon[i]![1]
      const xj = polygon[j]![0]
      const zj = polygon[j]![1]
      const intersect = (zi > pz) !== (zj > pz)
        && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
      if (intersect) inside = !inside
    }
    return inside
  },
  spatialGridManager: {
    canPlaceOnFloor: (...args: unknown[]) => sgmState.canPlaceOnFloor(...args),
    getSlabElevationForItem: (...args: unknown[]) => sgmState.getSlabElevationForItem(...args),
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: { getState: () => ({ selection: { levelId: mockSelectionLevelId.value } }) },
}))

// Mock catalog resolver — return a controlled asset for tests
vi.mock('../../ai-catalog-resolver', () => ({
  resolveCatalogSlug: (slug: string) => {
    if (slug === 'chair') {
      return { asset: { id: 'chair', name: 'Chair', dimensions: [0.5, 0.9, 0.5] }, matchType: 'exact' }
    }
    if (slug === 'big-table') {
      return { asset: { id: 'big-table', name: 'Big Table', dimensions: [3, 0.8, 3] }, matchType: 'exact' }
    }
    if (slug === 'ceiling-lamp') {
      return { asset: { id: 'ceiling-lamp', name: 'Ceiling Lamp', dimensions: [0.4, 0.4, 0.4], attachTo: 'ceiling' }, matchType: 'exact' }
    }
    if (slug === 'window-only') {
      return { asset: { id: 'window-only', name: 'Window', dimensions: [1, 1, 0.1], attachTo: 'wall' }, matchType: 'exact' }
    }
    return { asset: null, matchType: 'none', suggestions: [] }
  },
}))

import {
  validateAddItem,
  validateRemoveItem,
  validateMoveItem,
  validateUpdateMaterial,
  validateUpdateItem,
  guessToolType,
  tryAutoOffset,
} from '../validate-item'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  // A live default level must exist — resolveEffectiveLevelId now verifies
  // liveness and validators reject add_item when no level exists.
  mockNodes['level-default'] = { id: 'level-default', type: 'level', visible: true, metadata: {}, children: [], parentId: null }
  mockSelectionLevelId.value = 'level-default'
  sgmState.canPlaceOnFloor.mockReset()
  sgmState.canPlaceOnFloor.mockReturnValue({ valid: true, conflictIds: [] })
  sgmState.getSlabElevationForItem.mockReset()
  sgmState.getSlabElevationForItem.mockReturnValue(0)
})

function makeLevel(id: string, children: string[] = []) {
  mockNodes[id] = { id, type: 'level', visible: true, metadata: {}, children, parentId: null }
}
function makeZone(id: string, parentId: string, polygon: [number, number][]) {
  mockNodes[id] = { id, type: 'zone', visible: true, metadata: {}, parentId, children: [], polygon, name: 'room' }
}

// ============================================================================
// validateAddItem — happy path + edge cases
// ============================================================================

describe('validateAddItem', () => {
  it('rejects missing catalogSlug (batch_operations passed undefined type)', () => {
    const r = validateAddItem({ tool: 'add_item', position: [0, 0, 0], rotationY: 0 } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/catalogSlug/i)
  })

  it('rejects unknown catalogSlug', () => {
    const r = validateAddItem({
      tool: 'add_item',
      catalogSlug: 'definitely-not-real',
      position: [0, 0, 0],
      rotationY: 0,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/not found/i)
  })

  it('returns valid on a bare level with no zone walls', () => {
    const r = validateAddItem({
      tool: 'add_item',
      catalogSlug: 'chair',
      position: [0, 0, 0],
      rotationY: 0,
    } as any)
    expect(r.status).toBe('valid')
    expect(r.asset!.id).toBe('chair')
  })

  // Regression for QA-AI 2026-06-12 BUG-6: with every level deleted, add_item
  // used to "succeed" while the created node was silently swallowed.
  it('rejects when no level exists in the scene at all', () => {
    delete mockNodes['level-default']
    mockSelectionLevelId.value = null
    const r = validateAddItem({
      tool: 'add_item',
      catalogSlug: 'chair',
      position: [0, 0, 0],
      rotationY: 0,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/no level exists/i)
  })

  it('zone boundary clamps an out-of-zone indoor item rather than rejecting', () => {
    makeLevel('lvl', ['z1'])
    makeZone('z1', 'lvl', [[0, 0], [10, 0], [10, 10], [0, 10]])
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddItem({
      tool: 'add_item',
      catalogSlug: 'chair',
      position: [-5, 0, -5], // outside zone
      rotationY: 0,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.adjustmentReason).toBeTruthy()
    // x and z should be within or near the zone (centroid is [5,5])
    expect(r.position[0]).toBeGreaterThan(-5)
    expect(r.position[2]).toBeGreaterThan(-5)
  })

  it('rejects wall-attached item when no walls exist on the level', () => {
    makeLevel('lvl', [])
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddItem({
      tool: 'add_item',
      catalogSlug: 'window-only',
      position: [0, 0, 0],
      rotationY: 0,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/requires walls/i)
  })

  it('tryAutoOffset returning null + recheck.valid=true does NOT flip status to invalid', () => {
    // First call: invalid with conflicts (triggers tryAutoOffset).
    // tryAutoOffset (inside) calls canPlaceOnFloor and gets valid → returns null.
    // The validator then re-checks; recheck reports valid → item is fine.
    makeLevel('lvl', [])
    mockSelectionLevelId.value = 'lvl'

    let callCount = 0
    sgmState.canPlaceOnFloor.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { valid: false, conflictIds: ['ghost-conflict'] }
      // All subsequent calls report valid (stale-grid false positive)
      return { valid: true, conflictIds: [] }
    })

    const r = validateAddItem({
      tool: 'add_item',
      catalogSlug: 'chair',
      position: [5, 0, 5],
      rotationY: 0,
    } as any)

    expect(r.status).toBe('valid')
  })

  it('reports invalid when a real collision is confirmed by recheck', () => {
    makeLevel('lvl', [])
    mockSelectionLevelId.value = 'lvl'

    sgmState.canPlaceOnFloor.mockReturnValue({ valid: false, conflictIds: ['conflicting-item'] })
    // No conflict nodes registered → tryAutoOffset cannot compute push → returns null.
    const r = validateAddItem({
      tool: 'add_item',
      catalogSlug: 'chair',
      position: [5, 0, 5],
      rotationY: 0,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/collides/i)
  })
})

// ============================================================================
// validateRemoveItem / validateMoveItem / validateUpdateMaterial / validateUpdateItem
// ============================================================================

describe('validateRemoveItem', () => {
  it('rejects non-existent', () => {
    const r = validateRemoveItem({ tool: 'remove_item', nodeId: 'ghost' } as any)
    expect(r.status).toBe('invalid')
  })
  it('rejects when node is not an item', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall' }
    const r = validateRemoveItem({ tool: 'remove_item', nodeId: 'w1' } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/not an item/i)
  })
  it('accepts a real item', () => {
    mockNodes['i1'] = { id: 'i1', type: 'item' }
    const r = validateRemoveItem({ tool: 'remove_item', nodeId: 'i1' } as any)
    expect(r.status).toBe('valid')
  })
})

describe('validateUpdateMaterial', () => {
  it('rejects non-existent node', () => {
    const r = validateUpdateMaterial({
      tool: 'update_material', nodeId: 'ghost', material: 'wood',
    } as any)
    expect(r.status).toBe('invalid')
  })
  it('accepts material-capable node (ceiling) with material', () => {
    mockNodes['c1'] = { id: 'c1', type: 'ceiling' }
    const r = validateUpdateMaterial({
      tool: 'update_material', nodeId: 'c1', material: 'wood',
    } as any)
    expect(r.status).toBe('valid')
  })
  // Items are GLB models with no material slot — update_material on them was
  // a silent no-op falsely reported as success (QA-AI 2026-06-12 BUG-4).
  it('rejects items (no material slot) with a user-facing explanation', () => {
    mockNodes['x1'] = { id: 'x1', type: 'item' }
    const r = validateUpdateMaterial({
      tool: 'update_material', nodeId: 'x1', material: '#0000ff',
    } as any)
    expect(r.status).toBe('invalid')
    expect((r as any).errorReason).toMatch(/cannot be recolored|no material slot/i)
  })
  it('rejects empty material string', () => {
    mockNodes['c2'] = { id: 'c2', type: 'ceiling' }
    const r = validateUpdateMaterial({
      tool: 'update_material', nodeId: 'c2', material: '',
    } as any)
    expect(r.status).toBe('invalid')
  })
})

describe('validateUpdateItem', () => {
  it('rejects when no scale provided', () => {
    mockNodes['i1'] = { id: 'i1', type: 'item' }
    const r = validateUpdateItem({ tool: 'update_item', nodeId: 'i1' } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/No properties/i)
  })
  it('rejects non-item node', () => {
    mockNodes['w1'] = { id: 'w1', type: 'wall' }
    const r = validateUpdateItem({ tool: 'update_item', nodeId: 'w1', scale: 1.2 } as any)
    expect(r.status).toBe('invalid')
  })
})

// ============================================================================
// guessToolType — ambiguous role discrimination
// ============================================================================

describe('guessToolType', () => {
  it('returns update_roof_material for {nodeId, role:"top"} (NOT update_material)', () => {
    expect(guessToolType({ nodeId: 'r1', role: 'top' })).toBe('update_roof_material')
  })

  it('returns update_roof_material for role=edge', () => {
    expect(guessToolType({ nodeId: 'r1', role: 'edge' })).toBe('update_roof_material')
  })

  it('returns update_stair_material for role=railing', () => {
    expect(guessToolType({ nodeId: 's1', role: 'railing' })).toBe('update_stair_material')
  })

  it('returns update_stair_material for role=tread', () => {
    expect(guessToolType({ nodeId: 's1', role: 'tread' })).toBe('update_stair_material')
  })

  it('returns update_wall_material when side is interior/exterior/both', () => {
    expect(guessToolType({ nodeId: 'w1', side: 'interior' })).toBe('update_wall_material')
    expect(guessToolType({ nodeId: 'w1', side: 'exterior' })).toBe('update_wall_material')
    expect(guessToolType({ nodeId: 'w1', side: 'both' })).toBe('update_wall_material')
  })

  it('returns add_wall when start AND end arrays present', () => {
    expect(guessToolType({ start: [0, 0], end: [5, 0] })).toBe('add_wall')
  })

  it('returns add_door when wallId + hingesSide present', () => {
    expect(guessToolType({ wallId: 'w1', positionAlongWall: 2, hingesSide: 'left' })).toBe('add_door')
  })

  it('returns add_window when wallId + heightFromFloor present', () => {
    expect(guessToolType({ wallId: 'w1', positionAlongWall: 2, heightFromFloor: 1.2 })).toBe('add_window')
  })

  it('returns add_item for catalogSlug + position', () => {
    expect(guessToolType({ catalogSlug: 'chair', position: [0, 0, 0] })).toBe('add_item')
  })

  it('returns add_slab when polygon + elevation present', () => {
    expect(guessToolType({ polygon: [[0, 0], [1, 0], [1, 1]], elevation: 0.1 })).toBe('add_slab')
  })

  it('returns add_ceiling when polygon + height but no elevation', () => {
    expect(guessToolType({ polygon: [[0, 0], [1, 0], [1, 1]], height: 2.5 })).toBe('add_ceiling')
  })

  it('returns add_zone when polygon without height/elevation', () => {
    expect(guessToolType({ polygon: [[0, 0], [1, 0], [1, 1]] })).toBe('add_zone')
  })

  it('returns add_roof when roofType present', () => {
    expect(guessToolType({ roofType: 'gable', position: [0, 0, 0], width: 5, depth: 5 })).toBe('add_roof')
  })

  it('returns add_stair when stepCount + position present', () => {
    expect(guessToolType({ stepCount: 10, position: [0, 0, 0] })).toBe('add_stair')
  })

  it('returns "unknown" when no discriminator can be matched', () => {
    expect(guessToolType({ foo: 'bar' })).toBe('unknown')
  })
})

// ============================================================================
// tryAutoOffset
// ============================================================================

describe('tryAutoOffset', () => {
  it('returns null when there is no collision (no push needed)', () => {
    sgmState.canPlaceOnFloor.mockReturnValue({ valid: true, conflictIds: [] })
    const r = tryAutoOffset([0, 0, 0], [1, 1, 1], [0, 0, 0], 'lvl')
    expect(r).toBeNull()
  })

  it('returns null when push vector is negligible (cannot meaningfully separate)', () => {
    // Conflict reported, but no conflict nodes registered → push remains 0 → null
    sgmState.canPlaceOnFloor.mockReturnValue({ valid: false, conflictIds: ['nonexistent'] })
    const r = tryAutoOffset([0, 0, 0], [1, 1, 1], [0, 0, 0], 'lvl')
    expect(r).toBeNull()
  })

  it('computes a push and returns adjusted position when conflict is resolved', () => {
    // Conflict node exists; push along Z by overlap + 0.05
    mockNodes['conflict1'] = {
      id: 'conflict1',
      type: 'item',
      asset: { dimensions: [2, 1, 2] },
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    }
    let callCount = 0
    sgmState.canPlaceOnFloor.mockImplementation(() => {
      callCount++
      // First call (initial): conflict; second call (verify): valid
      if (callCount === 1) return { valid: false, conflictIds: ['conflict1'] }
      return { valid: true, conflictIds: [] }
    })

    const r = tryAutoOffset([0.5, 0, 0], [1, 1, 1], [0, 0, 0], 'lvl')
    expect(r).not.toBeNull()
  })
})
