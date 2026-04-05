import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createNodesAction,
  updateNodesAction,
  deleteNodesAction,
} from '../store/actions/node-actions'
import type { SceneState } from '../store/use-scene'
import type { AnyNode, AnyNodeId } from '../schema/types'
import type { Collection, CollectionId } from '../schema/collections'

// ============================================================================
// Mock requestAnimationFrame / cancelAnimationFrame
// (node environment has no RAF; updateNodesAction uses them for dirty batching)
// ============================================================================

let rafCallback: (() => void) | null = null

beforeEach(() => {
  rafCallback = null

  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCallback = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Helper: flush the pending RAF callback if present */
function flushRaf() {
  if (rafCallback) {
    rafCallback()
    rafCallback = null
  }
}

// ============================================================================
// Fixtures & helpers
// ============================================================================

function makeWallNode(id: string, parentId: string | null = null): AnyNode {
  return {
    object: 'node',
    id,
    type: 'wall',
    parentId,
    visible: true,
    metadata: {},
    children: [],
    start: [0, 0] as [number, number],
    end: [1, 0] as [number, number],
    frontSide: 'unknown',
    backSide: 'unknown',
  } as unknown as AnyNode
}

function makeLevelNode(id: string, children: string[] = [], parentId: string | null = null): AnyNode {
  return {
    object: 'node',
    id,
    type: 'level',
    parentId,
    visible: true,
    metadata: {},
    children,
    level: 0,
  } as unknown as AnyNode
}

function makeItemNode(
  id: string,
  parentId: string | null = null,
  collectionIds?: CollectionId[],
): AnyNode {
  return {
    object: 'node',
    id,
    type: 'item',
    parentId,
    visible: true,
    metadata: {},
    children: [],
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    collectionIds: collectionIds ?? [],
    asset: {
      id: 'test',
      category: 'furniture',
      name: 'Test',
      thumbnail: '',
      src: '',
      dimensions: [1, 1, 1] as [number, number, number],
      offset: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    },
  } as unknown as AnyNode
}

/**
 * Create a minimal SceneState with mock `set` / `get` pair.
 * The `set` function applies the partial state update immediately so tests can
 * inspect state after the action.
 */
function makeStore(initial: Partial<SceneState> = {}): {
  state: SceneState
  set: (fn: (s: SceneState) => Partial<SceneState>) => void
  get: () => SceneState
  markDirty: ReturnType<typeof vi.fn>
} {
  const markDirty = vi.fn()

  const state: SceneState = {
    nodes: {},
    rootNodeIds: [],
    dirtyNodes: new Set(),
    collections: {} as Record<CollectionId, Collection>,
    nodesVersion: 0,
    markDirty,
    clearDirty: vi.fn(),
    loadScene: vi.fn(),
    clearScene: vi.fn(),
    unloadScene: vi.fn(),
    setScene: vi.fn(),
    createNode: vi.fn(),
    createNodes: vi.fn(),
    updateNode: vi.fn(),
    updateNodes: vi.fn(),
    deleteNode: vi.fn(),
    deleteNodes: vi.fn(),
    createCollection: vi.fn(),
    deleteCollection: vi.fn(),
    updateCollection: vi.fn(),
    addToCollection: vi.fn(),
    removeFromCollection: vi.fn(),
    ...initial,
  }

  const set = (fn: (s: SceneState) => Partial<SceneState>) => {
    const updates = fn(state)
    Object.assign(state, updates)
  }

  const get = () => state

  return { state, set, get, markDirty }
}

// ============================================================================
// createNodesAction
// ============================================================================

describe('createNodesAction', () => {
  it('adds a node to state.nodes', () => {
    const { state, set, get } = makeStore()
    const wall = makeWallNode('wall_001')

    createNodesAction(set, get, [{ node: wall }])

    expect(state.nodes['wall_001' as AnyNodeId]).toBeDefined()
    expect(state.nodes['wall_001' as AnyNodeId]!.id).toBe('wall_001')
  })

  it('adds a root node to rootNodeIds when no parentId is specified', () => {
    const { state, set, get } = makeStore()
    const wall = makeWallNode('wall_root')

    createNodesAction(set, get, [{ node: wall }])

    expect(state.rootNodeIds).toContain('wall_root')
  })

  it('does not add to rootNodeIds when a parentId is specified', () => {
    const level = makeLevelNode('level_001')
    const { state, set, get } = makeStore({
      nodes: { level_001: level } as Record<AnyNodeId, AnyNode>,
    })
    const wall = makeWallNode('wall_child')

    createNodesAction(set, get, [{ node: wall, parentId: 'level_001' as AnyNodeId }])

    expect(state.rootNodeIds).not.toContain('wall_child')
  })

  it("adds child ID to the parent's children array", () => {
    const level = makeLevelNode('level_001', [])
    const { state, set, get } = makeStore({
      nodes: { level_001: level } as Record<AnyNodeId, AnyNode>,
    })
    const wall = makeWallNode('wall_child')

    createNodesAction(set, get, [{ node: wall, parentId: 'level_001' as AnyNodeId }])

    const parent = state.nodes['level_001' as AnyNodeId] as Record<string, unknown>
    expect((parent.children as string[])).toContain('wall_child')
  })

  it("deduplicates children — calling createNode twice doesn't add the same child twice", () => {
    const level = makeLevelNode('level_001', [])
    const { state, set, get } = makeStore({
      nodes: { level_001: level } as Record<AnyNodeId, AnyNode>,
    })
    const wall = makeWallNode('wall_child')

    createNodesAction(set, get, [{ node: wall, parentId: 'level_001' as AnyNodeId }])
    createNodesAction(set, get, [{ node: wall, parentId: 'level_001' as AnyNodeId }])

    const parent = state.nodes['level_001' as AnyNodeId] as Record<string, unknown>
    const children = parent.children as string[]
    const count = children.filter((c) => c === 'wall_child').length
    expect(count).toBe(1)
  })

  it('increments nodesVersion', () => {
    const { state, set, get } = makeStore({ nodesVersion: 5 })
    const wall = makeWallNode('wall_v')

    createNodesAction(set, get, [{ node: wall }])

    expect(state.nodesVersion).toBe(6)
  })

  it('calls markDirty for the new node', () => {
    const { set, get, markDirty } = makeStore()
    const wall = makeWallNode('wall_dirty')

    createNodesAction(set, get, [{ node: wall }])

    expect(markDirty).toHaveBeenCalledWith('wall_dirty')
  })

  it('assigns the provided parentId to the node in state', () => {
    const level = makeLevelNode('level_parent')
    const { state, set, get } = makeStore({
      nodes: { level_parent: level } as Record<AnyNodeId, AnyNode>,
    })
    const wall = makeWallNode('wall_orphan')

    createNodesAction(set, get, [{ node: wall, parentId: 'level_parent' as AnyNodeId }])

    expect(state.nodes['wall_orphan' as AnyNodeId]!.parentId).toBe('level_parent')
  })

  it('creates multiple nodes in a single call', () => {
    const level = makeLevelNode('level_multi')
    const { state, set, get } = makeStore({
      nodes: { level_multi: level } as Record<AnyNodeId, AnyNode>,
    })

    const wall1 = makeWallNode('wall_m1')
    const wall2 = makeWallNode('wall_m2')

    createNodesAction(set, get, [
      { node: wall1, parentId: 'level_multi' as AnyNodeId },
      { node: wall2, parentId: 'level_multi' as AnyNodeId },
    ])

    expect(state.nodes['wall_m1' as AnyNodeId]).toBeDefined()
    expect(state.nodes['wall_m2' as AnyNodeId]).toBeDefined()
  })
})

// ============================================================================
// updateNodesAction
// ============================================================================

describe('updateNodesAction', () => {
  it('merges data into existing node', () => {
    const wall = makeWallNode('wall_upd')
    const { state, set, get } = makeStore({
      nodes: { wall_upd: wall } as Record<AnyNodeId, AnyNode>,
    })

    updateNodesAction(set, get, [{ id: 'wall_upd' as AnyNodeId, data: { name: 'Updated Wall' } }])

    expect(state.nodes['wall_upd' as AnyNodeId]!.name).toBe('Updated Wall')
  })

  it('increments nodesVersion', () => {
    const wall = makeWallNode('wall_ver')
    const { state, set, get } = makeStore({
      nodes: { wall_ver: wall } as Record<AnyNodeId, AnyNode>,
      nodesVersion: 3,
    })

    updateNodesAction(set, get, [{ id: 'wall_ver' as AnyNodeId, data: { name: 'v2' } }])

    expect(state.nodesVersion).toBe(4)
  })

  it('calls markDirty via RAF for the updated node', () => {
    const wall = makeWallNode('wall_raf')
    const { set, get, markDirty } = makeStore({
      nodes: { wall_raf: wall } as Record<AnyNodeId, AnyNode>,
    })

    updateNodesAction(set, get, [{ id: 'wall_raf' as AnyNodeId, data: { name: 'dirty' } }])
    flushRaf()

    expect(markDirty).toHaveBeenCalledWith('wall_raf')
  })

  it('handles reparenting — removes from old parent children', () => {
    const oldParent = makeLevelNode('level_old', ['wall_rp'])
    const newParent = makeLevelNode('level_new', [])
    const wall = makeWallNode('wall_rp', 'level_old')

    const { state, set, get } = makeStore({
      nodes: {
        level_old: oldParent,
        level_new: newParent,
        wall_rp: wall,
      } as Record<AnyNodeId, AnyNode>,
    })

    updateNodesAction(set, get, [
      { id: 'wall_rp' as AnyNodeId, data: { parentId: 'level_new' as AnyNodeId } },
    ])

    const oldParentNode = state.nodes['level_old' as AnyNodeId] as Record<string, unknown>
    expect((oldParentNode.children as string[])).not.toContain('wall_rp')
  })

  it('handles reparenting — adds to new parent children', () => {
    const oldParent = makeLevelNode('level_src', ['wall_move'])
    const newParent = makeLevelNode('level_dst', [])
    const wall = makeWallNode('wall_move', 'level_src')

    const { state, set, get } = makeStore({
      nodes: {
        level_src: oldParent,
        level_dst: newParent,
        wall_move: wall,
      } as Record<AnyNodeId, AnyNode>,
    })

    updateNodesAction(set, get, [
      { id: 'wall_move' as AnyNodeId, data: { parentId: 'level_dst' as AnyNodeId } },
    ])

    const newParentNode = state.nodes['level_dst' as AnyNodeId] as Record<string, unknown>
    expect((newParentNode.children as string[])).toContain('wall_move')
  })

  it('silently ignores update for non-existent node', () => {
    const { state, set, get } = makeStore()

    expect(() => {
      updateNodesAction(set, get, [
        { id: 'ghost_node' as AnyNodeId, data: { name: 'nope' } },
      ])
    }).not.toThrow()

    expect(state.nodes['ghost_node' as AnyNodeId]).toBeUndefined()
  })
})

// ============================================================================
// deleteNodesAction
// ============================================================================

describe('deleteNodesAction', () => {
  it('removes the node from state.nodes', () => {
    const wall = makeWallNode('wall_del')
    const { state, set, get } = makeStore({
      nodes: { wall_del: wall } as Record<AnyNodeId, AnyNode>,
    })

    deleteNodesAction(set, get, ['wall_del' as AnyNodeId])

    expect(state.nodes['wall_del' as AnyNodeId]).toBeUndefined()
  })

  it('removes the node ID from rootNodeIds', () => {
    const wall = makeWallNode('wall_root_del')
    const { state, set, get } = makeStore({
      nodes: { wall_root_del: wall } as Record<AnyNodeId, AnyNode>,
      rootNodeIds: ['wall_root_del' as AnyNodeId],
    })

    deleteNodesAction(set, get, ['wall_root_del' as AnyNodeId])

    expect(state.rootNodeIds).not.toContain('wall_root_del')
  })

  it("removes child ID from parent's children array", () => {
    const level = makeLevelNode('level_parent_del', ['wall_child_del'])
    const wall = makeWallNode('wall_child_del', 'level_parent_del')

    const { state, set, get } = makeStore({
      nodes: {
        level_parent_del: level,
        wall_child_del: wall,
      } as Record<AnyNodeId, AnyNode>,
    })

    deleteNodesAction(set, get, ['wall_child_del' as AnyNodeId])

    const parent = state.nodes['level_parent_del' as AnyNodeId] as Record<string, unknown>
    expect((parent.children as string[])).not.toContain('wall_child_del')
  })

  it('cascades deletion to all descendants', () => {
    // level → wall → item (3 levels deep)
    const item = makeItemNode('item_child_cascade', 'wall_cascade')
    const wall = makeWallNode('wall_cascade', 'level_cascade')
    ;(wall as Record<string, unknown>).children = ['item_child_cascade']
    const level = makeLevelNode('level_cascade', ['wall_cascade'])

    const { state, set, get } = makeStore({
      nodes: {
        level_cascade: level,
        wall_cascade: wall,
        item_child_cascade: item,
      } as Record<AnyNodeId, AnyNode>,
      rootNodeIds: ['level_cascade' as AnyNodeId],
    })

    // Delete the level — should cascade to wall and item
    deleteNodesAction(set, get, ['level_cascade' as AnyNodeId])

    expect(state.nodes['level_cascade' as AnyNodeId]).toBeUndefined()
    expect(state.nodes['wall_cascade' as AnyNodeId]).toBeUndefined()
    expect(state.nodes['item_child_cascade' as AnyNodeId]).toBeUndefined()
  })

  it('increments nodesVersion', () => {
    const wall = makeWallNode('wall_ver_del')
    const { state, set, get } = makeStore({
      nodes: { wall_ver_del: wall } as Record<AnyNodeId, AnyNode>,
      nodesVersion: 10,
    })

    deleteNodesAction(set, get, ['wall_ver_del' as AnyNodeId])

    expect(state.nodesVersion).toBe(11)
  })

  it('removes node from collection nodeIds when deleted', () => {
    const collectionId = 'collection_grp' as CollectionId
    const item = makeItemNode('item_in_col', null, [collectionId])
    const collection: Collection = {
      id: collectionId,
      name: 'My Group',
      nodeIds: ['item_in_col' as AnyNodeId],
    }

    const { state, set, get } = makeStore({
      nodes: { item_in_col: item } as Record<AnyNodeId, AnyNode>,
      rootNodeIds: ['item_in_col' as AnyNodeId],
      collections: { collection_grp: collection } as Record<CollectionId, Collection>,
    })

    deleteNodesAction(set, get, ['item_in_col' as AnyNodeId])

    expect(state.collections[collectionId]!.nodeIds).not.toContain('item_in_col')
  })

  it('does not throw when deleting a non-existent node', () => {
    const { set, get } = makeStore()

    expect(() => {
      deleteNodesAction(set, get, ['ghost_node' as AnyNodeId])
    }).not.toThrow()
  })

  it('deletes multiple nodes in one call', () => {
    const wall1 = makeWallNode('wall_batch1')
    const wall2 = makeWallNode('wall_batch2')

    const { state, set, get } = makeStore({
      nodes: {
        wall_batch1: wall1,
        wall_batch2: wall2,
      } as Record<AnyNodeId, AnyNode>,
      rootNodeIds: ['wall_batch1', 'wall_batch2'] as AnyNodeId[],
    })

    deleteNodesAction(set, get, ['wall_batch1' as AnyNodeId, 'wall_batch2' as AnyNodeId])

    expect(state.nodes['wall_batch1' as AnyNodeId]).toBeUndefined()
    expect(state.nodes['wall_batch2' as AnyNodeId]).toBeUndefined()
  })

  it('calls markDirty on the parent of the deleted node', () => {
    const level = makeLevelNode('level_mark_dirty', ['wall_mark_dirty'])
    const wall = makeWallNode('wall_mark_dirty', 'level_mark_dirty')

    const { set, get, markDirty } = makeStore({
      nodes: {
        level_mark_dirty: level,
        wall_mark_dirty: wall,
      } as Record<AnyNodeId, AnyNode>,
    })

    deleteNodesAction(set, get, ['wall_mark_dirty' as AnyNodeId])

    expect(markDirty).toHaveBeenCalledWith('level_mark_dirty')
  })
})
