/**
 * confirmGhostPreview — add_elevator case.
 *
 * Covers the recently-added elevator branch in preview/confirm-operations.ts:
 *
 *  - target building resolved from explicit op.buildingId
 *  - target building resolved from currentLevel when buildingId absent
 *  - fromIdx/toIdx computed via levels.sort((a,b) => a.level - b.level)
 *  - supportY resolved via resolveElevatorSupportY
 *  - elevator name is "Elevator N" derived from current count
 *  - silent skip when no resolvable building (current behavior — pin it)
 *  - update_wall.height propagates to ceilings on the same level (Issue-C guard)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockNodes: Record<string, any> = {}
const mockCreatedBatches: Array<Array<{ node: any; parentId: string | null }>> = []
const mockUpdatedNodes: Array<{ id: string; data: any }> = []
const mockDeletedNodeIds: string[] = []
const mockPatchCalls: any[][] = []

let _idCounter = 0
const nextId = (prefix: string) => `${prefix}_mock_${++_idCounter}`

const mockCreateNode = vi.fn((node: any, parentId?: string) => {
  mockNodes[node.id] = { ...node, parentId: parentId ?? null }
})

const mockCreateNodes = vi.fn((entries: Array<{ node: any; parentId: string | null }>) => {
  for (const entry of entries) {
    mockNodes[entry.node.id] = { ...entry.node, parentId: entry.parentId ?? null }
  }
  mockCreatedBatches.push(entries)
})

const mockDeleteNode = vi.fn((id: string) => {
  delete mockNodes[id]
  mockDeletedNodeIds.push(id)
})

const mockUpdateNode = vi.fn((id: string, data: any) => {
  if (mockNodes[id]) mockNodes[id] = { ...mockNodes[id], ...data }
  mockUpdatedNodes.push({ id, data })
})

const mockSetNode = vi.fn((id: string, node: any) => {
  mockNodes[id] = { ...node }
})

const mockApplyPatch = vi.fn((patches: any[]) => {
  mockPatchCalls.push(patches)
  // Honor the patches against the in-memory store so subsequent reads work.
  for (const p of patches) {
    if (p.op === 'create') {
      mockNodes[p.node.id] = { ...p.node, parentId: p.parentId ?? null }
    }
  }
})

const mockPause = vi.fn()
const mockResume = vi.fn()

vi.mock('@aedifex/core', () => {
  const makeParser = (typeName: string) => ({
    parse: (data: any) => {
      const id = data.id ?? nextId(typeName)
      return {
        ...data,
        id,
        type: typeName === 'wall' ? 'wall' : typeName,
        parentId: data.parentId ?? null,
        visible: data.visible ?? true,
        metadata: data.metadata ?? {},
        children: data.children ?? [],
      }
    },
  })

  return {
    useScene: {
      getState: () => ({
        nodes: mockNodes,
        createNode: mockCreateNode,
        createNodes: mockCreateNodes,
        deleteNode: mockDeleteNode,
        updateNode: mockUpdateNode,
        setNode: mockSetNode,
        dirtyNodes: new Set<string>(),
      }),
      temporal: { getState: () => ({ pause: mockPause, resume: mockResume }) },
    },
    spatialGridManager: {
      getSlabElevationAt: vi.fn(() => 0),
    },
    cloneLevelSubtree: vi.fn(() => ({ clonedNodes: [], newLevelId: 'level_clone_1' })),
    nodeRegistry: { get: () => ({ deletable: true, capabilities: { deletable: true } }) },
    ItemNode: makeParser('item'),
    WallNode: makeParser('wall'),
    DoorNode: makeParser('door'),
    WindowNode: makeParser('window'),
    LevelNode: makeParser('level'),
    SlabNode: makeParser('slab'),
    CeilingNode: makeParser('ceiling'),
    RoofNode: makeParser('roof'),
    RoofSegmentNode: makeParser('roof-segment'),
    StairNode: makeParser('stair'),
    StairSegmentNode: makeParser('stair-segment'),
    ZoneNode: makeParser('zone'),
    BuildingNode: makeParser('building'),
    ScanNode: makeParser('scan'),
    GuideNode: makeParser('guide'),
    FenceNode: makeParser('fence'),
    ChimneyNode: makeParser('chimney'),
    DormerNode: makeParser('dormer'),
    SkylightNode: makeParser('skylight'),
    SolarPanelNode: makeParser('solar-panel'),
    RidgeVentNode: makeParser('ridge-vent'),
    BoxVentNode: makeParser('box-vent'),
    TurbineVentNode: makeParser('turbine-vent'),
    EyebrowVentNode: makeParser('eyebrow-vent'),
    CupolaNode: makeParser('cupola'),
    GutterNode: makeParser('gutter'),
    DownspoutNode: makeParser('downspout'),
    ElevatorNode: makeParser('elevator'),
    generateId: (prefix: string) => nextId(prefix),
  }
})

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({ selection: { levelId: 'level_1' }, setSelection: vi.fn() }),
  },
}))

vi.mock('nanoid', () => ({
  nanoid: () => 'test-log-id',
  customAlphabet: () => () => 'fixed-id',
}))

vi.mock('../scene-operations-adapter', () => ({
  getSceneOperations: () => ({
    createNode: (node: any, parentId?: string) => mockCreateNode(node, parentId),
    createNodes: (entries: any[]) => mockCreateNodes(entries),
    deleteNode: (id: string, _cascade?: boolean) => mockDeleteNode(id),
    updateNode: (id: string, data: any) => mockUpdateNode(id, data),
    applyPatch: (patches: any[]) => mockApplyPatch(patches),
  }),
  resetSceneOperationsForTesting: vi.fn(),
}))

// Spy on resolveElevatorSupportY so we can assert it is called with the right args.
const supportYSpy = vi.fn(() => 1.25)
vi.mock('../../../lib/elevator-support', () => ({
  resolveCurrentBuildingId: vi.fn(({ buildingId, levelId, nodes }) => {
    if (buildingId) return buildingId
    if (!levelId) return null
    const lvl = nodes[levelId]
    if (lvl?.type === 'level' && lvl.parentId && nodes[lvl.parentId]?.type === 'building') {
      return lvl.parentId
    }
    return null
  }),
  resolveElevatorSupportY: (args: any) => supportYSpy(args),
}))

// ============================================================================
// Test setup
// ============================================================================

import { confirmGhostPreview } from '../preview/confirm-operations'
import { resetPreviewState } from '../preview/ghost-node-helpers'
import type { ValidatedAddElevator, ValidatedOperation, ValidatedUpdateWall } from '../types'

function reset() {
  for (const k of Object.keys(mockNodes)) delete mockNodes[k]
  mockCreatedBatches.length = 0
  mockUpdatedNodes.length = 0
  mockDeletedNodeIds.length = 0
  mockPatchCalls.length = 0
  mockCreateNode.mockClear()
  mockCreateNodes.mockClear()
  mockDeleteNode.mockClear()
  mockUpdateNode.mockClear()
  mockApplyPatch.mockClear()
  mockPause.mockClear()
  mockResume.mockClear()
  supportYSpy.mockClear()
  supportYSpy.mockReturnValue(1.25)
  resetPreviewState()
}

function seedBuildingWithLevels(opts?: { withCustomLevels?: boolean }) {
  // Two-level building. By default level numbers are 1, 0 to verify .sort() works.
  mockNodes['building_1'] = {
    id: 'building_1', type: 'building', parentId: 'site_1',
    children: ['level_top', 'level_bottom'], visible: true, metadata: {}, name: 'Building 1',
  }
  mockNodes['level_top'] = {
    id: 'level_top', type: 'level', parentId: 'building_1',
    children: [], visible: true, metadata: {}, name: 'Top', level: 1,
  }
  mockNodes['level_bottom'] = {
    id: 'level_bottom', type: 'level', parentId: 'building_1',
    children: [], visible: true, metadata: {}, name: 'Bottom', level: 0,
  }
  mockNodes['site_1'] = { id: 'site_1', type: 'site', parentId: null, children: ['building_1'], visible: true, metadata: {} }

  if (opts?.withCustomLevels) {
    // Add a basement at level -1 to verify sort ordering puts it first.
    mockNodes['level_basement'] = {
      id: 'level_basement', type: 'level', parentId: 'building_1',
      children: [], visible: true, metadata: {}, name: 'Basement', level: -1,
    }
    mockNodes['building_1'].children = ['level_top', 'level_bottom', 'level_basement']
  }
}

function makeElevatorOp(overrides?: Partial<ValidatedAddElevator>): ValidatedAddElevator {
  return {
    type: 'add_elevator',
    status: 'valid',
    position: [2, 0, 3],
    rotation: 0,
    width: 1.6,
    depth: 1.6,
    cabHeight: 2.35,
    fromLevelId: null,
    toLevelId: null,
    ...overrides,
  }
}

beforeEach(reset)

// ============================================================================
// add_elevator: resolves target building from explicit buildingId
// ============================================================================

describe('confirmGhostPreview — add_elevator', () => {
  it('resolves target building from explicit buildingId', () => {
    seedBuildingWithLevels()
    // Add a second building to make sure we pick the explicit one, not the first.
    mockNodes['building_other'] = {
      id: 'building_other', type: 'building', parentId: 'site_1',
      children: [], visible: true, metadata: {}, name: 'Other',
    }

    const op: ValidatedAddElevator = makeElevatorOp({ buildingId: 'building_other' })
    confirmGhostPreview([op])

    const elevatorCreate = mockCreatedBatches.flat().find((e) => e.node.type === 'elevator')
    expect(elevatorCreate).toBeDefined()
    expect(elevatorCreate!.parentId).toBe('building_other')
  })

  it("resolves target building from currentLevel when buildingId absent (uses viewer's level_1 parent)", () => {
    // Build a level structure where level_1 (viewer selection) belongs to a specific building.
    mockNodes['building_main'] = {
      id: 'building_main', type: 'building', parentId: 'site_1',
      children: ['level_1'], visible: true, metadata: {}, name: 'Main',
    }
    mockNodes['level_1'] = {
      id: 'level_1', type: 'level', parentId: 'building_main',
      children: [], visible: true, metadata: {}, name: 'L1', level: 0,
    }
    mockNodes['site_1'] = { id: 'site_1', type: 'site', parentId: null, children: ['building_main'], visible: true, metadata: {} }

    const op: ValidatedAddElevator = makeElevatorOp()
    confirmGhostPreview([op])

    const elevatorCreate = mockCreatedBatches.flat().find((e) => e.node.type === 'elevator')
    expect(elevatorCreate).toBeDefined()
    expect(elevatorCreate!.parentId).toBe('building_main')
  })

  it('skips silently when no building is resolvable (orphan level)', () => {
    // Viewer points at level_1 but its parent is not a building → resolveCurrentBuildingId returns null.
    mockNodes['level_1'] = {
      id: 'level_1', type: 'level', parentId: 'orphan_parent',
      children: [], visible: true, metadata: {}, level: 0,
    }

    const op: ValidatedAddElevator = makeElevatorOp()
    const log = confirmGhostPreview([op])

    // No createNodes/applyPatch call should include an elevator.
    const anyElevator = mockCreatedBatches.flat().find((e) => e.node?.type === 'elevator')
    expect(anyElevator).toBeUndefined()
    // The log records no created elevator id.
    expect(log.createdNodeIds).toEqual([])
  })

  it('computes fromIdx/toIdx from levels sorted by level number (a.level - b.level)', () => {
    // Order children deliberately top-first so .sort() must reorder to bottom-first.
    seedBuildingWithLevels({ withCustomLevels: true })
    // Children order: level_top (1), level_bottom (0), level_basement (-1)
    // After sort by level number: basement (-1), bottom (0), top (1)

    const op = makeElevatorOp({
      buildingId: 'building_1',
      fromLevelId: 'level_basement',
      toLevelId: 'level_top',
    })
    confirmGhostPreview([op])

    const elevatorCreate = mockCreatedBatches.flat().find((e) => e.node.type === 'elevator')!
    // fromLevelId must be the sorted-first match for 'level_basement'.
    expect(elevatorCreate.node.fromLevelId).toBe('level_basement')
    // toLevelId must be the sorted-last 'level_top'.
    expect(elevatorCreate.node.toLevelId).toBe('level_top')
    // defaultLevelId follows fromLevelId.
    expect(elevatorCreate.node.defaultLevelId).toBe('level_basement')
  })

  it('defaults toLevelId to the level immediately above fromIdx when not specified', () => {
    seedBuildingWithLevels({ withCustomLevels: true })
    // Sorted: basement(-1), bottom(0), top(1). When from=bottom, default to should = top.

    const op = makeElevatorOp({
      buildingId: 'building_1',
      fromLevelId: 'level_bottom',
      // toLevelId intentionally omitted
    })
    confirmGhostPreview([op])

    const elevatorCreate = mockCreatedBatches.flat().find((e) => e.node.type === 'elevator')!
    expect(elevatorCreate.node.fromLevelId).toBe('level_bottom')
    expect(elevatorCreate.node.toLevelId).toBe('level_top')
  })

  it('uses resolveElevatorSupportY to set the elevator Y position', () => {
    seedBuildingWithLevels()
    supportYSpy.mockReturnValueOnce(2.5)

    const op = makeElevatorOp({ buildingId: 'building_1', position: [4, 0, 7] })
    confirmGhostPreview([op])

    expect(supportYSpy).toHaveBeenCalledTimes(1)
    const args = supportYSpy.mock.calls[0]![0] as { buildingId: string; x: number; z: number }
    expect(args.buildingId).toBe('building_1')
    expect(args.x).toBe(4)
    expect(args.z).toBe(7)

    const elevatorCreate = mockCreatedBatches.flat().find((e) => e.node.type === 'elevator')!
    expect(elevatorCreate.node.position).toEqual([4, 2.5, 7])
  })

  it('names elevator "Elevator N" from the current elevator count + 1', () => {
    seedBuildingWithLevels()
    // Pre-seed two elevators so the new one becomes #3.
    mockNodes['elev_a'] = { id: 'elev_a', type: 'elevator', parentId: 'building_1' }
    mockNodes['elev_b'] = { id: 'elev_b', type: 'elevator', parentId: 'building_1' }

    const op = makeElevatorOp({ buildingId: 'building_1' })
    confirmGhostPreview([op])

    const elevatorCreate = mockCreatedBatches.flat().find((e) => e.node.type === 'elevator' && e.node.id !== 'elev_a' && e.node.id !== 'elev_b')!
    expect(elevatorCreate.node.name).toBe('Elevator 3')
  })

  it('forwards optional shaftStyle/doorStyle/doorPanelStyle fields when provided', () => {
    seedBuildingWithLevels()

    const op = makeElevatorOp({
      buildingId: 'building_1',
      shaftStyle: 'glass',
      doorStyle: 'single-left',
      doorPanelStyle: 'glass-frame',
      servedLevelIds: ['level_bottom', 'level_top'],
    })
    confirmGhostPreview([op])

    const elevatorCreate = mockCreatedBatches.flat().find((e) => e.node.type === 'elevator')!
    expect(elevatorCreate.node.shaftStyle).toBe('glass')
    expect(elevatorCreate.node.doorStyle).toBe('single-left')
    expect(elevatorCreate.node.doorPanelStyle).toBe('glass-frame')
    expect(elevatorCreate.node.servedLevelIds).toEqual(['level_bottom', 'level_top'])
  })
})

// ============================================================================
// update_wall: height change cascades to ceilings on the same level.
// QA-AI 2026-05-01 Issue-C regression guard.
// ============================================================================

describe('confirmGhostPreview — update_wall propagates height to ceilings', () => {
  it("changes ceiling.height on the same level when wall.height changes", () => {
    mockNodes['level_a'] = {
      id: 'level_a', type: 'level', parentId: 'building_1',
      children: ['wall_a', 'ceil_a'], visible: true, metadata: {}, level: 0,
    }
    mockNodes['wall_a'] = {
      id: 'wall_a', type: 'wall', parentId: 'level_a',
      visible: true, metadata: {}, start: [0, 0], end: [3, 0], thickness: 0.2, height: 2.4,
    }
    mockNodes['ceil_a'] = {
      id: 'ceil_a', type: 'ceiling', parentId: 'level_a',
      visible: true, metadata: {}, polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], height: 2.4,
    }
    mockNodes['ceil_other'] = {
      // Different level — should NOT be touched.
      id: 'ceil_other', type: 'ceiling', parentId: 'level_b',
      visible: true, metadata: {}, polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], height: 2.4,
    }

    const op: ValidatedUpdateWall = {
      type: 'update_wall',
      status: 'valid',
      nodeId: 'wall_a' as any,
      height: 3.2,
    } as ValidatedUpdateWall

    confirmGhostPreview([op as ValidatedOperation])

    // The ceiling on the SAME level must have been updated to the new height.
    const ceilUpdate = mockUpdatedNodes.findLast((u) => u.id === 'ceil_a' && u.data?.height !== undefined)
    expect(ceilUpdate).toBeDefined()
    expect((ceilUpdate!.data as any).height).toBe(3.2)

    // Ceiling on a DIFFERENT level must remain untouched.
    const ceilOther = mockUpdatedNodes.find((u) => u.id === 'ceil_other' && u.data?.height !== undefined)
    expect(ceilOther).toBeUndefined()
  })

  it('does not re-write ceiling.height when it already matches the new wall height', () => {
    mockNodes['level_a'] = {
      id: 'level_a', type: 'level', parentId: 'building_1',
      children: [], visible: true, metadata: {}, level: 0,
    }
    mockNodes['wall_a'] = {
      id: 'wall_a', type: 'wall', parentId: 'level_a',
      visible: true, metadata: {}, start: [0, 0], end: [3, 0], thickness: 0.2, height: 2.8,
    }
    mockNodes['ceil_already_matching'] = {
      id: 'ceil_already_matching', type: 'ceiling', parentId: 'level_a',
      visible: true, metadata: {}, polygon: [], height: 3.0,
    }

    const op: ValidatedUpdateWall = {
      type: 'update_wall',
      status: 'valid',
      nodeId: 'wall_a' as any,
      height: 3.0,
    } as ValidatedUpdateWall

    confirmGhostPreview([op as ValidatedOperation])

    const ceilUpdate = mockUpdatedNodes.find(
      (u) => u.id === 'ceil_already_matching' && u.data?.height !== undefined,
    )
    expect(ceilUpdate).toBeUndefined()
  })
})
