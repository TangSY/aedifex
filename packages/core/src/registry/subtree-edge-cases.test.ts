import { describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../schema/types'
import { cloneNodesInto, collectSubtree } from './subtree'

function makeNode(id: string, type: string, extra: Record<string, unknown> = {}): AnyNode {
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

describe('cloneNodesInto — dangling child references', () => {
  test('silently drops children[] entries that point at nodes not in the input array', () => {
    // Source line 165: `.filter((cid): cid is AnyNodeId => cid !== undefined)`.
    // A `children` entry whose id isn't in idMap → idMap.get(cid) returns
    // undefined → the filter drops it. This is the "external sibling" case.
    const shelf = makeNode('shelf_1', 'shelf', {
      position: [0, 0, 0],
      // 'item_external' is NOT supplied below; it must be silently dropped.
      children: ['item_kept', 'item_external'],
    })
    const itemKept = makeNode('item_kept', 'item', {
      parentId: 'shelf_1',
      position: [0, 0, 0],
    })

    const { nodes: out } = cloneNodesInto([shelf, itemKept], {
      rootId: 'shelf_1' as AnyNodeId,
    })
    const root = out[0] as any
    expect(root.children).toHaveLength(1)
    // The surviving child id is a freshly minted version of item_kept's id.
    const child = out[1] as any
    expect(root.children[0]).toBe(child.id)
  })

  test('drops ALL children when every reference dangles', () => {
    const shelf = makeNode('shelf_1', 'shelf', {
      position: [0, 0, 0],
      children: ['missing_a', 'missing_b'],
    })
    const { nodes: out } = cloneNodesInto([shelf], {
      rootId: 'shelf_1' as AnyNodeId,
    })
    expect((out[0] as any).children).toEqual([])
  })
})

describe('cloneNodesInto — id prefix fallback', () => {
  test('underscore-less original id falls back to the "node_" prefix', () => {
    // Source: `extractIdPrefix(id) = i === -1 ? 'node' : id.slice(0, i)`.
    // When the original id has no underscore at all (legacy data, malformed
    // catalog entry, ...) the prefix is 'node' and `generateId('node')`
    // produces `node_<nanoid>`. Tests pin this so a future refactor that
    // changes the fallback prefix shows up here.
    const orig = makeNode('noprefix' as any, 'wall', {})
    const { rootId, nodes } = cloneNodesInto([orig], {
      rootId: 'noprefix' as AnyNodeId,
    })
    const cloned = nodes[0] as any
    expect(cloned.id).toBe(rootId)
    expect(cloned.id.startsWith('node_')).toBe(true)
    expect(cloned.id).not.toBe('noprefix')
  })

  test('preserves multi-character prefix on ids with one underscore', () => {
    // 'door_orig' → prefix 'door' → generated id starts with 'door_'.
    const orig = makeNode('door_orig', 'door', {})
    const { nodes } = cloneNodesInto([orig], {
      rootId: 'door_orig' as AnyNodeId,
    })
    expect((nodes[0] as any).id.startsWith('door_')).toBe(true)
  })

  test('uses only the slice before the FIRST underscore as prefix', () => {
    // 'compound_kind_abc' → indexOf('_') = 8 → prefix = 'compound'.
    const orig = makeNode('compound_kind_abc', 'wall', {})
    const { nodes } = cloneNodesInto([orig], {
      rootId: 'compound_kind_abc' as AnyNodeId,
    })
    const cloned = nodes[0] as any
    expect(cloned.id.startsWith('compound_')).toBe(true)
    expect(cloned.id.startsWith('compound_kind_')).toBe(false)
  })
})

describe('cloneNodesInto — deep subtree clone preserves chain', () => {
  test('multi-level subtree preserves parent-child remapping at every level', () => {
    // Three levels: shelf > item > child-item (a hypothetical nested item).
    const shelf = makeNode('shelf_1', 'shelf', {
      children: ['item_a'],
    })
    const itemA = makeNode('item_a', 'item', {
      parentId: 'shelf_1',
      children: ['item_a_inner'],
    })
    const inner = makeNode('item_a_inner', 'item', {
      parentId: 'item_a',
    })
    const { rootId, nodes: out } = cloneNodesInto([shelf, itemA, inner], {
      rootId: 'shelf_1' as AnyNodeId,
    })
    expect(out).toHaveLength(3)
    const [root, ...rest] = out as any[]
    expect(root.id).toBe(rootId)
    expect(root.children).toHaveLength(1)
    // The child of root must be the cloned itemA.
    const clonedItemA = rest.find((n) => n.parentId === rootId)
    expect(clonedItemA).toBeDefined()
    expect(clonedItemA.children).toHaveLength(1)
    // The grand-child's parent is the cloned itemA, NOT the root.
    const clonedInner = rest.find((n) => n.parentId !== rootId)
    expect(clonedInner).toBeDefined()
    expect(clonedInner.parentId).toBe(clonedItemA.id)
  })
})

describe('collectSubtree — graceful undefined handling', () => {
  test('returns null for an empty nodes map', () => {
    expect(collectSubtree({}, 'whatever' as AnyNodeId)).toBeNull()
  })

  test('skips dangling child ids during BFS without throwing', () => {
    // The walker reads `nodes[id]`; a missing entry returns undefined and
    // the loop `continue`s. Pin this so a refactor doesn't accidentally
    // dereference the undefined.
    const nodes: Record<AnyNodeId, AnyNode> = {
      ['shelf_1' as AnyNodeId]: makeNode('shelf_1', 'shelf', {
        children: ['item_a', 'item_missing'],
      }),
      ['item_a' as AnyNodeId]: makeNode('item_a', 'item', { parentId: 'shelf_1' }),
    }
    const sub = collectSubtree(nodes, 'shelf_1' as AnyNodeId)
    expect(sub?.descendants.map((n) => n.id)).toEqual(['item_a'])
  })
})
