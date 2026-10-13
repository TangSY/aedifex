/**
 * confirmGhostPreview — add_roof_accessory case for the v0.9.1 upstream kinds.
 *
 * Covers the executor dispatch for the five new kinds:
 *  - turbine-vent: the unified tool's `width` maps to the schema's `diameter`
 *    (no width/depth on TurbineVentNode)
 *  - eyebrow-vent / cupola: plain width/depth passthrough, parented to the segment
 *  - gutter: eave-snapped position/rotation + `length` stored verbatim
 *  - downspout: drills a NEW outlet into the host gutter (gutter marked dirty),
 *    then creates the downspout linked via gutterId/outletId, parented to the
 *    gutter's roof-segment — mirrors packages/nodes/src/downspout/tool.tsx
 *  - several downspouts on one gutter accumulate outlets (live gutter read)
 *  - invalid ops are skipped
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockNodes: Record<string, any> = {}
const mockCreatedBatches: Array<Array<{ node: any; parentId: string | null }>> = []
const mockUpdatedNodes: Array<{ id: string; data: any }> = []
const mockDirtyNodes = new Set<string>()

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
})

const mockUpdateNode = vi.fn((id: string, data: any) => {
  if (mockNodes[id]) mockNodes[id] = { ...mockNodes[id], ...data }
  mockUpdatedNodes.push({ id, data })
})

vi.mock('@aedifex/core', () => {
  const makeParser = (typeName: string) => ({
    parse: (data: any) => ({
      ...data,
      id: data.id ?? nextId(typeName),
      type: typeName,
      parentId: data.parentId ?? null,
      visible: data.visible ?? true,
      metadata: data.metadata ?? {},
      children: data.children ?? [],
    }),
  })

  return {
    useScene: {
      getState: () => ({
        nodes: mockNodes,
        createNode: mockCreateNode,
        createNodes: mockCreateNodes,
        deleteNode: mockDeleteNode,
        updateNode: mockUpdateNode,
        // undoConfirmedOperation restores snapshots via setNode (full replace)
        setNode: vi.fn((id: string, node: any) => {
          mockNodes[id] = node
        }),
        dirtyNodes: mockDirtyNodes,
      }),
      temporal: { getState: () => ({ pause: vi.fn(), resume: vi.fn() }) },
    },
    spatialGridManager: { getSlabElevationAt: vi.fn(() => 0) },
    cloneLevelSubtree: vi.fn(() => ({ clonedNodes: [], newLevelId: 'level_clone_1' })),
    nodeRegistry: { get: () => ({ capabilities: { deletable: true } }) },
    generateId: (prefix: string) => nextId(prefix),
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
    deleteNode: (id: string) => mockDeleteNode(id),
    updateNode: (id: string, data: any) => mockUpdateNode(id, data),
    // confirmGhostPreview flushes batchCreates through applyPatch — honor the
    // create patches against the in-memory store and record them as a batch.
    applyPatch: (patches: any[]) => {
      mockCreateNodes(
        patches
          .filter((p) => p.op === 'create')
          .map((p) => ({ node: p.node, parentId: p.parentId ?? null })),
      )
    },
  }),
  resetSceneOperationsForTesting: vi.fn(),
}))

vi.mock('../../../lib/elevator-support', () => ({
  resolveCurrentBuildingId: vi.fn(() => null),
  resolveElevatorSupportY: vi.fn(() => 0),
}))

// ============================================================================
// Test setup
// ============================================================================

import { confirmGhostPreview, undoConfirmedOperation } from '../preview/confirm-operations'
import { resetPreviewState } from '../preview/ghost-node-helpers'
import type { ValidatedAddRoofAccessory } from '../types/validated-types'

function reset() {
  for (const k of Object.keys(mockNodes)) delete mockNodes[k]
  mockCreatedBatches.length = 0
  mockUpdatedNodes.length = 0
  mockDirtyNodes.clear()
  mockCreateNode.mockClear()
  mockCreateNodes.mockClear()
  mockDeleteNode.mockClear()
  mockUpdateNode.mockClear()
  resetPreviewState()
}

beforeEach(reset)

function seedSegment() {
  mockNodes['rseg_1'] = {
    id: 'rseg_1', type: 'roof-segment', parentId: 'roof_1', children: [],
    visible: true, metadata: {}, roofType: 'gable',
    width: 8, depth: 6, wallHeight: 2.5, overhang: 0.3, pitch: 40,
  }
}

function seedGutter(id = 'gutter_1', outlets: any[] = []) {
  mockNodes[id] = {
    id, type: 'gutter', parentId: 'rseg_1', children: [],
    visible: true, metadata: {}, roofSegmentId: 'rseg_1',
    position: [0, 2.5, 3.26], rotation: 0, length: 2.0, size: 0.13, outlets,
  }
}

function makeOp(overrides: Partial<ValidatedAddRoofAccessory>): ValidatedAddRoofAccessory {
  return {
    type: 'add_roof_accessory',
    status: 'valid',
    kind: 'turbine-vent',
    roofSegmentId: 'rseg_1',
    position: [1, 0, 1],
    rotation: 0,
    width: 0.32,
    depth: 0.32,
    ...overrides,
  }
}

function createdOfType(type: string) {
  return mockCreatedBatches.flat().filter((e) => e.node.type === type)
}

// ============================================================================
// Point kinds
// ============================================================================

describe('confirmGhostPreview — add_roof_accessory (new point kinds)', () => {
  it('turbine-vent: maps the tool width onto the schema diameter', () => {
    seedSegment()
    confirmGhostPreview([makeOp({ kind: 'turbine-vent', width: 0.45, depth: 0.45 })])

    const [created] = createdOfType('turbine-vent')
    expect(created).toBeDefined()
    expect(created!.node.diameter).toBeCloseTo(0.45)
    expect(created!.node.width).toBeUndefined()
    expect(created!.node.depth).toBeUndefined()
    expect(created!.parentId).toBe('rseg_1')
    expect(created!.node.roofSegmentId).toBe('rseg_1')
  })

  it.each(['eyebrow-vent', 'cupola'] as const)(
    '%s: passes width/depth through and parents to the segment',
    (kind) => {
      seedSegment()
      confirmGhostPreview([makeOp({ kind, width: 0.9, depth: 1.1, position: [2, 0, -1] })])

      const [created] = createdOfType(kind)
      expect(created).toBeDefined()
      expect(created!.node.width).toBeCloseTo(0.9)
      expect(created!.node.depth).toBeCloseTo(1.1)
      expect(created!.node.position).toEqual([2, 0, -1])
      expect(created!.parentId).toBe('rseg_1')
    },
  )
})

// ============================================================================
// Gutter
// ============================================================================

describe('confirmGhostPreview — add_roof_accessory kind=gutter', () => {
  it('stores the eave-snapped position/rotation and the run length', () => {
    seedSegment()
    confirmGhostPreview([
      makeOp({
        kind: 'gutter',
        position: [1.5, 2.29, 3.26],
        rotation: Math.PI,
        width: 0.13,
        depth: 0.13,
        length: 4.5,
      }),
    ])

    const [created] = createdOfType('gutter')
    expect(created).toBeDefined()
    expect(created!.node.position).toEqual([1.5, 2.29, 3.26])
    expect(created!.node.rotation).toBeCloseTo(Math.PI)
    expect(created!.node.length).toBeCloseTo(4.5)
    expect(created!.parentId).toBe('rseg_1')
    // width/depth are tool bookkeeping, not gutter schema fields
    expect(created!.node.width).toBeUndefined()
  })
})

// ============================================================================
// Downspout
// ============================================================================

describe('confirmGhostPreview — add_roof_accessory kind=downspout', () => {
  function downspoutOp(overrides: Partial<ValidatedAddRoofAccessory> = {}) {
    return makeOp({
      kind: 'downspout',
      gutterId: 'gutter_1',
      outletOffset: 0.4,
      length: 2.33,
      width: 0.07,
      depth: 0.07,
      ...overrides,
    })
  }

  it('drills a new outlet into the host gutter and marks it dirty', () => {
    seedSegment()
    seedGutter()
    confirmGhostPreview([downspoutOp()])

    const gutterUpdate = mockUpdatedNodes.find((u) => u.id === 'gutter_1')
    expect(gutterUpdate).toBeDefined()
    expect(gutterUpdate!.data.outlets).toHaveLength(1)
    expect(gutterUpdate!.data.outlets[0].offset).toBeCloseTo(0.4)
    expect(gutterUpdate!.data.outlets[0].diameter).toBeCloseTo(0.07)
    expect(mockDirtyNodes.has('gutter_1')).toBe(true)
  })

  it('creates the downspout linked to the drilled outlet, parented to the segment', () => {
    seedSegment()
    seedGutter()
    confirmGhostPreview([downspoutOp()])

    const [created] = createdOfType('downspout')
    expect(created).toBeDefined()
    expect(created!.node.gutterId).toBe('gutter_1')
    expect(created!.node.length).toBeCloseTo(2.33)
    expect(created!.node.diameter).toBeCloseTo(0.07)
    expect(created!.parentId).toBe('rseg_1')

    // outletId must reference the outlet that was drilled into the gutter
    const gutterUpdate = mockUpdatedNodes.find((u) => u.id === 'gutter_1')
    expect(created!.node.outletId).toBe(gutterUpdate!.data.outlets[0].id)
  })

  it('accumulates outlets when two downspouts target the same gutter in one batch', () => {
    seedSegment()
    seedGutter()
    confirmGhostPreview([
      downspoutOp({ outletOffset: -0.6 }),
      downspoutOp({ outletOffset: 0.6 }),
    ])

    // The second update must contain BOTH outlets (live gutter read, no clobber).
    const updates = mockUpdatedNodes.filter((u) => u.id === 'gutter_1')
    expect(updates).toHaveLength(2)
    expect(updates[1]!.data.outlets).toHaveLength(2)
    expect(createdOfType('downspout')).toHaveLength(2)
  })

  it('skips silently when the host gutter vanished before confirm', () => {
    seedSegment()
    confirmGhostPreview([downspoutOp({ gutterId: 'gutter_ghost' })])
    expect(createdOfType('downspout')).toHaveLength(0)
    expect(mockUpdatedNodes.filter((u) => u.id.startsWith('gutter'))).toHaveLength(0)
  })

  it('skips invalid operations entirely', () => {
    seedSegment()
    seedGutter()
    confirmGhostPreview([downspoutOp({ status: 'invalid', errorReason: 'nope' })])
    expect(createdOfType('downspout')).toHaveLength(0)
    expect(mockUpdatedNodes).toHaveLength(0)
  })

  it('undo restores the host gutter outlets (no orphaned drill holes)', () => {
    seedSegment()
    seedGutter() // outlets: []

    const log = confirmGhostPreview([downspoutOp()])

    // Sanity: confirm drilled one outlet into the live gutter.
    expect(mockNodes['gutter_1'].outlets).toHaveLength(1)
    // The host gutter must be in the undo snapshot even though the op has no nodeId.
    expect(log.previousSnapshot['gutter_1' as keyof typeof log.previousSnapshot]).toBeDefined()

    undoConfirmedOperation(log)

    // Downspout deleted AND the gutter's outlets restored to the pre-op state.
    expect(mockNodes['gutter_1'].outlets).toHaveLength(0)
  })

  it('undo restores pre-existing outlets without dropping them', () => {
    seedSegment()
    seedGutter('gutter_1', [{ id: 'outlet_pre', offset: -0.8, diameter: 0.07 }])

    const log = confirmGhostPreview([downspoutOp({ outletOffset: 0.5 })])
    expect(mockNodes['gutter_1'].outlets).toHaveLength(2)

    undoConfirmedOperation(log)

    expect(mockNodes['gutter_1'].outlets).toHaveLength(1)
    expect(mockNodes['gutter_1'].outlets[0].id).toBe('outlet_pre')
  })
})
