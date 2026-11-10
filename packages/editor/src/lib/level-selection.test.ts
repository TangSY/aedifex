import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  ElevatorNode,
  LevelNode,
  RoofNode,
  useScene,
  WallNode,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { selectPlacedNode } from './level-selection'

// A roof drawn over the ground floor's walls lands on the Roof level, which the editor hides while
// the ground floor is selected: selecting the roof there alone left it out of sight.
const BUILDING = 'building_select' as BuildingNode['id']
const GROUND = 'level_ground' as LevelNode['id']

beforeEach(() => {
  const ground = LevelNode.parse({ id: GROUND, parentId: BUILDING, level: 0, children: ['wall_a'] })
  const wall = WallNode.parse({ id: 'wall_a', parentId: GROUND, start: [0, 0], end: [4, 0] })
  const roofLevel = LevelNode.parse({
    id: 'level_roof',
    parentId: BUILDING,
    level: 1,
    children: ['roof_main'],
    metadata: { role: 'roof' },
  })
  const roof = RoofNode.parse({ id: 'roof_main', parentId: roofLevel.id })
  const building = BuildingNode.parse({ id: BUILDING, children: [GROUND, roofLevel.id] })
  useScene.setState({
    nodes: Object.fromEntries(
      [building, ground, wall, roofLevel, roof].map((node) => [node.id, node as AnyNode]),
    ),
    rootNodeIds: [BUILDING],
  } as never)
  useViewer.getState().setSelection({ buildingId: BUILDING, levelId: GROUND })
})

describe('selectPlacedNode', () => {
  test('a node placed on another level is selected with its level', () => {
    selectPlacedNode('roof_main' as AnyNodeId)
    expect(useViewer.getState().selection).toMatchObject({
      buildingId: BUILDING,
      levelId: 'level_roof',
      selectedIds: ['roof_main'],
    })
  })

  test('a node placed on the level in view leaves the level as it is', () => {
    selectPlacedNode('wall_a' as AnyNodeId)
    expect(useViewer.getState().selection).toMatchObject({
      levelId: GROUND,
      selectedIds: ['wall_a'],
    })
  })

  test('a building-owned node adopts its building and retains its current floor', () => {
    const elevator = ElevatorNode.parse({ id: 'elevator_select', parentId: BUILDING })
    useScene.setState({ nodes: { ...useScene.getState().nodes, [elevator.id]: elevator } })
    useViewer.getState().resetSelection()
    useViewer.getState().setSelection({ levelId: GROUND })
    selectPlacedNode(elevator.id)
    expect(useViewer.getState().selection).toMatchObject({
      buildingId: BUILDING,
      levelId: GROUND,
      selectedIds: [elevator.id],
    })
  })

  test('selecting another building switches both building and floor', () => {
    const building = BuildingNode.parse({ id: 'building_other' })
    const level = LevelNode.parse({ id: 'level_other', parentId: building.id })
    const wall = WallNode.parse({
      id: 'wall_other',
      parentId: level.id,
      start: [0, 0],
      end: [1, 0],
    })
    building.children = [level.id]
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        [building.id]: building,
        [level.id]: level,
        [wall.id]: wall,
      },
    })
    selectPlacedNode(wall.id)
    expect(useViewer.getState().selection).toMatchObject({
      buildingId: building.id,
      levelId: level.id,
      selectedIds: [wall.id],
    })
  })

  test('a building-owned node clears a floor belonging to another building', () => {
    const building = BuildingNode.parse({ id: 'building_other' })
    const elevator = ElevatorNode.parse({ id: 'elevator_other', parentId: building.id })
    useScene.setState({
      nodes: { ...useScene.getState().nodes, [building.id]: building, [elevator.id]: elevator },
    })
    selectPlacedNode(elevator.id)
    expect(useViewer.getState().selection).toMatchObject({
      buildingId: building.id,
      levelId: null,
      selectedIds: [elevator.id],
    })
  })

  test('legacy levels without parentId still recover their building', () => {
    const nodes = useScene.getState().nodes
    useScene.setState({
      nodes: { ...nodes, [GROUND]: { ...nodes[GROUND]!, parentId: null } as AnyNode },
    })
    useViewer.getState().resetSelection()
    selectPlacedNode('wall_a' as AnyNodeId)
    expect(useViewer.getState().selection).toMatchObject({
      buildingId: BUILDING,
      levelId: GROUND,
      selectedIds: ['wall_a'],
    })
  })

  test('a stale foreign floor is cleared even when the building already matches', () => {
    const other = BuildingNode.parse({ id: 'building_other' })
    const floor = LevelNode.parse({ id: 'level_other', parentId: other.id })
    const elevator = ElevatorNode.parse({ id: 'elevator_select', parentId: BUILDING })
    other.children = [floor.id]
    useScene.setState({
      nodes: {
        ...useScene.getState().nodes,
        [other.id]: other,
        [floor.id]: floor,
        [elevator.id]: elevator,
      },
    })
    useViewer.getState().setSelection({ buildingId: BUILDING, levelId: floor.id })
    selectPlacedNode(elevator.id)
    expect(useViewer.getState().selection).toMatchObject({
      buildingId: BUILDING,
      levelId: null,
      selectedIds: [elevator.id],
    })
  })
})
