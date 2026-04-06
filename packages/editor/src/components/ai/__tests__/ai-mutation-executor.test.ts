import { describe, expect, it, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockNodes: Record<string, unknown> = {}
const mockSelection = { levelId: 'level-1' }

// Mock @aedifex/core
vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => ({
      nodes: mockNodes,
    }),
  },
  spatialGridManager: {
    canPlaceOnFloor: vi.fn(() => ({ valid: true, conflictIds: [] })),
    getSlabElevationForItem: vi.fn(() => 0),
  },
}))

// Mock @aedifex/viewer
vi.mock('@aedifex/viewer', () => ({
  useViewer: {
    getState: () => ({
      selection: mockSelection,
    }),
  },
}))

// Mock catalog resolver
vi.mock('../ai-catalog-resolver', () => ({
  resolveCatalogSlug: vi.fn((slug: string) => {
    const catalog: Record<string, { id: string; name: string; category: string; dimensions: [number, number, number] }> = {
      'sofa-modern': {
        id: 'sofa-modern',
        name: 'Modern Sofa',
        category: 'furniture',
        dimensions: [2.2, 0.9, 0.9],
      },
      'dining-table': {
        id: 'dining-table',
        name: 'Dining Table',
        category: 'furniture',
        dimensions: [1.6, 0.75, 0.9],
      },
    }
    const asset = catalog[slug]
    if (asset) {
      return { asset: { ...asset, src: '', thumbnail: '', scale: [1, 1, 1], offset: [0, 0, 0], rotation: [0, 0, 0] }, matchType: 'exact' }
    }
    return { asset: null, matchType: 'none', suggestions: [] }
  }),
}))

import { spatialGridManager } from '@aedifex/core'
import { validateToolCall, validateAllToolCalls } from '../ai-mutation-executor'
import type {
  AddItemToolCall,
  RemoveItemToolCall,
  MoveItemToolCall,
  UpdateMaterialToolCall,
  BatchOperationsToolCall,
  ValidatedAddItem,
  ValidatedRemoveItem,
  ValidatedMoveItem,
} from '../types'

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  // Reset mock nodes
  for (const key of Object.keys(mockNodes)) {
    delete mockNodes[key]
  }
  vi.clearAllMocks()
})

describe('validateToolCall — add_item', () => {
  it('validates a valid add_item call', () => {
    const call: AddItemToolCall = {
      tool: 'add_item',
      catalogSlug: 'sofa-modern',
      position: [2, 0, 3],
      rotationY: 0,
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.type).toBe('add_item')
    expect(op.status).toBe('valid')

    const addOp = op as ValidatedAddItem
    expect(addOp.asset?.id).toBe('sofa-modern')
    expect(addOp.position).toEqual([2, 0, 3])
  })

  it('returns invalid for unknown catalog slug', () => {
    const call: AddItemToolCall = {
      tool: 'add_item',
      catalogSlug: 'unknown-item',
      position: [0, 0, 0],
      rotationY: 0,
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.status).toBe('invalid')

    const addOp = op as ValidatedAddItem
    expect(addOp.errorReason).toContain('not found')
  })

  it('treats transient collision as valid (false positive)', () => {
    // First call: collision detected, but subsequent checks find no collision
    // (e.g., stale spatial grid) — should be treated as valid, not adjusted
    const canPlaceMock = vi.mocked(spatialGridManager.canPlaceOnFloor)
    canPlaceMock
      .mockReturnValueOnce({ valid: false, conflictIds: ['existing-item'] })
      .mockReturnValue({ valid: true, conflictIds: [] })

    const call: AddItemToolCall = {
      tool: 'add_item',
      catalogSlug: 'sofa-modern',
      position: [2, 0, 3],
      rotationY: 0,
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    // Re-check finds no collision → false positive → valid
    expect(op.status).toBe('valid')
  })

  it('returns invalid when collision cannot be resolved', () => {
    // All checks return collision — auto-offset fails, re-check confirms collision
    // Use mockReturnValueOnce (×6 to cover all calls) to avoid leaking mock state
    const canPlaceMock = vi.mocked(spatialGridManager.canPlaceOnFloor)
    for (let i = 0; i < 6; i++) {
      canPlaceMock.mockReturnValueOnce({ valid: false, conflictIds: ['existing-item'] })
    }

    // Mock an existing item for tryAutoOffset to push against
    mockNodes['existing-item'] = {
      id: 'existing-item',
      type: 'item',
      name: 'Existing',
      position: [2, 0, 3],
      rotation: [0, 0, 0],
      asset: { dimensions: [1, 1, 1] },
    }

    const call: AddItemToolCall = {
      tool: 'add_item',
      catalogSlug: 'sofa-modern',
      position: [2, 0, 3],
      rotationY: 0,
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.status).toBe('invalid')

    const addOp = op as ValidatedAddItem
    expect(addOp.errorReason?.toLowerCase()).toContain('collides')
  })
})

describe('validateToolCall — remove_item', () => {
  it('validates removal of existing item node', () => {
    mockNodes['item-1'] = {
      id: 'item-1',
      type: 'item',
      name: 'Test Item',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      asset: { id: 'sofa-modern', dimensions: [2, 1, 1] },
    }

    const call: RemoveItemToolCall = {
      tool: 'remove_item',
      nodeId: 'item-1',
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.type).toBe('remove_item')
    expect(op.status).toBe('valid')
  })

  it('returns invalid for non-existent node', () => {
    const call: RemoveItemToolCall = {
      tool: 'remove_item',
      nodeId: 'non-existent',
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.status).toBe('invalid')

    const removeOp = op as ValidatedRemoveItem
    expect(removeOp.errorReason).toContain('not found')
  })

  it('returns invalid for non-item nodes (e.g., wall)', () => {
    mockNodes['wall-1'] = {
      id: 'wall-1',
      type: 'wall',
      name: 'Wall',
    }

    const call: RemoveItemToolCall = {
      tool: 'remove_item',
      nodeId: 'wall-1',
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.status).toBe('invalid')

    const removeOp = op as ValidatedRemoveItem
    expect(removeOp.errorReason).toContain('wall')
  })
})

describe('validateToolCall — move_item', () => {
  it('validates moving an existing item', () => {
    mockNodes['item-2'] = {
      id: 'item-2',
      type: 'item',
      name: 'Test Item 2',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      asset: { id: 'dining-table', dimensions: [1.6, 0.75, 0.9] },
    }

    const call: MoveItemToolCall = {
      tool: 'move_item',
      nodeId: 'item-2',
      position: [3, 0, 5],
      rotationY: Math.PI / 2,
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.type).toBe('move_item')
    expect(op.status).toBe('valid')

    const moveOp = op as ValidatedMoveItem
    expect(moveOp.position).toEqual([3, 0, 5])
  })

  it('returns invalid for non-existent node', () => {
    const call: MoveItemToolCall = {
      tool: 'move_item',
      nodeId: 'ghost-item',
      position: [0, 0, 0],
    }

    const results = validateToolCall(call)
    expect(results[0]!.status).toBe('invalid')
  })
})

describe('validateToolCall — update_material', () => {
  it('validates material update on existing node', () => {
    mockNodes['item-3'] = {
      id: 'item-3',
      type: 'item',
      name: 'Test Item 3',
    }

    const call: UpdateMaterialToolCall = {
      tool: 'update_material',
      nodeId: 'item-3',
      material: 'oak-wood',
    }

    const results = validateToolCall(call)
    expect(results).toHaveLength(1)

    const op = results[0]!
    expect(op.type).toBe('update_material')
    expect(op.status).toBe('valid')
  })

  it('returns invalid for non-existent node', () => {
    const call: UpdateMaterialToolCall = {
      tool: 'update_material',
      nodeId: 'non-existent',
      material: 'oak-wood',
    }

    const results = validateToolCall(call)
    expect(results[0]!.status).toBe('invalid')
  })
})

describe('validateAllToolCalls — batch operations', () => {
  it('flattens batch operations into individual validated ops', () => {
    mockNodes['item-4'] = {
      id: 'item-4',
      type: 'item',
      name: 'To Delete',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      asset: { id: 'sofa-modern', dimensions: [2, 1, 1] },
    }

    const batch: BatchOperationsToolCall = {
      tool: 'batch_operations',
      description: 'Add a table and remove old sofa',
      operations: [
        {
          catalogSlug: 'dining-table',
          position: [1, 0, 1],
          rotationY: 0,
        },
        {
          nodeId: 'item-4',
        },
      ],
    }

    const results = validateAllToolCalls([batch])
    // Should produce 2 validated operations
    expect(results.length).toBe(2)
    expect(results[0]!.type).toBe('add_item')
    expect(results[1]!.type).toBe('remove_item')
  })

  it('handles multiple independent tool calls', () => {
    const calls = [
      {
        tool: 'add_item' as const,
        catalogSlug: 'sofa-modern',
        position: [0, 0, 0] as [number, number, number],
        rotationY: 0,
      },
      {
        tool: 'add_item' as const,
        catalogSlug: 'dining-table',
        position: [3, 0, 3] as [number, number, number],
        rotationY: 0,
      },
    ]

    const results = validateAllToolCalls(calls)
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'valid')).toBe(true)
  })
})
