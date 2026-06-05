import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNodes: Record<string, any> = {}
const mockSelectionLevelId = { value: null as string | null }

vi.mock('@aedifex/core', () => ({
  useScene: { getState: () => ({ nodes: mockNodes }) },
  pointInPolygon: () => false,
  getCatalogMaterialById: (id: string) => {
    if (id === 'roof-tile1') return { id: 'roof-tile1', name: 'Tile' }
    if (id === 'stair-wood1') return { id: 'stair-wood1', name: 'Wood' }
    return null
  },
  nodeRegistry: { get: (_t: string) => ({ capabilities: { deletable: true } }) },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: { getState: () => ({ selection: { levelId: mockSelectionLevelId.value } }) },
}))

import {
  polygonArea,
  validateAddSlab,
  validateAddCeiling,
  validateAddRoof,
  validateAddElevator,
  validateAddStair,
  validateAddZone,
  validateAddBuilding,
  validateUpdateRoofMaterial,
  validateUpdateStairMaterial,
} from '../validate-structure'

beforeEach(() => {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockSelectionLevelId.value = null
})

function makeLevel(id: string, children: string[] = []) {
  mockNodes[id] = { id, type: 'level', visible: true, metadata: {}, children, parentId: 'building1' }
}

function makeBuilding(id: string, children: string[] = []) {
  mockNodes[id] = { id, type: 'building', visible: true, metadata: {}, children, parentId: null }
}

function makeWall(id: string, parentId: string, height: number) {
  mockNodes[id] = {
    id, type: 'wall', visible: true, metadata: {},
    parentId, children: [], start: [0, 0], end: [5, 0],
    height, thickness: 0.2,
  }
}

function makeZone(id: string, parentId: string, polygon: [number, number][]) {
  mockNodes[id] = {
    id, type: 'zone', visible: true, metadata: {}, parentId, children: [],
    polygon, name: 'room',
  }
}

// ============================================================================
// polygonArea
// ============================================================================

describe('polygonArea (shoelace)', () => {
  it('computes area of a square', () => {
    expect(polygonArea([[0, 0], [5, 0], [5, 5], [0, 5]])).toBeCloseTo(25)
  })
  it('returns absolute value regardless of winding order', () => {
    const cw = polygonArea([[0, 0], [0, 5], [5, 5], [5, 0]])
    const ccw = polygonArea([[0, 0], [5, 0], [5, 5], [0, 5]])
    expect(cw).toBeCloseTo(ccw)
  })
})

// ============================================================================
// validateAddSlab
// ============================================================================

describe('validateAddSlab', () => {
  it('rejects polygon with fewer than 3 points', () => {
    const r = validateAddSlab({ tool: 'add_slab', polygon: [[0, 0], [1, 0]] } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/at least 3 points/i)
  })

  it('rejects polygon with area < 1m²', () => {
    const r = validateAddSlab({
      tool: 'add_slab',
      polygon: [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]],
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/too small/i)
  })

  it('accepts a valid slab polygon with holes', () => {
    const r = validateAddSlab({
      tool: 'add_slab',
      polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
      holes: [[[2, 2], [4, 2], [4, 4], [2, 4]]],
      elevation: 0.1,
    } as any)
    expect(r.status).toBe('valid')
    expect(r.holes!.length).toBe(1)
    expect(r.elevation).toBe(0.1)
  })
})

// ============================================================================
// validateAddCeiling — polygon auto-detect + wall-height auto-match
// ============================================================================

describe('validateAddCeiling', () => {
  it('rejects when polygon undefined AND no level selectable', () => {
    mockSelectionLevelId.value = null
    const r = validateAddCeiling({ tool: 'add_ceiling' } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/at least 3 points/i)
  })

  it('auto-detects polygon from largest zone AND auto-matches ceiling height to wall height (both reasons concatenate)', () => {
    makeBuilding('building1', ['lvl'])
    makeLevel('lvl', ['z1', 'z2', 'w1'])
    makeZone('z1', 'lvl', [[0, 0], [10, 0], [10, 10], [0, 10]]) // 100 m² (largest)
    makeZone('z2', 'lvl', [[0, 0], [3, 0], [3, 3], [0, 3]]) // 9 m²
    makeWall('w1', 'lvl', 3.0)
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddCeiling({ tool: 'add_ceiling', height: 2.5 } as any)
    expect(r.status).toBe('adjusted')
    // Polygon should be the largest zone (100m² > 9m²)
    expect(r.polygon).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]])
    // Height should be auto-bumped to 3.0 (matching wall)
    expect(r.height).toBe(3.0)
    // Both reasons concatenated
    expect(r.adjustmentReason).toMatch(/auto-detected/i)
    expect(r.adjustmentReason).toMatch(/wall height/i)
  })

  it('returns adjustment=undefined when polygon matches and height matches', () => {
    makeBuilding('building1', ['lvl'])
    makeLevel('lvl', ['w1'])
    makeWall('w1', 'lvl', 2.5)
    mockSelectionLevelId.value = 'lvl'

    const r = validateAddCeiling({
      tool: 'add_ceiling',
      polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
      height: 2.5,
    } as any)
    expect(r.status).toBe('valid')
    expect(r.adjustmentReason).toBeUndefined()
  })

  it('rejects when polygon area < 1m² (after auto-detect bail-out)', () => {
    const r = validateAddCeiling({
      tool: 'add_ceiling',
      polygon: [[0, 0], [0.5, 0], [0.5, 0.5]],
      height: 2.5,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/too small/i)
  })
})

// ============================================================================
// validateAddRoof — roofType variations
// ============================================================================

describe('validateAddRoof', () => {
  it.each(['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'])(
    'accepts roofType=%s',
    (roofType) => {
      const r = validateAddRoof({
        tool: 'add_roof',
        position: [0, 0, 0],
        width: 5,
        depth: 5,
        roofType,
      } as any)
      expect(r.status).toBe('valid')
      expect(r.roofType).toBe(roofType)
    },
  )

  it('rejects unknown roofType', () => {
    const r = validateAddRoof({
      tool: 'add_roof',
      position: [0, 0, 0],
      width: 5,
      depth: 5,
      roofType: 'pagoda',
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/Invalid roofType/i)
  })

  it('rejects width <= 0 and depth <= 0', () => {
    const r1 = validateAddRoof({
      tool: 'add_roof', position: [0, 0, 0], width: 0, depth: 5, roofType: 'gable',
    } as any)
    expect(r1.status).toBe('invalid')
    const r2 = validateAddRoof({
      tool: 'add_roof', position: [0, 0, 0], width: 5, depth: 0, roofType: 'gable',
    } as any)
    expect(r2.status).toBe('invalid')
  })

  it('applies defaults for roofHeight/wallHeight/overhang', () => {
    const r = validateAddRoof({
      tool: 'add_roof', position: [0, 0, 0], width: 5, depth: 5, roofType: 'gable',
    } as any)
    expect(r.status).toBe('valid')
    expect(r.roofHeight).toBe(2.5)
    expect(r.wallHeight).toBe(0.5)
    expect(r.overhang).toBe(0.3)
  })
})

// ============================================================================
// validateAddElevator — boundary coverage (NEWLY ADDED VALIDATOR)
// ============================================================================

describe('validateAddElevator boundaries', () => {
  it('applies defaults (width=1.6, depth=1.6, cabHeight=2.35) when undefined', () => {
    const r = validateAddElevator({
      tool: 'add_elevator',
      position: [0, 0, 0],
    } as any)
    expect(r.status).toBe('valid')
    expect(r.width).toBe(1.6)
    expect(r.depth).toBe(1.6)
    expect(r.cabHeight).toBe(2.35)
  })

  it('rejects width < 0.6', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], width: 0.5,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/width.*out of range/i)
  })

  it('rejects width > 4.0', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], width: 4.1,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/width.*out of range/i)
  })

  it('accepts width = 0.6 (lower boundary)', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], width: 0.6,
    } as any)
    expect(r.status).toBe('valid')
  })

  it('accepts width = 4.0 (upper boundary)', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], width: 4.0,
    } as any)
    expect(r.status).toBe('valid')
  })

  it('rejects depth < 0.6', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], depth: 0.3,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/depth.*out of range/i)
  })

  it('rejects depth > 4.0', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], depth: 5,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/depth.*out of range/i)
  })

  it('rejects cabHeight < 2.0', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], cabHeight: 1.9,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/cabHeight.*out of range/i)
  })

  it('rejects cabHeight > 4.0', () => {
    const r = validateAddElevator({
      tool: 'add_elevator', position: [0, 0, 0], cabHeight: 4.5,
    } as any)
    expect(r.status).toBe('invalid')
    expect(r.errorReason).toMatch(/cabHeight.*out of range/i)
  })

  it('forwards optional fields when provided', () => {
    const r = validateAddElevator({
      tool: 'add_elevator',
      position: [0, 0, 0],
      servedLevelIds: ['l1', 'l2'],
      shaftStyle: 'glass',
      doorStyle: 'center-opening',
    } as any)
    expect(r.status).toBe('valid')
    expect((r as any).servedLevelIds).toEqual(['l1', 'l2'])
    expect((r as any).shaftStyle).toBe('glass')
  })
})

// ============================================================================
// validateAddStair
// ============================================================================

describe('validateAddStair boundaries', () => {
  it('rejects width < 0.5 or > 5.0', () => {
    const r1 = validateAddStair({
      tool: 'add_stair', position: [0, 0, 0], width: 0.4,
    } as any)
    expect(r1.status).toBe('invalid')
    const r2 = validateAddStair({
      tool: 'add_stair', position: [0, 0, 0], width: 5.5,
    } as any)
    expect(r2.status).toBe('invalid')
  })

  it('rejects stepCount < 2 or > 30', () => {
    const r1 = validateAddStair({
      tool: 'add_stair', position: [0, 0, 0], stepCount: 1,
    } as any)
    expect(r1.status).toBe('invalid')
    const r2 = validateAddStair({
      tool: 'add_stair', position: [0, 0, 0], stepCount: 35,
    } as any)
    expect(r2.status).toBe('invalid')
  })

  it('rounds float stepCount from OpenAI to nearest integer', () => {
    const r = validateAddStair({
      tool: 'add_stair', position: [0, 0, 0], stepCount: 12.7,
    } as any)
    expect(r.status).toBe('valid')
    expect(r.stepCount).toBe(13)
  })

  it('warns when curved-only fields used on straight stair', () => {
    const r = validateAddStair({
      tool: 'add_stair', position: [0, 0, 0],
      stairType: 'straight', innerRadius: 1.0,
    } as any)
    expect(r.status).toBe('adjusted')
    expect(r.adjustmentReason).toMatch(/innerRadius.*ignored.*straight/i)
  })
})

// ============================================================================
// validateAddZone
// ============================================================================

describe('validateAddZone', () => {
  it('rejects polygon with fewer than 3 points', () => {
    const r = validateAddZone({ tool: 'add_zone', polygon: [[0, 0], [1, 0]] } as any)
    expect(r.status).toBe('invalid')
  })

  it('accepts a valid polygon', () => {
    const r = validateAddZone({
      tool: 'add_zone',
      polygon: [[0, 0], [5, 0], [5, 5], [0, 5]],
      name: 'living',
    } as any)
    expect(r.status).toBe('valid')
    expect((r as any).name).toBe('living')
  })
})

// ============================================================================
// validateAddBuilding
// ============================================================================

describe('validateAddBuilding', () => {
  it('always returns valid (it is a passthrough)', () => {
    const r = validateAddBuilding({ tool: 'add_building' } as any)
    expect(r.status).toBe('valid')
    expect(r.position).toEqual([0, 0, 0])
  })
})

// ============================================================================
// validateUpdateRoofMaterial / validateUpdateStairMaterial — role discrimination
// ============================================================================

describe('validateUpdateRoofMaterial', () => {
  it('rejects unknown role', () => {
    mockNodes['r1'] = { id: 'r1', type: 'roof' }
    const r = validateUpdateRoofMaterial({
      tool: 'update_roof_material', nodeId: 'r1', role: 'gargoyle', materialPreset: 'roof-tile1',
    } as any)
    expect(r.status).toBe('invalid')
  })
  it('accepts role=top with known preset', () => {
    mockNodes['r1'] = { id: 'r1', type: 'roof' }
    const r = validateUpdateRoofMaterial({
      tool: 'update_roof_material', nodeId: 'r1', role: 'top', materialPreset: 'roof-tile1',
    } as any)
    expect(r.status).toBe('valid')
  })
})

describe('validateUpdateStairMaterial', () => {
  it('rejects unknown role', () => {
    mockNodes['s1'] = { id: 's1', type: 'stair' }
    const r = validateUpdateStairMaterial({
      tool: 'update_stair_material', nodeId: 's1', role: 'banister', materialPreset: 'stair-wood1',
    } as any)
    expect(r.status).toBe('invalid')
  })
  it('accepts role=railing with known preset', () => {
    mockNodes['s1'] = { id: 's1', type: 'stair' }
    const r = validateUpdateStairMaterial({
      tool: 'update_stair_material', nodeId: 's1', role: 'railing', materialPreset: 'stair-wood1',
    } as any)
    expect(r.status).toBe('valid')
  })
})
