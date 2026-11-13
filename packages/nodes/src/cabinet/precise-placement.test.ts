import { expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  getWallCurveFrameAt,
  LevelNode,
  WallNode,
} from '@aedifex/core'
import {
  cabinetWallCoordinates,
  findCabinetReferenceWall,
  resolveCabinetCoordinates,
} from './precise-placement'

const level = LevelNode.parse({ id: 'level_precise_cabinet' })
const wall = WallNode.parse({
  id: 'wall_precise_cabinet',
  parentId: level.id,
  start: [0, 0],
  end: [4, 0],
  thickness: 0.2,
})
const nodes = { [level.id]: level, [wall.id]: wall } as Record<AnyNodeId, AnyNode>
const reference = (position: [number, number, number], yaw = 0) =>
  findCabinetReferenceWall({ nodes, levelId: level.id, wallId: wall.id, position, yaw })!

test('wall distance and signed offset round trip on either wall side', () => {
  for (const [position, yaw] of [
    [[1, 0, 0.4], 0],
    [[2, 0, -0.4], Math.PI],
  ] as Array<[[number, number, number], number]>) {
    const hit = reference(position, yaw)
    const args = { hit, levelId: level.id, nodes, width: 0.6, depth: 0.6, position }
    const values = cabinetWallCoordinates(args)
    const result = resolveCabinetCoordinates({ ...args, ...values })!
    expect(result.position[0]).toBeCloseTo(position[0])
    expect(result.position[2]).toBeCloseTo(position[2])
    expect(Math.cos(result.yaw - yaw)).toBeCloseTo(1)
  }
})

test('a cabinet wider than its wall remains centered and impossible distances are rejected', () => {
  const position: [number, number, number] = [2, 0, 0.4]
  const args = {
    hit: reference(position),
    levelId: level.id,
    nodes,
    width: 5,
    depth: 0.6,
    position,
  }
  expect(resolveCabinetCoordinates({ ...args, distance: 0, offset: 0 })?.wallLocalX).toBeCloseTo(2)
  expect(resolveCabinetCoordinates({ ...args, distance: 1, offset: 0 })).toBeNull()
  expect(resolveCabinetCoordinates({ ...args, distance: 0, offset: Infinity })).toBeNull()
})

test('a previously typed large offset can still resolve its known wall', () => {
  const hit = reference([1, 0, 5])
  expect(hit?.wall.id).toBe(wall.id)
})

test('coordinates on a curved wall follow its local tangent and retain signed offset', () => {
  const curved = WallNode.parse({ ...wall, curveOffset: 1 })
  const curvedNodes = { ...nodes, [curved.id]: curved }
  const frame = getWallCurveFrameAt(curved, 0.35)
  for (const sign of [1, -1]) {
    const position: [number, number, number] = [
      frame.point.x + frame.normal.x * sign * 0.35,
      0,
      frame.point.y + frame.normal.y * sign * 0.35,
    ]
    const yaw = Math.atan2(frame.normal.x * sign, frame.normal.y * sign)
    const hit = findCabinetReferenceWall({
      nodes: curvedNodes,
      levelId: level.id,
      wallId: curved.id,
      position,
      yaw,
    })!
    const args = { hit, nodes: curvedNodes, levelId: level.id, width: 0.6, depth: 0.6, position }
    const values = cabinetWallCoordinates(args)
    expect(values.offset).toBeCloseTo(-0.05)
    const result = resolveCabinetCoordinates({ ...args, ...values })!
    expect(result.position[0]).toBeCloseTo(position[0])
    expect(result.position[2]).toBeCloseTo(position[2])
    expect(Math.cos(result.yaw - yaw)).toBeCloseTo(1)
    const moved = resolveCabinetCoordinates({
      ...args,
      distance: values.distance + 0.5,
      offset: values.offset,
    })!
    expect(Math.abs(moved.yaw - yaw)).toBeGreaterThan(0.01)
  }
})
