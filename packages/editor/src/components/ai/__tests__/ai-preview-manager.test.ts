import { describe, expect, it, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks — fully self-contained, no importOriginal to avoid three.js loading
// ============================================================================

const mockNodes: Record<string, any> = {}
const mockCreatedNodes: any[] = []
const mockDeletedNodeIds: string[] = []
const mockUpdatedNodes: Array<{ id: string; data: unknown }> = []

const mockCreateNode = vi.fn((node: any, _parentId?: string) => {
  mockNodes[node.id] = { ...node, parentId: _parentId ?? null }
  mockCreatedNodes.push(mockNodes[node.id])
})

const mockCreateNodes = vi.fn((entries: Array<{ node: any; parentId: string | null }>) => {
  for (const entry of entries) {
    mockNodes[entry.node.id] = { ...entry.node, parentId: entry.parentId ?? null }
    mockCreatedNodes.push(mockNodes[entry.node.id])
  }
})

const mockDeleteNode = vi.fn((id: string) => {
  delete mockNodes[id]
  mockDeletedNodeIds.push(id)
})

const mockUpdateNode = vi.fn((id: string, data: unknown) => {
  if (mockNodes[id]) {
    mockNodes[id] = { ...mockNodes[id], ...(data as object) }
  }
  mockUpdatedNodes.push({ id, data })
})

const mockPause = vi.fn()
const mockResume = vi.fn()

// Deterministic ID counter for mock parse functions
let _idCounter = 0

vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => ({
      nodes: mockNodes,
      createNode: mockCreateNode,
      createNodes: mockCreateNodes,
      deleteNode: mockDeleteNode,
      updateNode: mockUpdateNode,
      setNode: vi.fn((id: string, node: any) => {
        mockNodes[id] = { ...node }
        mockUpdatedNodes.push({ id, data: node })
      }),
    }),
    temporal: {
      getState: () => ({ pause: mockPause, resume: mockResume }),
    },
  },
  ItemNode: {
    parse: vi.fn((data: any) => {
      _idCounter++
      return {
        id: data.id ?? `item_mock_${_idCounter}`,
        type: 'item',
        object: 'node',
        parentId: null,
        visible: true,
        metadata: data.metadata ?? {},
        name: data.name ?? '',
        asset: data.asset ?? {},
        position: data.position ?? [0, 0, 0],
        rotation: data.rotation ?? [0, 0, 0],
        scale: [1, 1, 1],
        children: [],
      }
    }),
  },
  // WallNode is imported as WallSchema in ai-preview-manager.ts
  WallNode: {
    parse: vi.fn((data: any) => {
      _idCounter++
      return {
        id: data.id ?? `wall_mock_${_idCounter}`,
        type: 'wall',
        object: 'node',
        parentId: null,
        visible: true,
        metadata: data.metadata ?? {},
        name: data.name ?? '',
        start: data.start ?? [0, 0],
        end: data.end ?? [1, 0],
        thickness: data.thickness,
        height: data.height,
        children: [],
        frontSide: 'unknown',
        backSide: 'unknown',
      }
    }),
  },
  DoorNode: {
    parse: vi.fn((data: any) => {
      _idCounter++
      return {
        id: data.id ?? `door_mock_${_idCounter}`,
        type: 'door',
        object: 'node',
        parentId: data.parentId ?? null,
        visible: true,
        metadata: data.metadata ?? {},
        position: data.position ?? [0, 0, 0],
        rotation: data.rotation ?? [0, 0, 0],
        side: data.side,
        wallId: data.wallId,
        width: data.width ?? 0.9,
        height: data.height ?? 2.1,
        hingesSide: data.hingesSide ?? 'left',
        swingDirection: data.swingDirection ?? 'inward',
      }
    }),
  },
  WindowNode: {
    parse: vi.fn((data: any) => {
      _idCounter++
      return {
        id: data.id ?? `window_mock_${_idCounter}`,
        type: 'window',
        object: 'node',
        parentId: data.parentId ?? null,
        visible: true,
        metadata: data.metadata ?? {},
        position: data.position ?? [0, 0, 0],
        rotation: data.rotation ?? [0, 0, 0],
        side: data.side,
        wallId: data.wallId,
        width: data.width ?? 1.5,
        height: data.height ?? 1.5,
      }
    }),
  },
}))

vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({
      selection: { levelId: 'level_1' },
    }),
  },
}))

vi.mock('nanoid', () => ({ nanoid: () => 'test-log-id' }))

import {
  applyGhostPreview,
  clearGhostPreview,
  confirmGhostPreview,
  isGhostPreviewActive,
  undoConfirmedOperation,
} from '../ai-preview-manager'
import type { ValidatedAddItem, ValidatedAddWall, ValidatedOperation } from '../types'

// ============================================================================
// Helpers
// ============================================================================

function makeAddItemOp(overrides?: Partial<ValidatedAddItem>): ValidatedAddItem {
  return {
    type: 'add_item',
    status: 'valid',
    position: [1, 0, 2],
    rotation: [0, 0, 0],
    asset: {
      id: 'sofa-modern',
      category: 'furniture',
      name: 'Modern Sofa',
      thumbnail: '',
      src: '',
      dimensions: [2.2, 0.9, 0.9],
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    ...overrides,
  }
}

function makeAddWallOp(overrides?: Partial<ValidatedAddWall>): ValidatedAddWall {
  return {
    type: 'add_wall',
    status: 'valid',
    start: [0, 0],
    end: [3, 0],
    thickness: 0.2,
    ...overrides,
  }
}

function resetMockState() {
  for (const key of Object.keys(mockNodes)) delete mockNodes[key]
  mockCreatedNodes.length = 0
  mockDeletedNodeIds.length = 0
  mockUpdatedNodes.length = 0
  mockCreateNode.mockClear()
  mockCreateNodes.mockClear()
  mockDeleteNode.mockClear()
  mockUpdateNode.mockClear()
  mockPause.mockClear()
  mockResume.mockClear()
}

beforeEach(() => {
  resetMockState()
  // Ensure preview state is cleared from prior tests
  clearGhostPreview()
  resetMockState()
})

// ============================================================================
// isGhostPreviewActive
// ============================================================================

describe('isGhostPreviewActive', () => {
  it('returns false initially', () => {
    expect(isGhostPreviewActive()).toBe(false)
  })

  it('returns true after applyGhostPreview', () => {
    applyGhostPreview([makeAddItemOp()])
    expect(isGhostPreviewActive()).toBe(true)
  })

  it('returns false after clearGhostPreview', () => {
    applyGhostPreview([makeAddItemOp()])
    clearGhostPreview()
    expect(isGhostPreviewActive()).toBe(false)
  })
})

// ============================================================================
// applyGhostPreview — add_item
// ============================================================================

describe('applyGhostPreview — add_item', () => {
  it('creates ghost node with isGhostPreview metadata', () => {
    applyGhostPreview([makeAddItemOp()])

    expect(mockCreateNode).toHaveBeenCalledTimes(1)
    const createdArg = mockCreateNode.mock.calls[0]![0]
    expect(createdArg.metadata?.isGhostPreview).toBe(true)
    expect(createdArg.metadata?.isTransient).toBe(true)
  })

  it('returns array of affected node IDs', () => {
    const ids = applyGhostPreview([makeAddItemOp()])
    expect(ids).toHaveLength(1)
    expect(typeof ids[0]).toBe('string')
  })

  it('skips invalid operations', () => {
    const invalidOp: ValidatedAddItem = {
      ...makeAddItemOp(),
      status: 'invalid',
      errorReason: 'not found',
    }

    const ids = applyGhostPreview([invalidOp])
    expect(ids).toHaveLength(0)
    expect(mockCreateNode).not.toHaveBeenCalled()
  })

  it('creates ghost nodes for multiple operations', () => {
    const ids = applyGhostPreview([makeAddItemOp(), makeAddItemOp()])
    expect(ids).toHaveLength(2)
    expect(mockCreateNode).toHaveBeenCalledTimes(2)
  })

  it('pauses Zundo tracking', () => {
    applyGhostPreview([makeAddItemOp()])
    expect(mockPause).toHaveBeenCalled()
  })
})

// ============================================================================
// applyGhostPreview — add_wall
// ============================================================================

describe('applyGhostPreview — add_wall', () => {
  it('creates ghost wall with isGhostPreview metadata', () => {
    applyGhostPreview([makeAddWallOp()])

    expect(mockCreateNode).toHaveBeenCalledTimes(1)
    const createdArg = mockCreateNode.mock.calls[0]![0]
    expect(createdArg.type).toBe('wall')
    expect(createdArg.metadata?.isGhostPreview).toBe(true)
  })

  it('returns wall ID in affected IDs', () => {
    const ids = applyGhostPreview([makeAddWallOp()])
    expect(ids).toHaveLength(1)
  })
})

// ============================================================================
// applyGhostPreview — remove_item
// ============================================================================

describe('applyGhostPreview — remove_item', () => {
  it('hides existing node (sets visible=false) instead of deleting', () => {
    const existingNodeId = 'item_existing'
    mockNodes[existingNodeId] = {
      id: existingNodeId,
      type: 'item',
      visible: true,
      metadata: {},
      parentId: null,
    }

    const removeOp: ValidatedOperation = {
      type: 'remove_item',
      status: 'valid',
      nodeId: existingNodeId as any,
    }

    applyGhostPreview([removeOp])

    expect(mockDeleteNode).not.toHaveBeenCalled()
    expect(mockUpdateNode).toHaveBeenCalled()

    const updateCall = mockUpdatedNodes.find((u) => u.id === existingNodeId)
    expect(updateCall).toBeDefined()
    expect((updateCall!.data as any).visible).toBe(false)
  })

  it('marks removed node with isGhostRemoval metadata', () => {
    const existingNodeId = 'item_to_remove'
    mockNodes[existingNodeId] = {
      id: existingNodeId,
      type: 'item',
      visible: true,
      metadata: {},
      parentId: null,
    }

    applyGhostPreview([{ type: 'remove_item', status: 'valid', nodeId: existingNodeId as any }])

    const updateCall = mockUpdatedNodes.find((u) => u.id === existingNodeId)
    expect((updateCall?.data as any)?.metadata?.isGhostRemoval).toBe(true)
  })
})

// ============================================================================
// applyGhostPreview — move_item
// ============================================================================

describe('applyGhostPreview — move_item', () => {
  it('updates item position without deleting', () => {
    const existingNodeId = 'item_movable'
    mockNodes[existingNodeId] = {
      id: existingNodeId,
      type: 'item',
      visible: true,
      metadata: {},
      parentId: null,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    }

    const moveOp: ValidatedOperation = {
      type: 'move_item',
      status: 'valid',
      nodeId: existingNodeId as any,
      position: [5, 0, 5],
      rotation: [0, Math.PI / 2, 0],
    }

    applyGhostPreview([moveOp])

    expect(mockDeleteNode).not.toHaveBeenCalled()
    const updateCall = mockUpdatedNodes.find((u) => u.id === existingNodeId)
    expect(updateCall).toBeDefined()
    expect((updateCall!.data as any).position).toEqual([5, 0, 5])
  })

  it('marks moved node with isGhostPreview metadata', () => {
    const existingNodeId = 'item_move2'
    mockNodes[existingNodeId] = {
      id: existingNodeId,
      type: 'item',
      visible: true,
      metadata: {},
      parentId: null,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    }

    applyGhostPreview([{
      type: 'move_item',
      status: 'valid',
      nodeId: existingNodeId as any,
      position: [2, 0, 2],
      rotation: [0, 0, 0],
    }])

    const updateCall = mockUpdatedNodes.find((u) => u.id === existingNodeId)
    expect((updateCall?.data as any)?.metadata?.isGhostPreview).toBe(true)
  })
})

// ============================================================================
// clearGhostPreview
// ============================================================================

describe('clearGhostPreview', () => {
  it('deletes all ghost nodes created by applyGhostPreview', () => {
    const ids = applyGhostPreview([makeAddItemOp(), makeAddItemOp()])
    expect(ids).toHaveLength(2)

    clearGhostPreview()

    for (const id of ids) {
      expect(mockDeleteNode).toHaveBeenCalledWith(id)
    }
  })

  it('sets isPreviewActive to false', () => {
    applyGhostPreview([makeAddItemOp()])
    expect(isGhostPreviewActive()).toBe(true)
    clearGhostPreview()
    expect(isGhostPreviewActive()).toBe(false)
  })

  it('does nothing when no preview is active', () => {
    expect(() => clearGhostPreview()).not.toThrow()
    expect(mockDeleteNode).not.toHaveBeenCalled()
  })

  it('restores moved item to original position', () => {
    const existingNodeId = 'item_restore'
    const originalPosition: [number, number, number] = [1, 0, 1]
    mockNodes[existingNodeId] = {
      id: existingNodeId,
      type: 'item',
      visible: true,
      metadata: {},
      parentId: null,
      position: originalPosition,
      rotation: [0, 0, 0],
    }

    const moveOp: ValidatedOperation = {
      type: 'move_item',
      status: 'valid',
      nodeId: existingNodeId as any,
      position: [5, 0, 5],
      rotation: [0, 0, 0],
    }

    applyGhostPreview([moveOp])
    clearGhostPreview()

    // The last update call for this node should restore the original position
    const restoreCall = mockUpdatedNodes
      .filter((u) => u.id === existingNodeId)
      .findLast((u: { id: string; data: unknown }) => (u.data as any).position !== undefined)

    expect(restoreCall).toBeDefined()
    expect((restoreCall!.data as any).position).toEqual(originalPosition)
  })

  it('resumes Zundo tracking on clear', () => {
    applyGhostPreview([makeAddItemOp()])
    clearGhostPreview()
    expect(mockResume).toHaveBeenCalled()
  })

  it('restores hidden removal node to visible', () => {
    const existingNodeId = 'item_removed'
    mockNodes[existingNodeId] = {
      id: existingNodeId,
      type: 'item',
      visible: true,
      metadata: {},
      parentId: null,
    }

    applyGhostPreview([{ type: 'remove_item', status: 'valid', nodeId: existingNodeId as any }])
    clearGhostPreview()

    // After clear, node should be restored to visible
    const restoreCall = mockUpdatedNodes
      .filter((u) => u.id === existingNodeId)
      .findLast((u: { id: string; data: unknown }) => (u.data as any).visible === true)

    expect(restoreCall).toBeDefined()
  })
})

// ============================================================================
// confirmGhostPreview
// ============================================================================

describe('confirmGhostPreview', () => {
  it('returns AIOperationLog with status confirmed', () => {
    applyGhostPreview([makeAddItemOp()])
    const log = confirmGhostPreview([makeAddItemOp()])
    expect(log.status).toBe('confirmed')
  })

  it('returns log with createdNodeIds for add_item operations', () => {
    applyGhostPreview([makeAddItemOp()])
    const log = confirmGhostPreview([makeAddItemOp()])
    expect(log.createdNodeIds).toHaveLength(1)
  })

  it('deletes ghost nodes during confirm', () => {
    const ghostIds = applyGhostPreview([makeAddItemOp()])
    confirmGhostPreview([makeAddItemOp()])

    for (const gId of ghostIds) {
      expect(mockDeleteNode).toHaveBeenCalledWith(gId)
    }
  })

  it('resumes Zundo tracking so operation is undoable', () => {
    applyGhostPreview([makeAddItemOp()])
    confirmGhostPreview([makeAddItemOp()])
    expect(mockResume).toHaveBeenCalled()
  })

  it('sets isPreviewActive to false after confirm', () => {
    applyGhostPreview([makeAddItemOp()])
    confirmGhostPreview([makeAddItemOp()])
    expect(isGhostPreviewActive()).toBe(false)
  })

  it('skips invalid operations', () => {
    applyGhostPreview([])
    const invalidOp: ValidatedAddItem = {
      ...makeAddItemOp(),
      status: 'invalid',
    }

    const log = confirmGhostPreview([invalidOp])
    expect(log.createdNodeIds).toHaveLength(0)
    expect(log.affectedNodeIds).toHaveLength(0)
  })

  it('converts ghost nodes to real nodes without isGhostPreview in final metadata', () => {
    applyGhostPreview([makeAddItemOp()])
    confirmGhostPreview([makeAddItemOp()])

    const finalBatch = mockCreateNodes.mock.calls.at(-1)?.[0]
    const createdNode = finalBatch?.[0]?.node
    if (createdNode) {
      expect(createdNode.metadata?.isGhostPreview).toBeFalsy()
    }
  })

  it('returns log with non-empty affectedNodeIds', () => {
    applyGhostPreview([makeAddItemOp()])
    const log = confirmGhostPreview([makeAddItemOp()])
    expect(log.affectedNodeIds.length).toBeGreaterThan(0)
  })

  it('log has a timestamp', () => {
    applyGhostPreview([makeAddItemOp()])
    const log = confirmGhostPreview([makeAddItemOp()])
    expect(typeof log.timestamp).toBe('number')
    expect(log.timestamp).toBeGreaterThan(0)
  })
})

// ============================================================================
// Surface material confirm path
// Verifies applySurfaceMaterialUpdate writes the correct schema-shaped fields.
// Regression guards for the silent-write bug ({color} at top level instead of
// properties.color) and the wrong-field bug (typo'd material role names).
// ============================================================================

describe('confirmGhostPreview — surface material tools', () => {
  beforeEach(() => {
    mockNodes['wall_x'] = { id: 'wall_x', type: 'wall', visible: true, metadata: {} }
    mockNodes['roof_x'] = { id: 'roof_x', type: 'roof', visible: true, metadata: {} }
    mockNodes['stair_x'] = { id: 'stair_x', type: 'stair', visible: true, metadata: {} }
  })

  function lastUpdateFor(nodeId: string): Record<string, unknown> | undefined {
    for (let i = mockUpdatedNodes.length - 1; i >= 0; i--) {
      const entry = mockUpdatedNodes[i]
      if (entry?.id === nodeId && entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
        const data = entry.data as Record<string, unknown>
        // Skip pure metadata-restore writes; we want the one carrying material fields.
        const keys = Object.keys(data)
        if (keys.some((k) => k.includes('Material') || k.includes('material'))) return data
      }
    }
    return undefined
  }

  it('update_wall_material side=interior with preset writes interiorMaterialPreset and clears interiorMaterial', () => {
    confirmGhostPreview([
      {
        type: 'update_wall_material',
        status: 'valid',
        nodeId: 'wall_x' as any,
        side: 'interior',
        materialPreset: 'wall-wood1',
      } as any,
    ])
    const update = lastUpdateFor('wall_x')
    expect(update).toBeDefined()
    expect(update?.interiorMaterialPreset).toBe('wall-wood1')
    expect(update?.interiorMaterial).toBeUndefined()
  })

  it('update_wall_material side=exterior with hex color writes properties.color (not bare color)', () => {
    confirmGhostPreview([
      {
        type: 'update_wall_material',
        status: 'valid',
        nodeId: 'wall_x' as any,
        side: 'exterior',
        materialColor: '#aabbcc',
      } as any,
    ])
    const update = lastUpdateFor('wall_x')
    expect(update).toBeDefined()
    expect(update?.exteriorMaterialPreset).toBeUndefined()
    expect(update?.exteriorMaterial).toEqual({ properties: { color: '#aabbcc' } })
    // Regression: must NOT write `{ color }` directly (would be silently dropped by MaterialSchema).
    expect((update?.exteriorMaterial as any)?.color).toBeUndefined()
  })

  it('update_wall_material side=both writes legacy material/materialPreset', () => {
    confirmGhostPreview([
      {
        type: 'update_wall_material',
        status: 'valid',
        nodeId: 'wall_x' as any,
        side: 'both',
        materialPreset: 'wall-brick1',
      } as any,
    ])
    const update = lastUpdateFor('wall_x')
    expect(update?.materialPreset).toBe('wall-brick1')
    expect(update?.material).toBeUndefined()
  })

  it.each([
    ['top', 'topMaterialPreset', 'topMaterial'],
    ['edge', 'edgeMaterialPreset', 'edgeMaterial'],
    ['wall', 'wallMaterialPreset', 'wallMaterial'],
  ] as const)(
    'update_roof_material role=%s with preset routes to %s',
    (role, presetField, materialField) => {
      confirmGhostPreview([
        {
          type: 'update_roof_material',
          status: 'valid',
          nodeId: 'roof_x' as any,
          role,
          materialPreset: 'roof-tile1',
        } as any,
      ])
      const update = lastUpdateFor('roof_x')
      expect(update?.[presetField]).toBe('roof-tile1')
      expect(update?.[materialField]).toBeUndefined()
    },
  )

  it.each([
    ['railing', 'railingMaterialPreset', 'railingMaterial'],
    ['tread', 'treadMaterialPreset', 'treadMaterial'],
    ['side', 'sideMaterialPreset', 'sideMaterial'],
  ] as const)(
    'update_stair_material role=%s with hex color writes properties.color on %s',
    (role, presetField, materialField) => {
      confirmGhostPreview([
        {
          type: 'update_stair_material',
          status: 'valid',
          nodeId: 'stair_x' as any,
          role,
          materialColor: '#112233',
        } as any,
      ])
      const update = lastUpdateFor('stair_x')
      expect(update?.[presetField]).toBeUndefined()
      expect(update?.[materialField]).toEqual({ properties: { color: '#112233' } })
    },
  )

  it('skips writes when neither preset nor color is provided', () => {
    const before = mockUpdatedNodes.length
    confirmGhostPreview([
      {
        type: 'update_wall_material',
        status: 'valid',
        nodeId: 'wall_x' as any,
        side: 'interior',
      } as any,
    ])
    // Nothing material-shaped written.
    expect(lastUpdateFor('wall_x')).toBeUndefined()
    // Some non-material updates may still happen (metadata cleanup is skipped because
    // applySurfaceMaterialUpdate returned null), so we only assert no material fields were written.
    expect(mockUpdatedNodes.length).toBeGreaterThanOrEqual(before)
  })
})

// ============================================================================
// undoConfirmedOperation — cascade subtree restoration
// Regression guard for R5: AI deleting a wall with doors/windows used to lose
// the children forever after Confirm + Undo. markForGhostRemoval now saves
// the whole subtree, and undoConfirmedOperation re-creates parents-first.
// ============================================================================

describe('undoConfirmedOperation — cascade subtree restoration', () => {
  it('restores cascade-deleted children when undoing a parent removal', () => {
    // Build a wall with two children (door + window).
    mockNodes['wall_a'] = {
      id: 'wall_a',
      type: 'wall',
      visible: true,
      metadata: {},
      children: ['door_a', 'window_a'],
      parentId: 'level_root',
    }
    mockNodes['door_a'] = {
      id: 'door_a',
      type: 'door',
      visible: true,
      metadata: {},
      parentId: 'wall_a',
      width: 0.9,
      height: 2.1,
      position: [2, 1.05, 0],
    }
    mockNodes['window_a'] = {
      id: 'window_a',
      type: 'window',
      visible: true,
      metadata: {},
      parentId: 'wall_a',
      width: 1.2,
      height: 1.0,
      position: [3.5, 1.5, 0],
    }
    mockNodes['level_root'] = {
      id: 'level_root',
      type: 'level',
      visible: true,
      metadata: {},
      children: ['wall_a'],
      parentId: null,
    }

    // Apply a remove_node preview that targets the wall — markForGhostRemoval
    // should recursively snapshot door_a + window_a alongside wall_a.
    applyGhostPreview([
      {
        type: 'remove_node',
        status: 'valid',
        nodeId: 'wall_a' as any,
        nodeType: 'wall',
      } as any,
    ])

    // Confirm the removal — wall_a + descendants get cascade-deleted from store.
    const log = confirmGhostPreview([
      {
        type: 'remove_node',
        status: 'valid',
        nodeId: 'wall_a' as any,
        nodeType: 'wall',
      } as any,
    ])

    // Sanity: cascade-deleted nodes were saved for undo (R5 fix).
    const removedIds = log.removedNodes.map((r) => (r.node as any).id).sort()
    expect(removedIds).toEqual(['door_a', 'wall_a', 'window_a'])

    // Simulate the cascade delete in our mock store (real deleteNode would do this).
    delete mockNodes['wall_a']
    delete mockNodes['door_a']
    delete mockNodes['window_a']

    // Undo — parent should be re-created before children (topological order).
    const createCallsBefore = mockCreatedNodes.length
    undoConfirmedOperation(log)

    // All three nodes restored.
    expect(mockNodes['wall_a']).toBeDefined()
    expect(mockNodes['door_a']).toBeDefined()
    expect(mockNodes['window_a']).toBeDefined()
    // At least 3 create calls (one per restored node).
    expect(mockCreatedNodes.length - createCallsBefore).toBeGreaterThanOrEqual(3)

    // Parent must come first in the create order so child createNode finds its parent.
    const restoredOrder = mockCreatedNodes.slice(createCallsBefore).map((n: any) => n.id)
    const wallIndex = restoredOrder.indexOf('wall_a')
    const doorIndex = restoredOrder.indexOf('door_a')
    const windowIndex = restoredOrder.indexOf('window_a')
    expect(wallIndex).toBeGreaterThanOrEqual(0)
    expect(doorIndex).toBeGreaterThan(wallIndex)
    expect(windowIndex).toBeGreaterThan(wallIndex)
  })

  it('skips re-creating a node whose parent is gone and not pending re-create', () => {
    // Wall present, no parent in store, no parent in removedNodes either.
    mockNodes['orphan_wall'] = {
      id: 'orphan_wall',
      type: 'wall',
      visible: true,
      metadata: {},
      children: [],
      parentId: 'ghost_parent_that_doesnt_exist',
    }

    applyGhostPreview([
      {
        type: 'remove_node',
        status: 'valid',
        nodeId: 'orphan_wall' as any,
        nodeType: 'wall',
      } as any,
    ])
    const log = confirmGhostPreview([
      {
        type: 'remove_node',
        status: 'valid',
        nodeId: 'orphan_wall' as any,
        nodeType: 'wall',
      } as any,
    ])

    delete mockNodes['orphan_wall']

    // Undo should not throw even though parent doesn't exist.
    expect(() => undoConfirmedOperation(log)).not.toThrow()
    // Orphan should NOT be re-created since its parent is missing.
    expect(mockNodes['orphan_wall']).toBeUndefined()
  })
})

// ============================================================================
// previousSnapshot transient metadata strip
// Regression: snapshot captured at confirm time previously embedded ghost flags
// (isGhostPreview, previewMaterial, isTransient) — undo would then restore them
// permanently into the node via setNode (full replace).
// ============================================================================

describe('confirmGhostPreview — previousSnapshot strips transient metadata', () => {
  it('snapshot captured for an update_material preview omits previewMaterial/isGhostPreview', () => {
    // Pre-existing wall with previously clean metadata.
    mockNodes['wall_mat'] = {
      id: 'wall_mat',
      type: 'wall',
      visible: true,
      metadata: { userTag: 'kitchen-wall' },
    }

    // Preview adds previewMaterial + isGhostPreview to wall metadata.
    applyGhostPreview([
      {
        type: 'update_material',
        status: 'valid',
        nodeId: 'wall_mat' as any,
        material: '#ff0000',
      } as any,
    ])

    // Sanity: preview did pollute the live node metadata.
    expect((mockNodes['wall_mat'].metadata as any).previewMaterial).toBe('#ff0000')
    expect((mockNodes['wall_mat'].metadata as any).isGhostPreview).toBe(true)

    const log = confirmGhostPreview([
      {
        type: 'update_material',
        status: 'valid',
        nodeId: 'wall_mat' as any,
        material: '#ff0000',
      } as any,
    ])

    // The snapshot stored for undo MUST NOT carry the transient flags. Otherwise
    // setNode(snapshot) on undo permanently re-embeds them.
    const snap = (log.previousSnapshot as any)['wall_mat']
    expect(snap).toBeDefined()
    expect(snap.metadata.previewMaterial).toBeUndefined()
    expect(snap.metadata.isGhostPreview).toBeUndefined()
    expect(snap.metadata.isTransient).toBeUndefined()
    expect(snap.metadata.isGhostRemoval).toBeUndefined()
    // User-authored fields preserved.
    expect(snap.metadata.userTag).toBe('kitchen-wall')
  })

  it('snapshot of a removed node strips transient metadata even if the live node carried ghost flags', () => {
    mockNodes['wall_rm'] = {
      id: 'wall_rm',
      type: 'wall',
      visible: true,
      metadata: { isGhostPreview: true, isTransient: true, userTag: 'staircase' },
      parentId: 'level_root',
      children: [],
    }
    mockNodes['level_root'] = {
      id: 'level_root',
      type: 'level',
      visible: true,
      metadata: {},
      children: ['wall_rm'],
      parentId: null,
    }

    applyGhostPreview([
      { type: 'remove_node', status: 'valid', nodeId: 'wall_rm' as any, nodeType: 'wall' } as any,
    ])
    const log = confirmGhostPreview([
      { type: 'remove_node', status: 'valid', nodeId: 'wall_rm' as any, nodeType: 'wall' } as any,
    ])

    const removed = log.removedNodes.find((r) => (r.node as any).id === 'wall_rm')
    expect(removed).toBeDefined()
    const meta = (removed!.node as any).metadata
    expect(meta.isGhostPreview).toBeUndefined()
    expect(meta.isTransient).toBeUndefined()
    expect(meta.userTag).toBe('staircase')
  })
})
