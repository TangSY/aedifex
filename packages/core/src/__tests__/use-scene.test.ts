import { beforeEach, describe, expect, it, vi } from 'vitest'

// requestAnimationFrame is not available in node environment — stub it
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0)
  return 0
})
vi.stubGlobal('cancelAnimationFrame', () => {})

import { WallNode } from '../schema/nodes/wall'
import { ItemNode } from '../schema/nodes/item'
import { LevelNode } from '../schema/nodes/level'
import useScene from '../store/use-scene'
import type { AnyNode, AnyNodeId } from '../schema/types'

// ============================================================================
// Helpers
// ============================================================================

function makeWall(overrides?: Partial<{ id: string; start: [number, number]; end: [number, number] }>): AnyNode {
  return WallNode.parse({
    id: overrides?.id,
    start: overrides?.start ?? [0, 0],
    end: overrides?.end ?? [5, 0],
  }) as AnyNode
}

function makeItem(overrides?: Partial<{ id: string }>): AnyNode {
  return ItemNode.parse({
    id: overrides?.id,
    asset: {
      id: 'sofa', category: 'furniture', name: 'Sofa',
      // v0.6.0 added URL whitelist validation on asset.src — must match
      // asset://, blob:, data:image/, /path, https://, or http://localhost.
      thumbnail: 'asset://thumbnail/sofa.png', src: 'asset://item/sofa.glb',
    },
  }) as AnyNode
}

function makeLevel(): AnyNode {
  return LevelNode.parse({}) as AnyNode
}

// ============================================================================
// Reset store state before each test
// ============================================================================

beforeEach(() => {
  useScene.getState().unloadScene()
})

// ============================================================================
// createNode
// ============================================================================

describe('useScene.createNode', () => {
  it('adds node to store without a parent', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)

    const state = useScene.getState()
    expect(state.nodes[wall.id as AnyNodeId]).toBeDefined()
    expect(state.nodes[wall.id as AnyNodeId]!.id).toBe(wall.id)
  })

  it('adds node to store with a parent', () => {
    const level = makeLevel()
    useScene.getState().createNode(level)

    const wall = makeWall()
    useScene.getState().createNode(wall, level.id as AnyNodeId)

    const state = useScene.getState()
    expect(state.nodes[wall.id as AnyNodeId]).toBeDefined()
    expect(state.nodes[wall.id as AnyNodeId]!.parentId).toBe(level.id)

    const parent = state.nodes[level.id as AnyNodeId] as AnyNode & { children: string[] }
    expect(parent.children).toContain(wall.id)
  })

  it('adds node to rootNodeIds when no parent', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)
    expect(useScene.getState().rootNodeIds).toContain(wall.id)
  })

  it('does not add duplicate root IDs on repeated createNode calls with same id', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)
    useScene.getState().createNode(wall)
    const rootIds = useScene.getState().rootNodeIds
    const count = rootIds.filter((id) => id === wall.id).length
    expect(count).toBe(1)
  })

  it('marks node as dirty after creation', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)
    expect(useScene.getState().dirtyNodes.has(wall.id as AnyNodeId)).toBe(true)
  })
})

// ============================================================================
// updateNode
// ============================================================================

describe('useScene.updateNode', () => {
  it('merges partial update into existing node', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)

    useScene.getState().updateNode(wall.id as AnyNodeId, { name: 'Updated Wall' })

    const updated = useScene.getState().nodes[wall.id as AnyNodeId]!
    expect(updated.name).toBe('Updated Wall')
    // Other fields should be preserved
    expect((updated as unknown as { start: [number, number] }).start).toEqual([0, 0])
  })

  it('does nothing for non-existent node id', () => {
    // Should not throw
    expect(() => {
      useScene.getState().updateNode('wall_nonexistent' as AnyNodeId, { name: 'Ghost' })
    }).not.toThrow()
  })

  it('preserves all other fields when updating one field', () => {
    const item = makeItem()
    useScene.getState().createNode(item)

    useScene.getState().updateNode(item.id as AnyNodeId, { visible: false })

    const updated = useScene.getState().nodes[item.id as AnyNodeId]!
    expect(updated.visible).toBe(false)
    expect(updated.type).toBe('item')
  })
})

// ============================================================================
// deleteNode / cascading children
// ============================================================================

describe('useScene.deleteNode', () => {
  it('removes node from store', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)
    useScene.getState().deleteNode(wall.id as AnyNodeId)

    expect(useScene.getState().nodes[wall.id as AnyNodeId]).toBeUndefined()
  })

  it('removes node from parent children list', () => {
    const level = makeLevel()
    useScene.getState().createNode(level)

    const wall = makeWall()
    useScene.getState().createNode(wall, level.id as AnyNodeId)
    useScene.getState().deleteNode(wall.id as AnyNodeId)

    const parent = useScene.getState().nodes[level.id as AnyNodeId] as AnyNode & { children: string[] }
    expect(parent.children).not.toContain(wall.id)
  })

  it('removes node from rootNodeIds when it is a root', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)
    useScene.getState().deleteNode(wall.id as AnyNodeId)

    expect(useScene.getState().rootNodeIds).not.toContain(wall.id)
  })

  it('does nothing for non-existent node id', () => {
    expect(() => {
      useScene.getState().deleteNode('wall_ghost' as AnyNodeId)
    }).not.toThrow()
  })
})

// ============================================================================
// getNode — reading from nodes map
// ============================================================================

describe('useScene nodes map (getNode equivalent)', () => {
  it('returns node by ID', () => {
    const wall = makeWall()
    useScene.getState().createNode(wall)

    const found = useScene.getState().nodes[wall.id as AnyNodeId]
    expect(found).toBeDefined()
    expect(found!.id).toBe(wall.id)
  })

  it('returns undefined for unknown ID', () => {
    const found = useScene.getState().nodes['wall_unknown' as AnyNodeId]
    expect(found).toBeUndefined()
  })
})

// ============================================================================
// serializeSceneData
// ============================================================================

// NOTE: Tests for serializeSceneData / parseSceneData / CURRENT_SCHEMA_VERSION
// were removed when the scene serialization API was refactored — these helpers
// are no longer publicly exported from `../store/use-scene`. Persistence is now
// covered by the editor-side scene.ts which is exercised through integration
// scenarios rather than unit tests in core.

// ============================================================================
// loadScene — default scene hierarchy
// ============================================================================

describe('useScene.loadScene', () => {
  it('creates Site → Building → Level hierarchy', () => {
    useScene.getState().loadScene()
    const state = useScene.getState()

    expect(state.rootNodeIds).toHaveLength(1)

    const siteId = state.rootNodeIds[0]!
    const site = state.nodes[siteId]!
    expect(site.type).toBe('site')

    const siteNode = site as AnyNode & { children: AnyNode[] }
    expect(siteNode.children).toHaveLength(1)
  })

  it('does not reset scene if already loaded', () => {
    useScene.getState().loadScene()
    const firstRootIds = [...useScene.getState().rootNodeIds]

    useScene.getState().loadScene()
    const secondRootIds = useScene.getState().rootNodeIds
    expect(secondRootIds).toEqual(firstRootIds)
  })
})

// ============================================================================
// createNodes (batch)
// ============================================================================

describe('useScene.createNodes', () => {
  it('adds multiple nodes atomically', () => {
    const wall1 = makeWall()
    const wall2 = makeWall()

    useScene.getState().createNodes([
      { node: wall1 },
      { node: wall2 },
    ])

    const state = useScene.getState()
    expect(state.nodes[wall1.id as AnyNodeId]).toBeDefined()
    expect(state.nodes[wall2.id as AnyNodeId]).toBeDefined()
  })
})
