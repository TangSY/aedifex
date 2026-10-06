/**
 * Direct tests for preview/ghost-node-helpers.ts.
 *
 * Covers:
 *   - applyGhostPreview marks isGhostPreview=true (via createGhostNode/Wall/Door/Window)
 *   - markForGhostRemoval saves prior nodes (subtree) for restore
 *   - stripTransientMetadata removes only the transient flags
 *   - resetPreviewState clears module-level state
 *   - getPendingGhostRemovalIds returns the right set during preview
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockNodes: Record<string, any> = {}
const mockUpdatedNodes: Array<{ id: string; data: any }> = []
const mockCreatedNodes: any[] = []

let _idCounter = 0
const nextId = (p: string) => `${p}_mock_${++_idCounter}`

const mockCreateNode = vi.fn((node: any, parentId?: string) => {
  mockNodes[node.id] = { ...node, parentId: parentId ?? null }
  mockCreatedNodes.push(mockNodes[node.id])
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
        updateNode: mockUpdateNode,
      }),
    },
    ItemNode: makeParser('item'),
    WallNode: makeParser('wall'),
    DoorNode: makeParser('door'),
    WindowNode: makeParser('window'),
  }
})

import {
  buildGhostMetadata,
  countNodesByType,
  createGhostDoor,
  createGhostNode,
  createGhostWall,
  createGhostWindow,
  getPendingGhostRemovalIds,
  ghostNodeIds,
  isPreviewActive,
  markForGhostRemoval,
  resetPreviewState,
  setIsPreviewActive,
  stripTransientMetadata,
  removedNodeStates,
} from '../preview/ghost-node-helpers'
import type { ValidatedAddDoor, ValidatedAddItem, ValidatedAddWall, ValidatedAddWindow } from '../types'

function reset() {
  for (const k of Object.keys(mockNodes)) delete mockNodes[k]
  mockUpdatedNodes.length = 0
  mockCreatedNodes.length = 0
  mockCreateNode.mockClear()
  mockUpdateNode.mockClear()
  resetPreviewState()
}

beforeEach(reset)

// ============================================================================
// stripTransientMetadata
// ============================================================================

describe('stripTransientMetadata', () => {
  it('strips isTransient / isGhostPreview / isGhostRemoval / previewMaterial', () => {
    const result = stripTransientMetadata({
      isTransient: true,
      isGhostPreview: true,
      isGhostRemoval: true,
      previewMaterial: '#abc',
      userTag: 'keep',
      level: 'second',
    })
    expect(result).toEqual({ userTag: 'keep', level: 'second' })
  })

  it('returns empty object for null / non-object input', () => {
    expect(stripTransientMetadata(null)).toEqual({})
    expect(stripTransientMetadata(undefined)).toEqual({})
    expect(stripTransientMetadata('string')).toEqual({})
  })

  it('preserves non-transient fields when metadata had none of the strip targets', () => {
    expect(stripTransientMetadata({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
  })
})

// ============================================================================
// buildGhostMetadata
// ============================================================================

describe('buildGhostMetadata', () => {
  it('always sets isTransient=true and merges the provided flags', () => {
    const result = buildGhostMetadata({ userTag: 'x' }, { isGhostPreview: true })
    expect(result).toMatchObject({ userTag: 'x', isTransient: true, isGhostPreview: true })
  })

  it('handles null / non-object base metadata', () => {
    const result = buildGhostMetadata(null, { isGhostRemoval: true })
    expect(result).toEqual({ isTransient: true, isGhostRemoval: true })
  })
})

// ============================================================================
// createGhost* helpers — all must mark isGhostPreview/isTransient.
// ============================================================================

describe('createGhostNode / createGhostWall / createGhostDoor / createGhostWindow', () => {
  it('createGhostNode creates an item with isGhostPreview=true and tracks the id', () => {
    const op: ValidatedAddItem = {
      type: 'add_item', status: 'valid',
      position: [1, 0, 1], rotation: [0, 0, 0],
      asset: {
        id: 'sofa', name: 'Sofa', category: 'furniture',
        dimensions: [1, 1, 1], src: '', thumbnail: '',
        scale: [1, 1, 1], offset: [0, 0, 0], rotation: [0, 0, 0],
      },
    }
    const id = createGhostNode(op, 'level_root')
    expect(id).toBeTruthy()
    expect(ghostNodeIds).toContain(id)
    const created = mockCreatedNodes.at(-1)
    expect(created.metadata.isGhostPreview).toBe(true)
    expect(created.metadata.isTransient).toBe(true)
  })

  it('createGhostNode returns null when asset is missing', () => {
    const op: ValidatedAddItem = {
      type: 'add_item', status: 'valid',
      position: [0, 0, 0], rotation: [0, 0, 0],
      asset: null as any,
    }
    const id = createGhostNode(op, 'level_root')
    expect(id).toBeNull()
  })

  it('createGhostWall creates a wall with sequential "Wall N+1" naming', () => {
    // Pre-seed one wall so the new one is "Wall 2".
    mockNodes['wall_seed'] = { id: 'wall_seed', type: 'wall' }
    const op: ValidatedAddWall = {
      type: 'add_wall', status: 'valid',
      start: [0, 0], end: [3, 0], thickness: 0.2,
    }
    const id = createGhostWall(op, 'level_root')
    expect(id).toBeTruthy()
    const created = mockCreatedNodes.at(-1)
    expect(created.name).toBe('Wall 2')
    expect(created.metadata.isGhostPreview).toBe(true)
  })

  it('createGhostDoor attaches under wallId and marks ghost flags', () => {
    const op: ValidatedAddDoor = {
      type: 'add_door', status: 'valid',
      wallId: 'wall_target' as any,
      localX: 1.2, localY: 1.05,
      width: 0.9, height: 2.1, side: 'front',
      hingesSide: 'left', swingDirection: 'inward',
    }
    const id = createGhostDoor(op)
    expect(id).toBeTruthy()
    expect(mockCreateNode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'door',
        metadata: expect.objectContaining({ isGhostPreview: true, isTransient: true }),
      }),
      'wall_target',
    )
  })

  it('createGhostWindow attaches under wallId and marks ghost flags', () => {
    const op: ValidatedAddWindow = {
      type: 'add_window', status: 'valid',
      wallId: 'wall_target' as any,
      localX: 2.0, localY: 1.4,
      width: 1.0, height: 1.0, side: 'front',
    }
    const id = createGhostWindow(op)
    expect(id).toBeTruthy()
    expect(mockCreateNode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'window',
        metadata: expect.objectContaining({ isGhostPreview: true, isTransient: true }),
      }),
      'wall_target',
    )
  })
})

// ============================================================================
// markForGhostRemoval / removedNodeStates / getPendingGhostRemovalIds
// ============================================================================

describe('markForGhostRemoval', () => {
  it('saves the root node and recursively saves all descendants', () => {
    mockNodes['wall_x'] = {
      id: 'wall_x', type: 'wall', parentId: 'level_root', visible: true,
      metadata: {}, children: ['door_x', 'window_x'],
    }
    mockNodes['door_x'] = { id: 'door_x', type: 'door', parentId: 'wall_x', visible: true, metadata: {}, children: [] }
    mockNodes['window_x'] = { id: 'window_x', type: 'window', parentId: 'wall_x', visible: true, metadata: {}, children: [] }

    markForGhostRemoval({ nodeId: 'wall_x' as any }, mockNodes)

    const saved = Array.from(removedNodeStates.keys()).sort()
    expect(saved).toEqual(['door_x', 'wall_x', 'window_x'])
  })

  it('hides every saved node (visible=false) with isGhostRemoval metadata', () => {
    mockNodes['wall_y'] = {
      id: 'wall_y', type: 'wall', parentId: 'level_root', visible: true,
      metadata: {}, children: ['door_y'],
    }
    mockNodes['door_y'] = { id: 'door_y', type: 'door', parentId: 'wall_y', visible: true, metadata: {}, children: [] }

    markForGhostRemoval({ nodeId: 'wall_y' as any }, mockNodes)

    const wallUpdate = mockUpdatedNodes.find((u) => u.id === 'wall_y')
    expect(wallUpdate?.data.visible).toBe(false)
    expect(wallUpdate?.data.metadata.isGhostRemoval).toBe(true)

    const doorUpdate = mockUpdatedNodes.find((u) => u.id === 'door_y')
    expect(doorUpdate?.data.visible).toBe(false)
    expect(doorUpdate?.data.metadata.isGhostRemoval).toBe(true)
  })

  it('is a no-op when the target node does not exist', () => {
    markForGhostRemoval({ nodeId: 'no_such_node' as any }, mockNodes)
    expect(removedNodeStates.size).toBe(0)
    expect(mockUpdatedNodes.length).toBe(0)
  })
})

describe('getPendingGhostRemovalIds', () => {
  it('returns empty set when no preview is active (cheap fast-path)', () => {
    expect(isPreviewActive).toBe(false)
    const ids = getPendingGhostRemovalIds()
    expect(ids.size).toBe(0)
  })

  it('returns the set of node ids currently pending removal during preview', () => {
    mockNodes['wall_p'] = { id: 'wall_p', type: 'wall', visible: true, metadata: {}, children: [] }
    setIsPreviewActive(true)
    markForGhostRemoval({ nodeId: 'wall_p' as any }, mockNodes)
    const ids = getPendingGhostRemovalIds()
    expect(ids.has('wall_p')).toBe(true)
  })
})

// ============================================================================
// countNodesByType
// ============================================================================

describe('countNodesByType', () => {
  it('counts only nodes with the requested type', () => {
    mockNodes['a'] = { id: 'a', type: 'wall' }
    mockNodes['b'] = { id: 'b', type: 'wall' }
    mockNodes['c'] = { id: 'c', type: 'door' }
    expect(countNodesByType(mockNodes, 'wall')).toBe(2)
    expect(countNodesByType(mockNodes, 'door')).toBe(1)
    expect(countNodesByType(mockNodes, 'elevator')).toBe(0)
  })
})

// ============================================================================
// resetPreviewState
// ============================================================================

describe('resetPreviewState', () => {
  it('clears ghostNodeIds, originalNodeStates, removedNodeStates and isPreviewActive', () => {
    mockNodes['some'] = { id: 'some', type: 'wall', visible: true, metadata: {}, children: [] }
    setIsPreviewActive(true)
    markForGhostRemoval({ nodeId: 'some' as any }, mockNodes)
    expect(removedNodeStates.size).toBeGreaterThan(0)

    resetPreviewState()
    expect(removedNodeStates.size).toBe(0)
    expect(ghostNodeIds.length).toBe(0)
    expect(isPreviewActive).toBe(false)
  })
})
