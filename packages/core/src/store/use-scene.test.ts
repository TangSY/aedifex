import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../schema/types'
import useScene, { clearSceneHistory } from './use-scene'

// bun:test has no DOM — node-actions schedules markDirty via requestAnimationFrame,
// so polyfill it as synchronous. Mirrors what reparent.test.ts does.
type RafFn = (cb: (t: number) => void) => number
;(globalThis as unknown as { requestAnimationFrame?: RafFn }).requestAnimationFrame ??= ((
  cb: (t: number) => void,
) => {
  cb(0)
  return 0
}) as RafFn
;(globalThis as unknown as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame ??=
  () => {}

// Suppress console.warn during setScene orphan-removal — we assert on the
// spy in the relevant tests but don't want noise from the unrelated cases.
const originalWarn = console.warn
let warnSpy: ReturnType<typeof mock> | null = null

beforeEach(() => {
  warnSpy = mock(() => {})
  console.warn = warnSpy as unknown as typeof console.warn
  useScene.setState({
    nodes: {},
    rootNodeIds: [],
    dirtyNodes: new Set<AnyNodeId>(),
    collections: {},
    readOnly: false,
  } as never)
  clearSceneHistory()
})

afterEach(() => {
  console.warn = originalWarn
  warnSpy = null
  useScene.setState({ readOnly: false } as never)
})

function makeSite(id = 'site_1' as AnyNodeId, children: AnyNodeId[] = []): AnyNode {
  return {
    id,
    type: 'site',
    parentId: null,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    children,
  } as unknown as AnyNode
}

function makeBuilding(
  id = 'building_1' as AnyNodeId,
  parentId: AnyNodeId | null = 'site_1' as AnyNodeId,
  children: AnyNodeId[] = [],
): AnyNode {
  return {
    id,
    type: 'building',
    parentId,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    children,
  } as unknown as AnyNode
}

function makeLevel(
  id = 'level_1' as AnyNodeId,
  parentId: AnyNodeId | null = 'building_1' as AnyNodeId,
): AnyNode {
  return {
    id,
    type: 'level',
    parentId,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    level: 0,
    children: [],
  } as unknown as AnyNode
}

describe('setScene — orphan removal', () => {
  test('drops nodes whose parentId references a missing parent and warns', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const orphan: AnyNode = {
      id: 'wall_orphan',
      type: 'wall',
      parentId: 'level_ghost', // parent doesn't exist
      object: 'node',
      visible: true,
      name: '',
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      start: [0, 0],
      end: [1, 0],
      thickness: 0.1,
      children: [],
      frontSide: 'unknown',
      backSide: 'unknown',
    } as unknown as AnyNode

    useScene.getState().setScene(
      {
        [site.id]: site,
        [orphan.id]: orphan,
      } as Record<AnyNodeId, AnyNode>,
      [site.id],
    )

    const result = useScene.getState().nodes
    expect(result['site_1' as AnyNodeId]).toBeDefined()
    expect(result['wall_orphan' as AnyNodeId]).toBeUndefined()
    // console.warn must have been called for the orphan
    const calls = (warnSpy?.mock.calls ?? []) as unknown[][]
    const orphanCall = calls.find(
      (args) => typeof args[1] === 'string' && (args[1] as string) === 'wall_orphan',
    )
    expect(orphanCall).toBeDefined()
  })

  test('keeps nodes when their parent exists', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [])

    useScene.getState().setScene(
      {
        [site.id]: site,
        [building.id]: building,
      } as Record<AnyNodeId, AnyNode>,
      [site.id],
    )

    const result = useScene.getState().nodes
    expect(result['site_1' as AnyNodeId]).toBeDefined()
    expect(result['building_1' as AnyNodeId]).toBeDefined()
  })

  test('marks every loaded node dirty so wall/system re-validation fires', () => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [])

    useScene.getState().setScene(
      {
        [site.id]: site,
        [building.id]: building,
      } as Record<AnyNodeId, AnyNode>,
      [site.id],
    )

    const dirty = useScene.getState().dirtyNodes
    expect(dirty.has('site_1' as AnyNodeId)).toBe(true)
    expect(dirty.has('building_1' as AnyNodeId)).toBe(true)
  })

  test('resets collections to empty', () => {
    // pre-populate collections to confirm setScene wipes them
    useScene.setState({
      collections: { col_x: { id: 'col_x', name: 'old', nodeIds: [] } },
    } as never)
    const site = makeSite('site_1' as AnyNodeId, [])
    useScene.getState().setScene({ [site.id]: site } as Record<AnyNodeId, AnyNode>, [site.id])
    expect(Object.keys(useScene.getState().collections)).toHaveLength(0)
  })
})

describe('loadScene — idempotent guard', () => {
  test('on empty store: creates fresh Site/Building/Level hierarchy', () => {
    expect(useScene.getState().rootNodeIds).toHaveLength(0)
    useScene.getState().loadScene()
    const state = useScene.getState()
    expect(state.rootNodeIds).toHaveLength(1)
    const rootId = state.rootNodeIds[0]
    const root = state.nodes[rootId]
    expect(root?.type).toBe('site')
    // Should have site + building + level = 3 nodes
    expect(Object.keys(state.nodes)).toHaveLength(3)
    const types = Object.values(state.nodes)
      .map((n) => n.type)
      .sort()
    expect(types).toEqual(['building', 'level', 'site'])
  })

  test('on populated store: does NOT re-create Site/Building/Level — only marks dirty', () => {
    // First call populates the default hierarchy
    useScene.getState().loadScene()
    const firstRootId = useScene.getState().rootNodeIds[0]
    const firstNodes = useScene.getState().nodes
    const firstIds = Object.keys(firstNodes).sort()

    // Clear the dirty set to verify re-population marks them again
    useScene.setState({ dirtyNodes: new Set<AnyNodeId>() } as never)

    // Second call should be the idempotent guard branch
    useScene.getState().loadScene()
    const secondNodes = useScene.getState().nodes
    const secondIds = Object.keys(secondNodes).sort()

    // No new node ids — guard prevented re-creation
    expect(secondIds).toEqual(firstIds)
    expect(useScene.getState().rootNodeIds[0]).toBe(firstRootId)
    // But all existing nodes are now marked dirty for re-validation
    const dirty = useScene.getState().dirtyNodes
    for (const id of firstIds) {
      expect(dirty.has(id as AnyNodeId)).toBe(true)
    }
  })

  test('clearScene = unloadScene + loadScene = empty store + fresh hierarchy', () => {
    useScene.getState().loadScene()
    const firstSiteId = useScene.getState().rootNodeIds[0]

    useScene.getState().clearScene()

    const state = useScene.getState()
    expect(state.rootNodeIds).toHaveLength(1)
    // After clearScene, the new site MUST be a freshly generated one — the
    // unloadScene step blew away the original, then loadScene's empty-store
    // branch re-creates. The new id will differ from firstSiteId because
    // SiteNode.parse() generates a new id each call.
    expect(state.rootNodeIds[0]).not.toBe(firstSiteId)
    expect(Object.keys(state.nodes)).toHaveLength(3)
  })

  test('unloadScene clears nodes, rootNodeIds, dirtyNodes, and collections', () => {
    useScene.getState().loadScene()
    useScene.setState({
      dirtyNodes: new Set<AnyNodeId>(['x' as AnyNodeId]),
      collections: { col_a: { id: 'col_a', name: 'a', nodeIds: [] } },
    } as never)

    useScene.getState().unloadScene()
    const state = useScene.getState()
    expect(Object.keys(state.nodes)).toHaveLength(0)
    expect(state.rootNodeIds).toHaveLength(0)
    expect(state.dirtyNodes.size).toBe(0)
    expect(Object.keys(state.collections)).toHaveLength(0)
  })
})

describe('readOnly gate — all mutating actions are no-ops', () => {
  function snapshotNodes() {
    return JSON.stringify(useScene.getState().nodes)
  }
  function snapshotCollections() {
    return JSON.stringify(useScene.getState().collections)
  }

  beforeEach(() => {
    const site = makeSite('site_1' as AnyNodeId, ['building_1' as AnyNodeId])
    const building = makeBuilding('building_1' as AnyNodeId, 'site_1' as AnyNodeId, [
      'level_1' as AnyNodeId,
    ])
    const level = makeLevel('level_1' as AnyNodeId, 'building_1' as AnyNodeId)
    useScene.setState({
      nodes: {
        [site.id]: site,
        [building.id]: building,
        [level.id]: level,
      },
      rootNodeIds: [site.id],
      collections: {},
      readOnly: true,
      dirtyNodes: new Set<AnyNodeId>(),
    } as never)
  })

  test('createNode is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene.getState().createNode(
      {
        id: 'wall_x' as AnyNodeId,
        type: 'wall',
        parentId: 'level_1' as AnyNodeId,
        object: 'node',
        visible: true,
        name: '',
        metadata: {},
        position: [0, 0, 0],
        rotation: 0,
        start: [0, 0],
        end: [1, 0],
        thickness: 0.1,
        children: [],
        frontSide: 'unknown',
        backSide: 'unknown',
      } as unknown as AnyNode,
      'level_1' as AnyNodeId,
    )
    expect(snapshotNodes()).toBe(before)
  })

  test('createNodes is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene.getState().createNodes([
      {
        node: {
          id: 'wall_y' as AnyNodeId,
          type: 'wall',
          parentId: 'level_1' as AnyNodeId,
          object: 'node',
          visible: true,
          name: '',
          metadata: {},
          position: [0, 0, 0],
          rotation: 0,
          start: [0, 0],
          end: [1, 0],
          thickness: 0.1,
          children: [],
          frontSide: 'unknown',
          backSide: 'unknown',
        } as unknown as AnyNode,
        parentId: 'level_1' as AnyNodeId,
      },
    ])
    expect(snapshotNodes()).toBe(before)
  })

  test('updateNode is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene
      .getState()
      .updateNode('site_1' as AnyNodeId, { name: 'changed' } as Partial<AnyNode>)
    expect(snapshotNodes()).toBe(before)
  })

  test('updateNodes is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene
      .getState()
      .updateNodes([{ id: 'site_1' as AnyNodeId, data: { name: 'changed' } as Partial<AnyNode> }])
    expect(snapshotNodes()).toBe(before)
  })

  test('setNode is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene
      .getState()
      .setNode('site_1' as AnyNodeId, makeSite('site_1' as AnyNodeId, ['other' as AnyNodeId]))
    expect(snapshotNodes()).toBe(before)
  })

  test('deleteNode is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene.getState().deleteNode('level_1' as AnyNodeId)
    expect(snapshotNodes()).toBe(before)
  })

  test('deleteNodes is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene.getState().deleteNodes(['level_1' as AnyNodeId])
    expect(snapshotNodes()).toBe(before)
  })

  test('applyNodeChanges is a no-op in readOnly mode', () => {
    const before = snapshotNodes()
    useScene.getState().applyNodeChanges({
      delete: ['level_1' as AnyNodeId],
    })
    expect(snapshotNodes()).toBe(before)
  })

  test('createCollection is a no-op in readOnly mode (returns empty id, no write)', () => {
    const before = snapshotCollections()
    const id = useScene.getState().createCollection('test', [])
    expect(id).toBe('')
    expect(snapshotCollections()).toBe(before)
  })

  test('deleteCollection is a no-op in readOnly mode', () => {
    // Even if a collection were to pre-exist, deletion must be blocked.
    useScene.setState({
      collections: { col_x: { id: 'col_x', name: 'x', nodeIds: [] } },
    } as never)
    const before = snapshotCollections()
    useScene.getState().deleteCollection('col_x')
    expect(snapshotCollections()).toBe(before)
  })

  test('updateCollection is a no-op in readOnly mode', () => {
    useScene.setState({
      collections: { col_x: { id: 'col_x', name: 'x', nodeIds: [] } },
    } as never)
    const before = snapshotCollections()
    useScene.getState().updateCollection('col_x', { name: 'y' })
    expect(snapshotCollections()).toBe(before)
  })

  test('addToCollection is a no-op in readOnly mode', () => {
    useScene.setState({
      collections: { col_x: { id: 'col_x', name: 'x', nodeIds: [] } },
    } as never)
    const before = snapshotCollections()
    useScene.getState().addToCollection('col_x', 'level_1' as AnyNodeId)
    expect(snapshotCollections()).toBe(before)
  })

  test('removeFromCollection is a no-op in readOnly mode', () => {
    useScene.setState({
      collections: { col_x: { id: 'col_x', name: 'x', nodeIds: ['level_1' as AnyNodeId] } },
    } as never)
    const before = snapshotCollections()
    useScene.getState().removeFromCollection('col_x', 'level_1' as AnyNodeId)
    expect(snapshotCollections()).toBe(before)
  })

  test('setReadOnly itself is NOT gated — toggling back to writable lets actions run', () => {
    useScene.getState().setReadOnly(false)
    expect(useScene.getState().readOnly).toBe(false)
    useScene
      .getState()
      .updateNode('site_1' as AnyNodeId, { name: 'now-writable' } as Partial<AnyNode>)
    expect((useScene.getState().nodes['site_1' as AnyNodeId] as { name?: string }).name).toBe(
      'now-writable',
    )
  })
})
