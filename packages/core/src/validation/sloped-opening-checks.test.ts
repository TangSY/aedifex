import { describe, expect, test } from 'bun:test'
import { verifyScene } from '../agent-operations/verify-scene'
import { DoorNode, LevelNode, WallNode } from '../schema'
import { getWallCurveLength } from '../systems/wall/wall-curve'
import { validateBuildJson } from './validate-build-json'

describe('opening validation on sloped walls', () => {
  test('an imported sloped wall with a missing level remains inspectable', () => {
    const wall = WallNode.parse({
      id: 'wall_orphan',
      parentId: 'level_missing',
      start: [0, 0],
      end: [4, 0],
      height: 2,
      endHeightOffset: -1,
      children: ['door_orphan'],
    })
    const door = DoorNode.parse({
      id: 'door_orphan',
      parentId: wall.id,
      wallId: wall.id,
      position: [3, 0.9, 0],
      width: 0.8,
      height: 1.8,
    })
    const result = validateBuildJson({
      nodes: { [wall.id]: wall, [door.id]: door },
      rootNodeIds: [wall.id],
    })
    expect(result.warnings.some((warning) => warning.code === 'orphan_parent')).toBe(true)
    expect(result.warnings.some((warning) => warning.code === 'opening_outside_wall')).toBe(true)
  })
  for (const curveOffset of [0, 1]) {
    for (const offset of [-2, 2]) {
      test(`reports the low end and accepts the high end (curve ${curveOffset}, slope ${offset})`, () => {
        const wall = WallNode.parse({
          id: 'wall_slope',
          parentId: 'level_slope',
          start: [0, 0],
          end: [4, 0],
          height: offset < 0 ? 3 : 1,
          endHeightOffset: offset,
          curveOffset,
          children: ['door_slope'],
        })
        const level = LevelNode.parse({
          id: 'level_slope',
          level: 0,
          height: 4,
          children: [wall.id],
        })
        const length = getWallCurveLength(wall)
        const door = DoorNode.parse({
          id: 'door_slope',
          parentId: wall.id,
          wallId: wall.id,
          position: [offset < 0 ? length * 0.8 : length * 0.2, 0.9, 0],
          width: 0.6,
          height: 1.8,
        })
        const nodes = { [level.id]: level, [wall.id]: wall, [door.id]: door }
        const hasVerify = () =>
          (
            verifyScene(nodes, {}, { activeLevelId: level.id }).result.issues as { type: string }[]
          ).some((issue) => issue.type === 'opening_outside_height')
        const hasImport = () =>
          validateBuildJson({ nodes, rootNodeIds: [level.id] }).warnings.some(
            (issue) => issue.code === 'opening_outside_wall',
          )
        expect(hasVerify()).toBe(true)
        expect(hasImport()).toBe(true)
        door.position[0] = offset < 0 ? length * 0.2 : length * 0.8
        expect(hasVerify()).toBe(false)
        expect(hasImport()).toBe(false)
      })
    }
  }
})
