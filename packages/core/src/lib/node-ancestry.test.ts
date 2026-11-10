import { expect, test } from 'bun:test'
import { type AnyNode, BuildingNode, LevelNode, WallNode } from '../schema'
import { findBuildingAncestorId, findLevelAncestorId } from './node-ancestry'

test('finds each ancestor and terminates on a cyclic or missing parent', () => {
  const building = BuildingNode.parse({})
  const level = LevelNode.parse({ parentId: building.id })
  const wall = WallNode.parse({ parentId: level.id, start: [0, 0], end: [1, 0] })
  const nodes = Object.fromEntries(
    [building, level, wall].map((node) => [node.id, node]),
  ) as Record<string, AnyNode>
  expect(findLevelAncestorId(wall.id, nodes)).toBe(level.id)
  expect(findBuildingAncestorId(wall.id, nodes)).toBe(building.id)
  expect(findBuildingAncestorId(building.id, nodes)).toBe(building.id)
  expect(
    findBuildingAncestorId(wall.id, { ...nodes, [level.id]: { ...level, parentId: wall.id } }),
  ).toBeNull()
  expect(
    findLevelAncestorId(wall.id, { ...nodes, [wall.id]: { ...wall, parentId: 'level_missing' } }),
  ).toBeNull()
})
