/**
 * clearGhostPreview restoration behavior — regression coverage.
 *
 * Scenarios:
 *  1. clearGhostPreview restores moved item (has 'position' field) — happy path.
 *  2. clearGhostPreview SKIPS restore for material previews (no 'position' field
 *     on the wall node) — current behavior is to leave previewMaterial flag in
 *     metadata, which is a latent bug. The test pins the behavior and notes[]
 *     explains the gap.
 *  3. clearGhostPreview restores remove_node previews (visible=true).
 *  4. confirmGhostPreview pauses → resumes Zundo so the batch is a single undo.
 *  5. batch_operations applyPatch ordering: parent creations land before
 *     children in the same batch — pins parent-before-child invariant.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockNodes: Record<string, any> = {}
const mockUpdatedNodes: Array<{ id: string; data: any }> = []
const mockDeletedNodeIds: string[] = []
const mockPatchCalls: any[][] = []
const mockCreatedBatches: any[][] = []

let _idCounter = 0
const nextId = (p: string) => `${p}_mock_${++_idCounter}`

const mockCreateNode = vi.fn((node: any, parentId?: string) => {
  mockNodes[node.id] = { ...node, parentId: parentId ?? null }
})
const mockCreateNodes = vi.fn((entries: any[]) => {
  for (const e of entries) mockNodes[e.node.id] = { ...e.node, parentId: e.parentId ?? null }
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
const mockSetNode = vi.fn((id: string, node: any) => { mockNodes[id] = { ...node } })
const mockApplyPatch = vi.fn((patches: any[]) => {
  mockPatchCalls.push(patches)
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
        setNode: mockSetNode,
      }),
      temporal: { getState: () => ({ pause: mockPause, resume: mockResume }) },
    },
    spatialGridManager: { getSlabElevationAt: vi.fn(() => 0) },
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
    ElevatorNode: makeParser('elevator'),
  }
})

vi.mock('@aedifex/viewer', () => ({
  useViewer: { getState: () => ({ selection: { levelId: 'level_root' }, setSelection: vi.fn() }) },
}))

vi.mock('nanoid', () => ({ nanoid: () => 'test-log-id', customAlphabet: () => () => 'fixed' }))

vi.mock('../scene-operations-adapter', () => ({
  getSceneOperations: () => ({
    createNode: (n: any, p?: string) => mockCreateNode(n, p),
    createNodes: (e: any[]) => mockCreateNodes(e),
    deleteNode: (id: string) => mockDeleteNode(id),
    updateNode: (id: string, d: any) => mockUpdateNode(id, d),
    applyPatch: (p: any[]) => mockApplyPatch(p),
  }),
  resetSceneOperationsForTesting: vi.fn(),
}))

vi.mock('../../../lib/elevator-support', () => ({
  resolveCurrentBuildingId: () => null,
  resolveElevatorSupportY: () => 0,
}))

import {
  applyGhostPreview,
  clearGhostPreview,
  confirmGhostPreview,
  isGhostPreviewActive,
} from '../ai-preview-manager'
import type { ValidatedOperation } from '../types'

function reset() {
  for (const k of Object.keys(mockNodes)) delete mockNodes[k]
  mockUpdatedNodes.length = 0
  mockDeletedNodeIds.length = 0
  mockPatchCalls.length = 0
  mockCreatedBatches.length = 0
  mockCreateNode.mockClear()
  mockCreateNodes.mockClear()
  mockDeleteNode.mockClear()
  mockUpdateNode.mockClear()
  mockSetNode.mockClear()
  mockApplyPatch.mockClear()
  mockPause.mockClear()
  mockResume.mockClear()
  if (isGhostPreviewActive()) clearGhostPreview()
}

beforeEach(reset)

// ============================================================================
// 1) Happy path: move_item restores position on clear
// ============================================================================

describe('clearGhostPreview — restore happy path', () => {
  it('restores moved item back to its original position', () => {
    mockNodes['item_a'] = {
      id: 'item_a', type: 'item', visible: true, metadata: {},
      position: [1, 0, 1], rotation: [0, 0, 0],
    }

    applyGhostPreview([{
      type: 'move_item', status: 'valid', nodeId: 'item_a' as any,
      position: [5, 0, 5], rotation: [0, 0, 0],
    } as ValidatedOperation])

    expect(mockUpdatedNodes.find((u) => u.id === 'item_a' && (u.data as any).position?.[0] === 5)).toBeDefined()

    clearGhostPreview()

    // clearGhostPreview now routes restore through setNode (full snapshot
    // replace) rather than updateNode, so we assert on the resulting node
    // state instead of the updateNode call log.
    expect(mockNodes['item_a'].position).toEqual([1, 0, 1])
    expect(mockSetNode).toHaveBeenCalledWith('item_a', expect.objectContaining({ position: [1, 0, 1] }))
  })

  it('resumes Zundo on clear (so abandoned preview does not leave temporal paused)', () => {
    mockNodes['item_b'] = { id: 'item_b', type: 'item', visible: true, metadata: {}, position: [0, 0, 0], rotation: [0, 0, 0] }
    applyGhostPreview([{
      type: 'move_item', status: 'valid', nodeId: 'item_b' as any,
      position: [3, 0, 3], rotation: [0, 0, 0],
    } as ValidatedOperation])

    expect(mockPause).toHaveBeenCalled()

    clearGhostPreview()
    expect(mockResume).toHaveBeenCalled()
  })

  it('restores removed node visibility (visible=true) on clear', () => {
    mockNodes['item_c'] = { id: 'item_c', type: 'item', visible: true, metadata: {}, children: [] }
    applyGhostPreview([{ type: 'remove_item', status: 'valid', nodeId: 'item_c' as any } as ValidatedOperation])

    clearGhostPreview()

    const restore = mockUpdatedNodes
      .filter((u) => u.id === 'item_c')
      .findLast((u) => (u.data as any).visible === true)
    expect(restore).toBeDefined()
  })
})

// ============================================================================
// 2) Position-less nodes (walls, ceilings, zones) ARE now restored on clear.
//    Previously clearGhostPreview gated restore on `'position' in originalState`,
//    so wall material previews and geometry-only updates leaked into the live
//    scene when the user rejected. Fix uses setNode for a full snapshot replace.
// ============================================================================

describe('clearGhostPreview — restores nodes without a position field', () => {
  it('restores a wall material preview via setNode (previewMaterial cleared)', () => {
    mockNodes['wall_mat'] = {
      id: 'wall_mat', type: 'wall', visible: true,
      metadata: { userTag: 'kitchen-wall' },
      start: [0, 0], end: [3, 0], thickness: 0.2, height: 2.8,
    }

    applyGhostPreview([{
      type: 'update_material', status: 'valid',
      nodeId: 'wall_mat' as any, material: '#ff0000',
    } as ValidatedOperation])

    // applyGhostPreview pollutes the wall with previewMaterial.
    expect((mockNodes['wall_mat'].metadata as any).previewMaterial).toBe('#ff0000')

    clearGhostPreview()

    // After clear, the preview metadata is gone and the original userTag is
    // back. setNode was called with the snapshot taken before applyGhostPreview.
    expect(mockSetNode).toHaveBeenCalledWith('wall_mat', expect.objectContaining({
      id: 'wall_mat',
      type: 'wall',
      metadata: expect.objectContaining({ userTag: 'kitchen-wall' }),
    }))
    expect((mockNodes['wall_mat'].metadata as any).previewMaterial).toBeUndefined()
  })

  it('restores a wall geometry update (height/start/end) via setNode', () => {
    mockNodes['wall_geom'] = {
      id: 'wall_geom', type: 'wall', visible: true, metadata: {},
      start: [0, 0], end: [3, 0], thickness: 0.2, height: 2.4,
    }

    applyGhostPreview([{
      type: 'update_wall', status: 'valid',
      nodeId: 'wall_geom' as any, height: 3.5,
    } as ValidatedOperation])

    expect((mockNodes['wall_geom'] as any).height).toBe(3.5)

    clearGhostPreview()

    // Snapshot restored — height is back to the pre-preview value.
    expect(mockSetNode).toHaveBeenCalledWith('wall_geom', expect.objectContaining({
      id: 'wall_geom',
      height: 2.4,
    }))
    expect((mockNodes['wall_geom'] as any).height).toBe(2.4)
  })
})

// ============================================================================
// 3) confirmGhostPreview pause→resume sequencing
// ============================================================================

describe('confirmGhostPreview — Zundo pause/resume sequencing', () => {
  it('resumes Zundo so the confirm batch becomes a single undoable action', () => {
    mockNodes['level_root'] = { id: 'level_root', type: 'level', parentId: null, visible: true, metadata: {}, children: [], level: 0 }

    applyGhostPreview([])
    expect(mockPause).toHaveBeenCalled()

    confirmGhostPreview([])
    expect(mockResume).toHaveBeenCalled()
  })

  it('confirm clears isPreviewActive so subsequent applyGhostPreview is a fresh slate', () => {
    mockNodes['level_root'] = { id: 'level_root', type: 'level', parentId: null, visible: true, metadata: {}, children: [], level: 0 }

    applyGhostPreview([])
    expect(isGhostPreviewActive()).toBe(true)
    confirmGhostPreview([])
    expect(isGhostPreviewActive()).toBe(false)
  })
})

// ============================================================================
// 4) Parent-before-child applyPatch ordering for confirm batches.
//    add_wall + add_door issued in the same batch_operations call: at
//    validation time the validator REJECTS add_door because the wall does not
//    yet exist (current limitation — pinned in notes[]). At confirm time, when
//    both ops reach confirmGhostPreview as already-valid entries (e.g. supplied
//    independently after the wall exists), the applyPatch payload must list
//    the wall first so the door's parentId resolves.
// ============================================================================

describe('confirmGhostPreview — parent-before-child applyPatch ordering', () => {
  it('applyPatch payload places add_wall create before add_door create', () => {
    mockNodes['level_root'] = { id: 'level_root', type: 'level', parentId: null, visible: true, metadata: {}, children: [], level: 0 }

    const ops: ValidatedOperation[] = [
      {
        type: 'add_wall', status: 'valid',
        start: [0, 0], end: [3, 0], thickness: 0.2,
      } as ValidatedOperation,
      {
        type: 'add_door', status: 'valid',
        wallId: 'wall_pending' as any,
        localX: 1, localY: 1.05, width: 0.9, height: 2.1,
        side: 'front', hingesSide: 'left', swingDirection: 'inward',
      } as ValidatedOperation,
    ]

    confirmGhostPreview(ops)

    expect(mockPatchCalls.length).toBeGreaterThan(0)
    const patch = mockPatchCalls[mockPatchCalls.length - 1]!
    const wallIdx = patch.findIndex((p: any) => p.op === 'create' && p.node?.type === 'wall')
    const doorIdx = patch.findIndex((p: any) => p.op === 'create' && p.node?.type === 'door')
    expect(wallIdx).toBeGreaterThanOrEqual(0)
    expect(doorIdx).toBeGreaterThanOrEqual(0)
    expect(wallIdx).toBeLessThan(doorIdx)
  })
})
