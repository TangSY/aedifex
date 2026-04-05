import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cloneSceneGraph, type SceneGraph } from '../utils/clone-scene-graph'
import type { AnyNode, AnyNodeId } from '../schema'
import type { Collection, CollectionId } from '../schema/collections'

// ============================================================================
// Mock generateId to produce predictable, deterministic IDs
// ============================================================================

let idCounter = 0

vi.mock('../schema/base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../schema/base')>()
  return {
    ...actual,
    generateId: vi.fn((prefix: string) => {
      idCounter++
      return `${prefix}_NEW${idCounter}`
    }),
  }
})

beforeEach(() => {
  idCounter = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// Helpers
// ============================================================================

function makeWallNode(overrides: Partial<Record<string, unknown>> = {}): AnyNode {
  return {
    object: 'node',
    id: 'wall_aaa',
    type: 'wall',
    parentId: null,
    visible: true,
    metadata: {},
    children: [],
    start: [0, 0] as [number, number],
    end: [1, 0] as [number, number],
    frontSide: 'unknown',
    backSide: 'unknown',
    ...overrides,
  } as unknown as AnyNode
}

function makeItemNode(overrides: Partial<Record<string, unknown>> = {}): AnyNode {
  return {
    object: 'node',
    id: 'item_bbb',
    type: 'item',
    parentId: null,
    visible: true,
    metadata: {},
    children: [],
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    asset: {
      id: 'test-asset',
      category: 'furniture',
      name: 'Test',
      thumbnail: '',
      src: '',
      dimensions: [1, 1, 1] as [number, number, number],
      offset: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    },
    ...overrides,
  } as unknown as AnyNode
}

// ============================================================================
// Tests
// ============================================================================

describe('cloneSceneGraph', () => {
  describe('ID regeneration', () => {
    it('generates new IDs for all nodes — no overlap with original', () => {
      const wall = makeWallNode({ id: 'wall_aaa' })
      const graph: SceneGraph = {
        nodes: { wall_aaa: wall } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)

      const originalIds = Object.keys(graph.nodes)
      const clonedIds = Object.keys(cloned.nodes)

      expect(clonedIds).toHaveLength(1)
      // Cloned IDs must not match original IDs
      for (const clonedId of clonedIds) {
        expect(originalIds).not.toContain(clonedId)
      }
    })

    it('preserves the type prefix when regenerating IDs', () => {
      const wall = makeWallNode({ id: 'wall_aaa' })
      const item = makeItemNode({ id: 'item_bbb' })
      const graph: SceneGraph = {
        nodes: {
          wall_aaa: wall,
          item_bbb: item,
        } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)
      const clonedIds = Object.keys(cloned.nodes)

      // Each new ID should start with the original prefix
      expect(clonedIds.some((id) => id.startsWith('wall_'))).toBe(true)
      expect(clonedIds.some((id) => id.startsWith('item_'))).toBe(true)
    })
  })

  describe('parentId remapping', () => {
    it('remaps parentId to new child ID', () => {
      const wall = makeWallNode({ id: 'wall_aaa', children: ['item_bbb'] })
      const item = makeItemNode({ id: 'item_bbb', parentId: 'wall_aaa' })

      const graph: SceneGraph = {
        nodes: {
          wall_aaa: wall,
          item_bbb: item,
        } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)

      // Find the cloned item (type item)
      const clonedItem = Object.values(cloned.nodes).find((n) => n.type === 'item')
      expect(clonedItem).toBeDefined()

      // Its parentId must not be the old 'wall_aaa'
      expect(clonedItem!.parentId).not.toBe('wall_aaa')

      // Its parentId must exist as a key in cloned nodes
      expect(cloned.nodes[clonedItem!.parentId as AnyNodeId]).toBeDefined()
    })

    it('sets parentId to null for root nodes that had no parent', () => {
      const wall = makeWallNode({ id: 'wall_aaa', parentId: null })
      const graph: SceneGraph = {
        nodes: { wall_aaa: wall } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)
      const clonedWall = Object.values(cloned.nodes)[0]!
      expect(clonedWall.parentId).toBeNull()
    })
  })

  describe('children array remapping', () => {
    it('remaps children array entries to new IDs', () => {
      const wall = makeWallNode({ id: 'wall_aaa', children: ['item_bbb'] })
      const item = makeItemNode({ id: 'item_bbb', parentId: 'wall_aaa' })

      const graph: SceneGraph = {
        nodes: {
          wall_aaa: wall,
          item_bbb: item,
        } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)
      const clonedWall = Object.values(cloned.nodes).find((n) => n.type === 'wall')!

      expect('children' in clonedWall).toBe(true)
      const children = (clonedWall as Record<string, unknown>).children as string[]
      expect(children).toHaveLength(1)
      // Children IDs should not match original
      expect(children).not.toContain('item_bbb')
      // But they should exist in cloned nodes
      expect(cloned.nodes[children[0] as AnyNodeId]).toBeDefined()
    })
  })

  describe('wallId remapping', () => {
    it('remaps wallId reference on wall-attached items', () => {
      const wall = makeWallNode({ id: 'wall_aaa', children: ['item_bbb'] })
      const item = makeItemNode({
        id: 'item_bbb',
        parentId: 'wall_aaa',
        wallId: 'wall_aaa',
        wallT: 0.5,
      })

      const graph: SceneGraph = {
        nodes: {
          wall_aaa: wall,
          item_bbb: item,
        } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)
      const clonedItem = Object.values(cloned.nodes).find((n) => n.type === 'item')!

      const wallId = (clonedItem as Record<string, unknown>).wallId as string
      // wallId should be remapped to new ID, not the original
      expect(wallId).not.toBe('wall_aaa')
      // The new wallId should reference the cloned wall
      expect(cloned.nodes[wallId as AnyNodeId]).toBeDefined()
    })
  })

  describe('rootNodeIds remapping', () => {
    it('remaps rootNodeIds to new IDs', () => {
      const wall = makeWallNode({ id: 'wall_aaa' })
      const graph: SceneGraph = {
        nodes: { wall_aaa: wall } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)

      expect(cloned.rootNodeIds).toHaveLength(1)
      expect(cloned.rootNodeIds).not.toContain('wall_aaa')
      // The cloned root ID should exist in cloned nodes
      expect(cloned.nodes[cloned.rootNodeIds[0]!]).toBeDefined()
    })
  })

  describe('collections', () => {
    it('generates new collection IDs', () => {
      const wall = makeWallNode({ id: 'wall_aaa' })
      const collection: Collection = {
        id: 'collection_old' as CollectionId,
        name: 'Group A',
        nodeIds: ['wall_aaa' as AnyNodeId],
      }

      const graph: SceneGraph = {
        nodes: { wall_aaa: wall } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
        collections: { collection_old: collection } as Record<CollectionId, Collection>,
      }

      const cloned = cloneSceneGraph(graph)

      expect(cloned.collections).toBeDefined()
      const collectionIds = Object.keys(cloned.collections!)
      expect(collectionIds).toHaveLength(1)
      expect(collectionIds).not.toContain('collection_old')
      expect(collectionIds[0]).toMatch(/^collection_/)
    })

    it('remaps collection nodeIds to new node IDs', () => {
      const wall = makeWallNode({ id: 'wall_aaa' })
      const collection: Collection = {
        id: 'collection_old' as CollectionId,
        name: 'Group A',
        nodeIds: ['wall_aaa' as AnyNodeId],
      }

      const graph: SceneGraph = {
        nodes: { wall_aaa: wall } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
        collections: { collection_old: collection } as Record<CollectionId, Collection>,
      }

      const cloned = cloneSceneGraph(graph)
      const clonedCollection = Object.values(cloned.collections!)[0]!

      expect(clonedCollection.nodeIds).toHaveLength(1)
      expect(clonedCollection.nodeIds).not.toContain('wall_aaa')
      // nodeId should exist in cloned nodes
      expect(cloned.nodes[clonedCollection.nodeIds[0]!]).toBeDefined()
    })

    it('remaps collectionIds on nodes that reference the collection', () => {
      const item = makeItemNode({
        id: 'item_bbb',
        collectionIds: ['collection_old' as CollectionId],
      })
      const collection: Collection = {
        id: 'collection_old' as CollectionId,
        name: 'Group A',
        nodeIds: ['item_bbb' as AnyNodeId],
      }

      const graph: SceneGraph = {
        nodes: { item_bbb: item } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['item_bbb' as AnyNodeId],
        collections: { collection_old: collection } as Record<CollectionId, Collection>,
      }

      const cloned = cloneSceneGraph(graph)
      const clonedItem = Object.values(cloned.nodes)[0]! as Record<string, unknown>
      const newCollectionId = Object.keys(cloned.collections!)[0]!

      expect(clonedItem.collectionIds).toBeDefined()
      expect((clonedItem.collectionIds as string[])).toContain(newCollectionId)
      expect((clonedItem.collectionIds as string[])).not.toContain('collection_old')
    })
  })

  describe('deep clone integrity', () => {
    it('does not mutate the original scene graph', () => {
      const wall = makeWallNode({ id: 'wall_aaa', children: ['item_bbb'] })
      const item = makeItemNode({ id: 'item_bbb', parentId: 'wall_aaa' })

      const graph: SceneGraph = {
        nodes: {
          wall_aaa: wall,
          item_bbb: item,
        } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      // Capture original state
      const originalNodeIds = Object.keys(graph.nodes)
      const originalRootIds = [...graph.rootNodeIds]

      cloneSceneGraph(graph)

      // Original should be unchanged
      expect(Object.keys(graph.nodes)).toEqual(originalNodeIds)
      expect(graph.rootNodeIds).toEqual(originalRootIds)
      expect(graph.nodes['wall_aaa' as AnyNodeId]).toBeDefined()
    })

    it('cloned nodes are independent objects from originals', () => {
      const wall = makeWallNode({ id: 'wall_aaa' })
      const graph: SceneGraph = {
        nodes: { wall_aaa: wall } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)
      const clonedWall = Object.values(cloned.nodes)[0]!

      // They should not be the same reference
      expect(clonedWall).not.toBe(wall)
    })
  })

  describe('edge cases', () => {
    it('empty scene graph returns empty result', () => {
      const graph: SceneGraph = {
        nodes: {},
        rootNodeIds: [],
      }

      const cloned = cloneSceneGraph(graph)

      expect(Object.keys(cloned.nodes)).toHaveLength(0)
      expect(cloned.rootNodeIds).toHaveLength(0)
    })

    it('scene graph without collections returns result without collections key', () => {
      const wall = makeWallNode({ id: 'wall_aaa' })
      const graph: SceneGraph = {
        nodes: { wall_aaa: wall } as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['wall_aaa' as AnyNodeId],
      }

      const cloned = cloneSceneGraph(graph)
      expect(cloned.collections).toBeUndefined()
    })

    it('handles nodes with IDs that have no underscore — defaults prefix to "node"', () => {
      const wall = makeWallNode({ id: 'nounderscore' })
      const graph: SceneGraph = {
        nodes: { nounderscore: wall } as unknown as Record<AnyNodeId, AnyNode>,
        rootNodeIds: ['nounderscore' as AnyNodeId],
      }

      // Should not throw
      expect(() => cloneSceneGraph(graph)).not.toThrow()
      const cloned = cloneSceneGraph(graph)
      const newId = Object.keys(cloned.nodes)[0]!
      expect(newId).toMatch(/^node_/)
    })
  })
})
