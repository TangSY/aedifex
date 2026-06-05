import { beforeEach, describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../schema/types'
import { resetSceneHistoryPauseDepth } from '../store/history-control'
import { createSceneApi, type SceneStoreLike } from './scene-api'

function makeFakeStore(initial: Record<string, AnyNode> = {}) {
  const state = {
    nodes: { ...initial } as Record<AnyNodeId, AnyNode>,
    rootNodeIds: [] as AnyNodeId[],
    dirtyNodes: new Set<AnyNodeId>(),
    createNode(node: AnyNode) {
      state.nodes[node.id] = node
    },
    createNodes(ops: { node: AnyNode; parentId?: AnyNodeId }[]) {
      for (const op of ops) state.nodes[op.node.id] = op.node
    },
    updateNode(id: AnyNodeId, data: Partial<AnyNode>) {
      const existing = state.nodes[id]
      if (existing) state.nodes[id] = { ...existing, ...data } as AnyNode
    },
    deleteNode(id: AnyNodeId) {
      delete state.nodes[id]
    },
    markDirty(id: AnyNodeId) {
      state.dirtyNodes.add(id)
    },
  }

  const temporal = {
    getState: () => ({
      pause: () => {},
      resume: () => {},
    }),
  }

  const store: SceneStoreLike = {
    getState: () => state,
    temporal,
  }
  return { store, state }
}

function makeNode(id: string, type = 'shelf', extra: Record<string, unknown> = {}): AnyNode {
  return {
    object: 'node',
    id,
    type,
    parentId: null,
    visible: true,
    metadata: {},
    ...extra,
  } as unknown as AnyNode
}

const id = (s: string) => s as AnyNodeId

describe('SceneApi.get — graceful undefined handling', () => {
  beforeEach(() => {
    resetSceneHistoryPauseDepth()
  })

  test('returns undefined when the node id is unknown', () => {
    // Source: `store.getState().nodes[id] as N | undefined`.
    const { store } = makeFakeStore()
    const api = createSceneApi(store)
    expect(api.get(id('missing'))).toBeUndefined()
  })

  test('nodes() returns the live record reference (read-only contract)', () => {
    const { store, state } = makeFakeStore({ a: makeNode('a') })
    const api = createSceneApi(store)
    expect(api.nodes()).toBe(state.nodes as Readonly<Record<AnyNodeId, AnyNode>>)
  })
})

describe('SceneApi.cloneNodesInto', () => {
  beforeEach(() => {
    resetSceneHistoryPauseDepth()
  })

  test('inserts cloned subtree via batch createNodes when available', () => {
    // Verifies the batch-vs-loop branch in scene-api's cloneNodesInto.
    const { store, state } = makeFakeStore()
    const api = createSceneApi(store)
    const orig = makeNode('shelf_orig', 'shelf', {
      position: [0, 0, 0],
      children: ['item_a'],
    })
    const child = makeNode('item_a', 'item', { parentId: 'shelf_orig' })
    const newRootId = api.cloneNodesInto([orig, child], {
      rootId: id('shelf_orig'),
    })
    expect(newRootId).not.toBeNull()
    expect(typeof newRootId).toBe('string')
    // Both new nodes landed in the store.
    expect(Object.keys(state.nodes).length).toBe(2)
  })

  test('falls back to per-node createNode when createNodes is missing', () => {
    // Build a minimal store WITHOUT createNodes. The scene-api code path
    // is `if (batch) ... else for (const op of ops) createNode(op.node, op.parentId)`.
    const state = {
      nodes: {} as Record<AnyNodeId, AnyNode>,
      rootNodeIds: [] as AnyNodeId[],
      dirtyNodes: new Set<AnyNodeId>(),
      createNode(node: AnyNode) {
        state.nodes[node.id] = node
      },
      updateNode(id: AnyNodeId, data: Partial<AnyNode>) {
        const existing = state.nodes[id]
        if (existing) state.nodes[id] = { ...existing, ...data } as AnyNode
      },
      deleteNode(id: AnyNodeId) {
        delete state.nodes[id]
      },
      markDirty(id: AnyNodeId) {
        state.dirtyNodes.add(id)
      },
    }
    const store: SceneStoreLike = {
      getState: () => state,
      temporal: { getState: () => ({ pause: () => {}, resume: () => {} }) },
    }
    const api = createSceneApi(store)
    const orig = makeNode('shelf_orig', 'shelf', { position: [1, 0, 1] })
    const newRootId = api.cloneNodesInto([orig], {
      rootId: id('shelf_orig'),
    })
    expect(newRootId).not.toBeNull()
    expect(Object.keys(state.nodes).length).toBe(1)
  })
})

describe('SceneApi.getSubtree — graceful undefined handling', () => {
  beforeEach(() => {
    resetSceneHistoryPauseDepth()
  })

  test('returns null when rootId is missing from the store', () => {
    // Forwards through to `collectSubtree`, which returns null for an
    // unknown root.
    const { store } = makeFakeStore()
    const api = createSceneApi(store)
    expect(api.getSubtree(id('missing'))).toBeNull()
  })
})
