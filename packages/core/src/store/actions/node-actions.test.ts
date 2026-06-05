import { beforeEach, describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../../schema/types'
import useScene, { clearSceneHistory } from '../use-scene'

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

const LEVEL_ID = 'level_1' as AnyNodeId
const WALL_A_ID = 'wall_a' as AnyNodeId
const WALL_B_ID = 'wall_b' as AnyNodeId
const DOOR_ID = 'door_1' as AnyNodeId

function makeLevel(children: AnyNodeId[] = []): AnyNode {
  return {
    id: LEVEL_ID,
    type: 'level',
    parentId: null,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    level: 0,
    children,
  } as unknown as AnyNode
}

// Build a wall that participates in the merge-on-delete code path.
function makeWall(opts: {
  id: AnyNodeId
  start: [number, number]
  end: [number, number]
  children?: AnyNodeId[]
  thickness?: number
  height?: number
  frontSide?: 'interior' | 'exterior' | 'unknown'
  backSide?: 'interior' | 'exterior' | 'unknown'
  interiorMaterialPreset?: string
  exteriorMaterialPreset?: string
}): AnyNode {
  return {
    id: opts.id,
    type: 'wall',
    parentId: LEVEL_ID,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    start: opts.start,
    end: opts.end,
    thickness: opts.thickness ?? 0.2,
    height: opts.height ?? 2.5,
    children: opts.children ?? [],
    frontSide: opts.frontSide ?? 'unknown',
    backSide: opts.backSide ?? 'unknown',
    interiorMaterialPreset: opts.interiorMaterialPreset ?? 'preset-white',
    exteriorMaterialPreset: opts.exteriorMaterialPreset ?? 'preset-white',
  } as unknown as AnyNode
}

function makeDoor(opts: {
  id: AnyNodeId
  parentId: AnyNodeId
  localX: number
  wallLength: number
}): AnyNode {
  return {
    id: opts.id,
    type: 'door',
    parentId: opts.parentId,
    wallId: opts.parentId as string,
    object: 'node',
    visible: true,
    name: '',
    metadata: {},
    // Wall-local coordinate: local X is distance along the wall from start
    position: [opts.localX, 0, 0],
    rotation: 0,
    // wallT is the parametric 0-1 position along wall
    wallT: opts.localX / Math.max(opts.wallLength, 1e-6),
    width: 0.9,
    height: 2.1,
    children: [],
  } as unknown as AnyNode
}

beforeEach(() => {
  useScene.setState({
    nodes: {},
    rootNodeIds: [],
    dirtyNodes: new Set<AnyNodeId>(),
    collections: {},
    readOnly: false,
  } as never)
  clearSceneHistory()
})

describe('deleteNodesAction — wall merge on collinear walls', () => {
  test('two collinear walls with compatible style merge after deleting middle wall', () => {
    // Three collinear walls along x-axis: A [0,0]-[5,0], M [5,0]-[10,0], B [10,0]-[15,0]
    // Deleting M leaves A and B sharing no point, so the merge code path
    // looks at deleted wall M's junctions: at (5,0) only A meets; at (10,0)
    // only B meets — so the merge between A and B happens IF we delete a wall
    // whose endpoints are shared by exactly 2 remaining walls.
    //
    // Re-think: the merge plan iterates the deleted wall's junctions and
    // finds walls (other than itself) sharing that junction. For a merge to
    // fire, exactly 2 candidates must share a junction. So delete a single
    // wall that connects two collinear neighbors at the SAME junction:
    //   A [0,0]-[5,0], B [5,0]-[10,0]: deleting either ends up with only the
    //   other at that junction → only 1 candidate → no merge.
    //
    // The merge requires deleting a wall that has TWO walls (collinear)
    // sharing ONE of its endpoints. Configure 3 walls meeting at (5,0):
    //   A [0,0]-[5,0], M [5,0]-[5,5] (this is the deleted one), B [5,0]-[10,0]
    // After deleting M, A and B share junction (5,0) and are collinear (both
    // along x-axis on opposite sides). They should merge into [0,0]-[10,0].

    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    const M = makeWall({ id: 'wall_m' as AnyNodeId, start: [5, 0], end: [5, 5] })
    const B = makeWall({ id: WALL_B_ID, start: [5, 0], end: [10, 0] })
    const level = makeLevel([WALL_A_ID, 'wall_m' as AnyNodeId, WALL_B_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A, ['wall_m' as AnyNodeId]: M, [WALL_B_ID]: B },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode('wall_m' as AnyNodeId)

    const state = useScene.getState()
    // M is gone
    expect(state.nodes['wall_m' as AnyNodeId]).toBeUndefined()
    // One of A/B is the merged primary, the other is gone
    const remainingWalls = Object.values(state.nodes).filter((n) => n.type === 'wall')
    expect(remainingWalls).toHaveLength(1)
    const merged = remainingWalls[0] as {
      id: AnyNodeId
      start: [number, number]
      end: [number, number]
    }
    // Merged span is [0,0]-[10,0] regardless of orientation
    const xs = [merged.start[0], merged.end[0]].sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0)
    expect(xs[1]).toBeCloseTo(10)
    expect(merged.start[1]).toBeCloseTo(0)
    expect(merged.end[1]).toBeCloseTo(0)
  })

  test('wall merge re-projects child door onto merged length (wallT recalculated)', () => {
    // A [0,0]-[5,0] hosts a door at localX=2 (wallT=0.4 on its 5m parent).
    // M is the connector. B [5,0]-[10,0]. Delete M → A and B merge into [0,0]-[10,0].
    // The door's worldX was 0 + (5-0)*(2/5) = 2 → on merged wall localX=2,
    // wallT = 2/10 = 0.2.
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0], children: [DOOR_ID] })
    const M = makeWall({ id: 'wall_m' as AnyNodeId, start: [5, 0], end: [5, 5] })
    const B = makeWall({ id: WALL_B_ID, start: [5, 0], end: [10, 0] })
    const door = makeDoor({ id: DOOR_ID, parentId: WALL_A_ID, localX: 2, wallLength: 5 })
    const level = makeLevel([WALL_A_ID, 'wall_m' as AnyNodeId, WALL_B_ID])

    useScene.setState({
      nodes: {
        [LEVEL_ID]: level,
        [WALL_A_ID]: A,
        ['wall_m' as AnyNodeId]: M,
        [WALL_B_ID]: B,
        [DOOR_ID]: door,
      },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode('wall_m' as AnyNodeId)

    const state = useScene.getState()
    const doorAfter = state.nodes[DOOR_ID] as {
      position: [number, number, number]
      wallT?: number
      parentId: AnyNodeId
      wallId: string
    }
    expect(doorAfter).toBeDefined()
    // Door's local X should now be 2 (it was at worldX=2 on the merged 10m wall)
    expect(doorAfter.position[0]).toBeCloseTo(2)
    // wallT is recalculated as localX/mergedLength = 2/10 = 0.2
    expect(doorAfter.wallT).toBeCloseTo(0.2)
    // Door is reparented to the merged primary wall
    const remainingWalls = Object.values(state.nodes).filter((n) => n.type === 'wall')
    expect(remainingWalls).toHaveLength(1)
    const mergedWallId = (remainingWalls[0] as { id: AnyNodeId }).id
    expect(doorAfter.parentId).toBe(mergedWallId)
    expect(doorAfter.wallId).toBe(mergedWallId as string)
  })

  test('merge SKIPPED when thickness differs', () => {
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0], thickness: 0.2 })
    const M = makeWall({ id: 'wall_m' as AnyNodeId, start: [5, 0], end: [5, 5] })
    const B = makeWall({ id: WALL_B_ID, start: [5, 0], end: [10, 0], thickness: 0.4 })
    const level = makeLevel([WALL_A_ID, 'wall_m' as AnyNodeId, WALL_B_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A, ['wall_m' as AnyNodeId]: M, [WALL_B_ID]: B },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode('wall_m' as AnyNodeId)

    const remaining = Object.values(useScene.getState().nodes).filter((n) => n.type === 'wall')
    // Both A and B survive — no merge fired
    expect(remaining).toHaveLength(2)
  })

  test('merge SKIPPED when frontSide differs', () => {
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0], frontSide: 'interior' })
    const M = makeWall({ id: 'wall_m' as AnyNodeId, start: [5, 0], end: [5, 5] })
    const B = makeWall({ id: WALL_B_ID, start: [5, 0], end: [10, 0], frontSide: 'exterior' })
    const level = makeLevel([WALL_A_ID, 'wall_m' as AnyNodeId, WALL_B_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A, ['wall_m' as AnyNodeId]: M, [WALL_B_ID]: B },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode('wall_m' as AnyNodeId)

    const remaining = Object.values(useScene.getState().nodes).filter((n) => n.type === 'wall')
    expect(remaining).toHaveLength(2)
  })

  test('merge SKIPPED when backSide differs', () => {
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0], backSide: 'interior' })
    const M = makeWall({ id: 'wall_m' as AnyNodeId, start: [5, 0], end: [5, 5] })
    const B = makeWall({ id: WALL_B_ID, start: [5, 0], end: [10, 0], backSide: 'exterior' })
    const level = makeLevel([WALL_A_ID, 'wall_m' as AnyNodeId, WALL_B_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A, ['wall_m' as AnyNodeId]: M, [WALL_B_ID]: B },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode('wall_m' as AnyNodeId)

    const remaining = Object.values(useScene.getState().nodes).filter((n) => n.type === 'wall')
    expect(remaining).toHaveLength(2)
  })

  test('merge SKIPPED when interior material preset differs', () => {
    const A = makeWall({
      id: WALL_A_ID,
      start: [0, 0],
      end: [5, 0],
      interiorMaterialPreset: 'preset-white',
    })
    const M = makeWall({ id: 'wall_m' as AnyNodeId, start: [5, 0], end: [5, 5] })
    const B = makeWall({
      id: WALL_B_ID,
      start: [5, 0],
      end: [10, 0],
      interiorMaterialPreset: 'preset-brick',
    })
    const level = makeLevel([WALL_A_ID, 'wall_m' as AnyNodeId, WALL_B_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A, ['wall_m' as AnyNodeId]: M, [WALL_B_ID]: B },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode('wall_m' as AnyNodeId)

    const remaining = Object.values(useScene.getState().nodes).filter((n) => n.type === 'wall')
    expect(remaining).toHaveLength(2)
  })

  test('merge SKIPPED when walls are not collinear (perpendicular)', () => {
    // A goes east, B goes north — not collinear. Deleting M should not merge.
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    const M = makeWall({ id: 'wall_m' as AnyNodeId, start: [5, 0], end: [5, 5] })
    const B = makeWall({ id: WALL_B_ID, start: [5, 0], end: [5, -5] })
    const level = makeLevel([WALL_A_ID, 'wall_m' as AnyNodeId, WALL_B_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A, ['wall_m' as AnyNodeId]: M, [WALL_B_ID]: B },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode('wall_m' as AnyNodeId)

    const remaining = Object.values(useScene.getState().nodes).filter((n) => n.type === 'wall')
    expect(remaining).toHaveLength(2)
  })
})

describe('deleteNodesAction — dirty marking & cascade', () => {
  test('deleting a node cascades to its children', () => {
    const wallWithChild = makeWall({
      id: WALL_A_ID,
      start: [0, 0],
      end: [5, 0],
      children: [DOOR_ID],
    })
    const door = makeDoor({ id: DOOR_ID, parentId: WALL_A_ID, localX: 2, wallLength: 5 })
    const level = makeLevel([WALL_A_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: wallWithChild, [DOOR_ID]: door },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().deleteNode(WALL_A_ID)

    expect(useScene.getState().nodes[WALL_A_ID]).toBeUndefined()
    expect(useScene.getState().nodes[DOOR_ID]).toBeUndefined()
  })

  test('after deletion, parent AND its remaining children are marked dirty (sibling miter rebuild)', () => {
    // Level holds [A, B]. Delete A. After delete: parent (level) is marked dirty,
    // AND B (the surviving sibling) is marked dirty so the wall-miter system
    // can re-compute its junctions.
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    const B = makeWall({ id: WALL_B_ID, start: [5, 0], end: [5, 5] })
    const level = makeLevel([WALL_A_ID, WALL_B_ID])

    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A, [WALL_B_ID]: B },
      rootNodeIds: [LEVEL_ID],
      dirtyNodes: new Set<AnyNodeId>(),
    } as never)

    useScene.getState().deleteNode(WALL_A_ID)

    const dirty = useScene.getState().dirtyNodes
    expect(dirty.has(LEVEL_ID)).toBe(true)
    expect(dirty.has(WALL_B_ID)).toBe(true)
  })
})

describe('setNodeAction — race-safe replacement', () => {
  test('rejects when node id does not match the provided id key', () => {
    const wall = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    const level = makeLevel([WALL_A_ID])
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: wall },
      rootNodeIds: [LEVEL_ID],
    } as never)

    const mismatch = makeWall({ id: 'wall_mismatch' as AnyNodeId, start: [9, 9], end: [10, 10] })
    useScene.getState().setNode(WALL_A_ID, mismatch)

    // The original is untouched and the mismatch was not inserted
    const after = useScene.getState().nodes[WALL_A_ID] as { start: [number, number] }
    expect(after.start).toEqual([0, 0])
    expect(useScene.getState().nodes['wall_mismatch' as AnyNodeId]).toBeUndefined()
  })

  test('skips when the node does not exist (no implicit creation)', () => {
    const level = makeLevel([])
    useScene.setState({
      nodes: { [LEVEL_ID]: level },
      rootNodeIds: [LEVEL_ID],
    } as never)

    const newWall = makeWall({ id: 'wall_new' as AnyNodeId, start: [0, 0], end: [1, 0] })
    useScene.getState().setNode('wall_new' as AnyNodeId, newWall)

    expect(useScene.getState().nodes['wall_new' as AnyNodeId]).toBeUndefined()
  })

  test('successful setNode replaces the entire node (no spread merge)', () => {
    // updateNode would merge — setNode replaces. This is the contract.
    const original = makeWall({
      id: WALL_A_ID,
      start: [0, 0],
      end: [5, 0],
      interiorMaterialPreset: 'preset-fancy',
    })
    const level = makeLevel([WALL_A_ID])
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: original },
      rootNodeIds: [LEVEL_ID],
    } as never)

    // Replacement omits interiorMaterialPreset — it should be GONE after setNode,
    // unlike updateNode which would have preserved it.
    const replacement = makeWall({ id: WALL_A_ID, start: [1, 1], end: [2, 2] })
    // Strip interiorMaterialPreset explicitly to simulate snapshot restore
    delete (replacement as unknown as { interiorMaterialPreset?: string }).interiorMaterialPreset

    useScene.getState().setNode(WALL_A_ID, replacement)

    const after = useScene.getState().nodes[WALL_A_ID] as {
      start: [number, number]
      interiorMaterialPreset?: string
    }
    expect(after.start).toEqual([1, 1])
    // Field was cleared because setNode replaces rather than merges
    expect(after.interiorMaterialPreset).toBeUndefined()
  })

  test('successful setNode marks the node dirty synchronously', () => {
    const wall = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    const level = makeLevel([WALL_A_ID])
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: wall },
      rootNodeIds: [LEVEL_ID],
      dirtyNodes: new Set<AnyNodeId>(),
    } as never)

    const replacement = makeWall({ id: WALL_A_ID, start: [0, 0], end: [10, 0] })
    useScene.getState().setNode(WALL_A_ID, replacement)

    // No RAF flush needed — setNode marks dirty synchronously
    expect(useScene.getState().dirtyNodes.has(WALL_A_ID)).toBe(true)
  })
})

describe('applyNodeChangesAction — ordering & multi-op batches', () => {
  test('updates run before creates (within single batch)', () => {
    const level = makeLevel([WALL_A_ID])
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A },
      rootNodeIds: [LEVEL_ID],
    } as never)

    // Update existing wall AND create a new one in the same batch.
    // If the source code orders update-before-create, both succeed cleanly.
    const newWall = makeWall({ id: WALL_B_ID, start: [5, 0], end: [10, 0] })
    useScene.getState().applyNodeChanges({
      update: [
        {
          id: WALL_A_ID,
          data: { end: [6, 0] } as unknown as Partial<AnyNode>,
        },
      ],
      create: [{ node: newWall, parentId: LEVEL_ID }],
    })

    const after = useScene.getState().nodes
    const updatedA = after[WALL_A_ID] as { end: [number, number] }
    const createdB = after[WALL_B_ID] as { start: [number, number] }
    expect(updatedA.end).toEqual([6, 0])
    expect(createdB.start).toEqual([5, 0])
    // Both should be in level.children
    const levelAfter = after[LEVEL_ID] as { children: AnyNodeId[] }
    expect(levelAfter.children).toContain(WALL_A_ID)
    expect(levelAfter.children).toContain(WALL_B_ID)
  })

  test('updates → creates → deletes in single batch: delete wins last', () => {
    const level = makeLevel([WALL_A_ID])
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A },
      rootNodeIds: [LEVEL_ID],
    } as never)

    const newWall = makeWall({ id: WALL_B_ID, start: [5, 0], end: [10, 0] })
    useScene.getState().applyNodeChanges({
      update: [
        {
          id: WALL_A_ID,
          data: { end: [3, 0] } as unknown as Partial<AnyNode>,
        },
      ],
      create: [{ node: newWall, parentId: LEVEL_ID }],
      delete: [WALL_A_ID], // delete the wall that was just updated
    })

    const after = useScene.getState().nodes
    // A was deleted (regardless of being updated first)
    expect(after[WALL_A_ID]).toBeUndefined()
    // B was created and survives
    expect(after[WALL_B_ID]).toBeDefined()
    // Level's children list reflects the delete
    const levelAfter = after[LEVEL_ID] as { children: AnyNodeId[] }
    expect(levelAfter.children).not.toContain(WALL_A_ID)
    expect(levelAfter.children).toContain(WALL_B_ID)
  })

  test('applyNodeChanges is a no-op when readOnly is true', () => {
    const level = makeLevel([WALL_A_ID])
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A },
      rootNodeIds: [LEVEL_ID],
      readOnly: true,
    } as never)

    const before = JSON.stringify(useScene.getState().nodes)
    useScene.getState().applyNodeChanges({
      delete: [WALL_A_ID],
      create: [
        {
          node: makeWall({ id: WALL_B_ID, start: [0, 0], end: [1, 0] }),
          parentId: LEVEL_ID,
        },
      ],
    })
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
  })

  test('cascading delete removes children even in the same batch', () => {
    const wallWithChild = makeWall({
      id: WALL_A_ID,
      start: [0, 0],
      end: [5, 0],
      children: [DOOR_ID],
    })
    const door = makeDoor({ id: DOOR_ID, parentId: WALL_A_ID, localX: 2, wallLength: 5 })
    const level = makeLevel([WALL_A_ID])
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: wallWithChild, [DOOR_ID]: door },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene.getState().applyNodeChanges({ delete: [WALL_A_ID] })

    expect(useScene.getState().nodes[WALL_A_ID]).toBeUndefined()
    expect(useScene.getState().nodes[DOOR_ID]).toBeUndefined()
  })
})

describe('createNodesAction — readOnly gate & dirty marking', () => {
  test('readOnly blocks createNode and createNodes', () => {
    const level = makeLevel([])
    useScene.setState({
      nodes: { [LEVEL_ID]: level },
      rootNodeIds: [LEVEL_ID],
      readOnly: true,
    } as never)

    useScene
      .getState()
      .createNode(makeWall({ id: WALL_A_ID, start: [0, 0], end: [1, 0] }), LEVEL_ID)
    expect(useScene.getState().nodes[WALL_A_ID]).toBeUndefined()
  })

  test('createNode appends to parent.children and marks both dirty', () => {
    const level = makeLevel([])
    useScene.setState({
      nodes: { [LEVEL_ID]: level },
      rootNodeIds: [LEVEL_ID],
      dirtyNodes: new Set<AnyNodeId>(),
    } as never)

    useScene
      .getState()
      .createNode(makeWall({ id: WALL_A_ID, start: [0, 0], end: [1, 0] }), LEVEL_ID)

    const after = useScene.getState().nodes
    expect(after[WALL_A_ID]).toBeDefined()
    const levelAfter = after[LEVEL_ID] as { children: AnyNodeId[] }
    expect(levelAfter.children).toContain(WALL_A_ID)
    const dirty = useScene.getState().dirtyNodes
    expect(dirty.has(WALL_A_ID)).toBe(true)
    expect(dirty.has(LEVEL_ID)).toBe(true)
  })

  test('createNode dedupes parent.children when re-creating an already-listed child id', () => {
    const level = makeLevel([WALL_A_ID]) // already listed
    useScene.setState({
      nodes: { [LEVEL_ID]: level },
      rootNodeIds: [LEVEL_ID],
    } as never)

    useScene
      .getState()
      .createNode(makeWall({ id: WALL_A_ID, start: [0, 0], end: [1, 0] }), LEVEL_ID)

    const levelAfter = useScene.getState().nodes[LEVEL_ID] as { children: AnyNodeId[] }
    // Set-based dedupe — only one entry
    expect(levelAfter.children.filter((id) => id === WALL_A_ID)).toHaveLength(1)
  })
})

describe('updateNodesAction — readOnly + RAF batching', () => {
  test('readOnly blocks updateNode and updateNodes', () => {
    const level = makeLevel([WALL_A_ID])
    const A = makeWall({ id: WALL_A_ID, start: [0, 0], end: [5, 0] })
    useScene.setState({
      nodes: { [LEVEL_ID]: level, [WALL_A_ID]: A },
      rootNodeIds: [LEVEL_ID],
      readOnly: true,
    } as never)

    useScene
      .getState()
      .updateNode(WALL_A_ID, { end: [9, 9] } as unknown as Partial<AnyNode>)
    const after = useScene.getState().nodes[WALL_A_ID] as { end: [number, number] }
    expect(after.end).toEqual([5, 0])
  })

  test('updateNode on missing id is silently skipped (no throw, no insertion)', () => {
    const level = makeLevel([])
    useScene.setState({
      nodes: { [LEVEL_ID]: level },
      rootNodeIds: [LEVEL_ID],
    } as never)

    expect(() =>
      useScene
        .getState()
        .updateNode('wall_ghost' as AnyNodeId, { end: [9, 9] } as unknown as Partial<AnyNode>),
    ).not.toThrow()
    expect(useScene.getState().nodes['wall_ghost' as AnyNodeId]).toBeUndefined()
  })
})
