import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  cornerPair,
  DoorNode,
  LevelNode,
  useScene,
  WallNode,
  WindowNode,
} from '@aedifex/core'
import { windowFloorplanMoveTarget } from './floorplan-move'
import { doorFloorplanMoveTarget } from '../door/floorplan-move'

// 2D and 3D share the corner join: a window dragged in the plan to a corner where another waits
// on the other wall lands joined to it, as the 3D move does; Alt drops it plain.
const LEVEL = 'level_plan-corner'

function seed() {
  const south = WallNode.parse({
    id: 'wall_south',
    parentId: LEVEL,
    start: [0, 0],
    end: [6, 0],
    height: 2.5,
    children: ['window_moving'],
  })
  const east = WallNode.parse({
    id: 'wall_east',
    parentId: LEVEL,
    start: [6, 0],
    end: [6, 5],
    height: 2.5,
    children: ['window_waiting'],
  })
  const moving = WindowNode.parse({
    id: 'window_moving',
    parentId: south.id,
    wallId: south.id,
    position: [2, 1.25, 0],
    width: 1.2,
    height: 1.2,
  })
  const waiting = WindowNode.parse({
    id: 'window_waiting',
    parentId: east.id,
    wallId: east.id,
    position: [0.6, 1.25, 0],
    width: 1.2,
    height: 1.2,
  })
  const level = LevelNode.parse({
    id: LEVEL,
    parentId: 'building_plan-corner',
    level: 0,
    height: 2.5,
    children: [south.id, east.id],
  })
  const building = BuildingNode.parse({ id: 'building_plan-corner', children: [level.id] })
  useScene.setState({
    nodes: Object.fromEntries(
      [building, level, south, east, moving, waiting].map((node) => [node.id, node as AnyNode]),
    ),
    rootNodeIds: [building.id],
    collections: {},
    dirtyNodes: new Set(),
  } as never)
  return moving
}

const drop = (moving: WindowNode, planPoint: [number, number], altKey = false) => {
  const session = windowFloorplanMoveTarget({
    node: moving,
    nodes: useScene.getState().nodes as Record<AnyNodeId, AnyNode>,
  })
  session.apply({
    planPoint,
    modifiers: { shiftKey: false, altKey, ctrlKey: false, metaKey: false },
  })
  expect(session.canCommit()).toBe(true)
  session.commit?.()
}

const windowNode = (id: string) => useScene.getState().nodes[id as AnyNodeId] as WindowNode

describe('2D window move near a corner', () => {
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancelRaf = globalThis.cancelAnimationFrame
  beforeEach(() => {
    globalThis.requestAnimationFrame = () => 0
    globalThis.cancelAnimationFrame = () => {}
    useScene.temporal.getState().clear()
    useScene.temporal.getState().resume()
  })
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancelRaf
  })

  test('joins the window waiting on the other wall', () => {
    const moving = seed()
    drop(moving, [5.3, 0])
    const nodes = useScene.getState().nodes as Record<string, AnyNode>
    const pair = cornerPair(nodes, windowNode('window_moving'))
    expect(pair?.partner.id).toBe('window_waiting')
    expect(windowNode('window_moving').position[0]).toBeCloseTo(5.4, 6)
  })

  // Dragged off its corner, a side kept naming its partner: the partner lost its jamb for good and
  // verify_scene asked the agent to rebuild the pair the person had just taken apart.
  test('a side dragged off its corner leaves both windows plain', () => {
    const moving = seed()
    drop(moving, [5.3, 0])
    expect(windowNode('window_waiting').corner?.partnerId).toBe('window_moving')
    drop(windowNode('window_moving'), [2, 0])
    expect(windowNode('window_moving').corner).toBeUndefined()
    expect(windowNode('window_waiting').corner).toBeUndefined()
  })

  test('Alt drops it plain', () => {
    const moving = seed()
    drop(moving, [5.3, 0], true)
    expect(windowNode('window_moving').corner).toBeUndefined()
  })

  test('a window that cannot fit under a sloped wall is an invalid drop', () => {
    const moving = seed()
    useScene.getState().updateNode('wall_south', { height: 0.4, endHeightOffset: 0.2 })
    const session = windowFloorplanMoveTarget({ node: moving, nodes: useScene.getState().nodes })
    session.apply({
      planPoint: [2, 0],
      modifiers: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
    })
    expect(session.canCommit()).toBe(false)
  })

  test('a door moves to the part of a sloped wall tall enough for it', () => {
    seed()
    const door = DoorNode.parse({
      id: 'door_moving',
      parentId: 'wall_south',
      wallId: 'wall_south',
      position: [1, 1, 0],
      width: 1,
      height: 2,
    })
    useScene.setState(
      (state) =>
        ({
          nodes: {
            ...state.nodes,
            [door.id]: door,
            wall_south: { ...state.nodes.wall_south, height: 1, endHeightOffset: 2 },
          },
        }) as never,
    )
    const session = doorFloorplanMoveTarget({ node: door, nodes: useScene.getState().nodes })
    session.apply({
      planPoint: [1, 0],
      modifiers: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
    })
    expect(session.canCommit()).toBe(true)
    session.commit?.()
    expect((useScene.getState().nodes[door.id] as DoorNode).position[0]).toBeCloseTo(3.5)
  })
})
