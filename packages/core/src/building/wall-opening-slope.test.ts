import { expect, test } from 'bun:test'
import { openingFitsAtDatum } from '../lib/opening-floor-datum'
import { type AnyNode, type AnyNodeId, BuildingNode, LevelNode, WallNode } from '../schema'
import {
  clampDoorToWall,
  planWallOpening,
  resolveWallOpeningCeiling,
  wallOpeningCeilingOver,
} from './wall-openings'

function scene(endHeightOffset: number) {
  const wall = WallNode.parse({
    id: 'wall_a',
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    height: 1.5,
    endHeightOffset,
  })
  const level = LevelNode.parse({
    id: 'level_a',
    parentId: 'building_a',
    height: 3,
    children: [wall.id],
  })
  const building = BuildingNode.parse({ id: 'building_a', children: [level.id] })
  return {
    wall,
    nodes: Object.fromEntries([wall, level, building].map((node) => [node.id, node])) as Record<
      AnyNodeId,
      AnyNode
    >,
  }
}

test('opening ceiling is the lower top over its whole width', () => {
  const { wall, nodes } = scene(2)
  expect(wallOpeningCeilingOver(wall, nodes, 1, 2)).toBeCloseTo(2)
})

test('a door slides to a stretch where its full width fits and refuses when nowhere fits', () => {
  const { wall, nodes } = scene(2)
  const placed = planWallOpening(nodes, {
    kind: 'door',
    wallId: wall.id,
    t: 0,
    width: 1,
    height: 2.5,
  })
  expect(placed.localX).toBeCloseTo(2.5)
  expect(() =>
    planWallOpening(nodes, { kind: 'door', wallId: wall.id, t: 0, width: 1, height: 4 }),
  ).toThrow()
})

test('raised opening datum fits under the lowest edge of a sloped wall', () => {
  const { wall, nodes } = scene(2)
  const opening = { position: [1.5, 1, 0] as [number, number, number], width: 1, height: 2 }
  expect(openingFitsAtDatum(wall, opening, 0.25, nodes)).toBe(false)
  expect(openingFitsAtDatum(wall, opening, 0, nodes)).toBe(true)
})

test('a falling wall places a door beneath its full width', () => {
  const { wall, nodes } = scene(-1)
  const placed = planWallOpening(nodes, {
    kind: 'door',
    wallId: wall.id,
    t: 1,
    width: 1,
    height: 1.2,
  })
  expect(placed.localX).toBeCloseTo(0.7)
  expect(() =>
    planWallOpening(nodes, { kind: 'door', wallId: wall.id, t: 0, width: 1, height: 1.5 }),
  ).toThrow()
})

test('a slope clamped to a flat minimum height cannot take a taller opening', () => {
  const original = scene(-1)
  const wall = { ...original.wall, height: 0.01 }
  const nodes = { ...original.nodes, [wall.id]: wall }
  expect(() =>
    planWallOpening(nodes, { kind: 'door', wallId: wall.id, t: 0.5, width: 1, height: 0.5 }),
  ).toThrow()
})

test('a saved dynamic slope with a flat fallback still constrains openings', () => {
  const original = scene(0)
  const wall = {
    ...original.wall,
    endHeightOffset: 0,
    topProfile: { offset: -2, from: 0, to: 1 },
  }
  const nodes = { ...original.nodes, [wall.id]: wall }
  const placed = planWallOpening(nodes, {
    kind: 'door',
    wallId: wall.id,
    t: 1,
    width: 1,
    height: 2,
  })
  expect(placed.localX).toBeCloseTo(1.5)
})

test('a curved wall with an interior low point checks the entire opening and finds a safe side', () => {
  const original = scene(0)
  const wall = {
    ...original.wall,
    height: undefined,
    curveOffset: 1,
    topProfile: { offset: 0, from: 0, to: 1, acrossShift: 4 },
  }
  const nodes = { ...original.nodes, [wall.id]: wall }
  expect(resolveWallOpeningCeiling(wall, nodes)).toBeCloseTo(1.95, 4)
  expect(wallOpeningCeilingOver(wall, nodes, 1.5, 2.5)).toBeCloseTo(1.95, 4)
  expect(openingFitsAtDatum(wall, { position: [2, 1.2, 0], width: 1, height: 2.4 }, 0, nodes)).toBe(
    false,
  )
  const result = clampDoorToWall(wall, 2, 0.5, 2.4, nodes)
  expect(result.fits).toBe(true)
  expect(Math.abs(result.clampedX - 2)).toBeGreaterThan(0.5)
  expect(
    wallOpeningCeilingOver(wall, nodes, result.clampedX - 0.25, result.clampedX + 0.25),
  ).toBeGreaterThanOrEqual(2.4 - 1e-6)
  const left = clampDoorToWall(wall, 1.5, 0.5, 2.4, nodes)
  const right = clampDoorToWall(wall, 2.8, 0.5, 2.4, nodes)
  expect(left.fits).toBe(true)
  expect(right.fits).toBe(true)
  expect(left.clampedX).toBeLessThan(2)
  expect(right.clampedX).toBeGreaterThan(2)
})

test('a transverse slope keeps an opening below both wall faces', () => {
  const original = scene(0)
  const wall = {
    ...original.wall,
    height: undefined,
    thickness: 0.2,
    topProfile: { offset: 0, from: 0, to: 1, acrossShift: 4 },
  }
  const nodes = { ...original.nodes, [wall.id]: wall }
  expect(wallOpeningCeilingOver(wall, nodes, 1, 3)).toBeCloseTo(2.9, 6)
  expect(clampDoorToWall(wall, 2, 1, 2.95, nodes).fits).toBe(false)
})
