import { expect, test } from 'bun:test'
import { type AnyNode, LevelNode, WallNode } from '../../schema'
import {
  getWallEffectiveHeightForNodes,
  SpatialGridManager,
  snapshotSpatialGridSource,
  withSpatialGrid,
} from './spatial-grid-manager'

test('wall placement uses the lower top across the full width', () => {
  const level = LevelNode.parse({ id: 'level_spatial-slope', height: 4 })
  const wall = WallNode.parse({
    id: 'wall_spatial-slope',
    parentId: level.id,
    start: [0, 0],
    end: [4, 0],
    height: 2,
    endHeightOffset: 2,
  })
  let nodes: Record<string, AnyNode> = { [level.id]: level, [wall.id]: wall }
  const grid = new SpatialGridManager(
    0.5,
    snapshotSpatialGridSource(() => nodes),
  )
  grid.handleNodeCreated(wall, level.id)
  const placed = grid.canPlaceOnWall(level.id, wall.id, 1, 2, [1, 1, 0.1])
  expect(placed.valid).toBe(true)
  expect(placed.adjustedY).toBeCloseTo(1.2)
  nodes = { ...nodes, [wall.id]: { ...wall, height: 3, endHeightOffset: -2 } }
  const tooTall = grid.canPlaceOnWall(level.id, wall.id, 3, 0, [1, 1.5, 0.1])
  expect(tooTall.valid).toBe(false)
})

test('wall placement catches a low point inside a curved wall span', () => {
  const level = LevelNode.parse({ id: 'level_spatial-curved', height: 3 })
  const wall = WallNode.parse({
    parentId: level.id,
    start: [0, 0],
    end: [4, 0],
    curveOffset: 1,
    topProfile: { offset: 0, from: 0, to: 1, acrossShift: 4 },
  })
  const nodes: Record<string, AnyNode> = { [level.id]: level, [wall.id]: wall }
  const grid = new SpatialGridManager(
    0.5,
    snapshotSpatialGridSource(() => nodes),
  )
  grid.handleNodeCreated(wall, level.id)
  expect(grid.canPlaceOnWall(level.id, wall.id, 2, 0, [3, 2.4, 0.1]).valid).toBe(false)
})

test('effective wall height defaults to the start and can sample either end', () => {
  const level = LevelNode.parse({ id: 'level_spatial-slope', height: 4 })
  const wall = WallNode.parse({
    id: 'wall_spatial-slope',
    parentId: level.id,
    start: [0, 0],
    end: [4, 0],
    height: 3,
    endHeightOffset: -1,
  })
  const nodes = { [level.id]: level, [wall.id]: wall }
  const grid = new SpatialGridManager(
    0.5,
    snapshotSpatialGridSource(() => nodes),
  )
  withSpatialGrid(
    () => grid,
    () => {
      expect(getWallEffectiveHeightForNodes(wall, nodes)).toBeCloseTo(3)
      expect(getWallEffectiveHeightForNodes(wall, nodes, 0)).toBeCloseTo(3)
      expect(getWallEffectiveHeightForNodes(wall, nodes, 1)).toBeCloseTo(2)
    },
  )
})
