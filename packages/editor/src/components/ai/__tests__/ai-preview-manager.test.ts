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
      deleteNode: mockDeleteNode,
      updateNode: mockUpdateNode,
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
      .findLast((u) => (u.data as any).position !== undefined)

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
      .findLast((u) => (u.data as any).visible === true)

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

    // The very last createNode call (after ghost deletion) should be final node
    const finalCalls = mockCreateNode.mock.calls
    const lastCallArg = finalCalls[finalCalls.length - 1]?.[0]
    if (lastCallArg) {
      // Final node should NOT have isGhostPreview
      expect(lastCallArg.metadata?.isGhostPreview).toBeFalsy()
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
