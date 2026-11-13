import { expect, test } from 'bun:test'
import { wallSupportForNodes } from '../../lib/opening-floor-datum'
import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  LevelNode,
  SlabNode,
  WallNode,
} from '../../schema'
import { wallSpans } from '../../services/roof-bearing'
import { getWallTop } from '../../services/storey'
import { getWallChordFractionAt, getWallCurveLength } from './wall-curve'
import { reverseWallDirection } from './wall-frame'
import { planWallMerge } from './wall-merge'
import { resolveWallTop } from './wall-top'
import { wallTopReference } from './wall-top-reference'
import { splitWall } from './wall-topology'

test('splitting a sloped wall preserves the original height at the join and endpoints', () => {
  const wall = WallNode.parse({
    id: 'wall_a',
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    height: 2,
    endHeightOffset: 1,
  })
  const level = LevelNode.parse({
    id: 'level_a',
    parentId: 'building_a',
    height: 3,
    children: [wall.id],
  })
  const building = BuildingNode.parse({ id: 'building_a', children: [level.id] })
  const nodes = Object.fromEntries(
    [wall, level, building].map((node) => [node.id, node]),
  ) as Record<AnyNodeId, AnyNode>
  const result = splitWall(wall, [0.25], nodes)
  expect(result?.create).toHaveLength(2)
  expect(result!.create[0]!.height).toBeCloseTo(2)
  expect(result!.create[0]!.endHeightOffset).toBeCloseTo(0.25)
  expect(result!.create[1]!.height).toBeCloseTo(2.25)
  expect(result!.create[1]!.endHeightOffset).toBeCloseTo(0.75)
})

test('a curved wall split uses the point projected onto its chord', () => {
  const wall = WallNode.parse({
    id: 'wall_arc',
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    curveOffset: 0.8,
    height: 2,
    endHeightOffset: 1,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const nodes = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const result = splitWall(wall, [0.25], nodes)!
  const [first, second] = result.create
  const joinHeight = 2 + first!.end[0] / 4
  expect(first!.height! + first!.endHeightOffset!).toBeCloseTo(joinHeight, 6)
  expect(second!.height).toBeCloseTo(joinHeight, 6)
  expect(second!.height! + second!.endHeightOffset!).toBeCloseTo(3, 6)
})

test('split storey-bound slopes keep following the original profile as the floor changes', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    endHeightOffset: -4,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const nodes = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const [first, second] = splitWall(wall, [0.25], nodes)!.create
  for (const height of [2, 3, 5]) {
    for (const [segment, from, to] of [
      [first!, 0, 0.25],
      [second!, 0.25, 1],
    ] as const) {
      for (const t of [0, 0.5, 1]) {
        expect(resolveWallTop(segment, height, 0, height, t)).toBeCloseTo(
          resolveWallTop(wall, height, 0, height, from + (to - from) * t),
          6,
        )
      }
    }
  }
})

test('a saved segment can be split again without losing its original dynamic slope', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    endHeightOffset: -4,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const nodes = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const first = splitWall(wall, [0.25], nodes)!.create[1]!
  const reloaded = WallNode.parse({ ...JSON.parse(JSON.stringify(first)), parentId: level.id })
  const reloadedNodes = { [reloaded.id]: reloaded, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const [middle, last] = splitWall(reloaded, [0.5], reloadedNodes)!.create
  for (const height of [2, 3, 5]) {
    for (const [part, from, to] of [
      [middle!, 0.25, 0.625],
      [last!, 0.625, 1],
    ] as const) {
      for (const t of [0, 0.5, 1])
        expect(resolveWallTop(part, height, 0, height, t)).toBeCloseTo(
          resolveWallTop(wall, height, 0, height, from + (to - from) * t),
          6,
        )
    }
  }
})

test('a curved storey-bound wall keeps its top between split endpoints', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    curveOffset: 1,
    endHeightOffset: -2,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const nodes = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const first = splitWall(wall, [0.25], nodes)!.create[0]!
  for (const t of [0.25, 0.5, 0.75]) {
    const before = getWallChordFractionAt(wall, getWallCurveLength(wall) * 0.25 * t)
    const after = getWallChordFractionAt(first, getWallCurveLength(first) * t)
    expect(resolveWallTop(first, 3, 0, 3, after)).toBeCloseTo(
      resolveWallTop(wall, 3, 0, 3, before),
      5,
    )
  }
})

test('a curved fixed-height wall keeps its top between split endpoints', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    curveOffset: 1,
    height: 2,
    endHeightOffset: -1,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const nodes = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const first = splitWall(wall, [0.25], nodes)!.create[0]!
  for (const height of [2, 3, 5])
    for (const base of [0, 0.3])
      for (const t of [0.25, 0.5, 0.75]) {
        const before = getWallChordFractionAt(wall, getWallCurveLength(wall) * 0.25 * t)
        const after = getWallChordFractionAt(first, getWallCurveLength(first) * t)
        expect(resolveWallTop(first, height, base, height, after)).toBeCloseTo(base + 2 - before, 5)
      }
})

test('a shifted slope remains identical after splitting across its minimum-height clamp', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    endHeightOffset: -3,
    topProfile: { offset: -2, from: 0, to: 1, endShift: -1 },
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const nodes = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const parts = splitWall(wall, [0.5, 0.9], nodes)!.create
  for (const height of [2, 3, 5])
    for (const [part, from, to] of [
      [parts[0]!, 0, 0.5],
      [parts[1]!, 0.5, 0.9],
      [parts[2]!, 0.9, 1],
    ] as const)
      for (const t of [0, 0.5, 1])
        expect(resolveWallTop(part, height, 0, height, t)).toBeCloseTo(
          resolveWallTop(wall, height, 0, height, from + (to - from) * t),
          6,
        )
})

test('splitting a slope spanning different slabs preserves its top in each segment', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    height: 2,
    endHeightOffset: 1,
  })
  const level = LevelNode.parse({
    id: 'level_a',
    height: 3,
    children: [wall.id, 'slab_a', 'slab_b'],
  })
  const a = SlabNode.parse({
    id: 'slab_a',
    parentId: level.id,
    elevation: 0.4,
    polygon: [
      [-1, -1],
      [2, -1],
      [2, 1],
      [-1, 1],
    ],
  })
  const b = SlabNode.parse({
    id: 'slab_b',
    parentId: level.id,
    elevation: 0.05,
    polygon: [
      [2, -1],
      [5, -1],
      [5, 1],
      [2, 1],
    ],
  })
  const nodes = Object.fromEntries([wall, level, a, b].map((node) => [node.id, node])) as Record<
    AnyNodeId,
    AnyNode
  >
  const parts = splitWall(wall, [0.5], nodes)!.create.map((part) => ({
    ...part,
    parentId: level.id,
  }))
  const afterLevel = { ...level, children: [...parts.map((part) => part.id), a.id, b.id] }
  const after = Object.fromEntries(
    [afterLevel, a, b, ...parts].map((node) => [node.id, node]),
  ) as Record<AnyNodeId, AnyNode>
  for (const [heightA, heightB] of [
    [0.4, 0.05],
    [0.8, 0.05],
    [0.1, 0.7],
  ] as const) {
    const updatedA = { ...a, elevation: heightA }
    const updatedB = { ...b, elevation: heightB }
    const beforeChange = { ...nodes, [a.id]: updatedA, [b.id]: updatedB }
    const afterChange = { ...after, [a.id]: updatedA, [b.id]: updatedB }
    const base = wallSupportForNodes(wall, beforeChange).elevation
    for (const [part, from] of [
      [parts[0]!, 0],
      [parts[1]!, 0.5],
    ] as const) {
      const partBase = wallSupportForNodes(part, afterChange).elevation
      for (const t of [0, 0.5, 1])
        expect(getWallTop(part, level.id, afterChange, partBase, t)).toBeCloseTo(
          getWallTop(wall, level.id, beforeChange, base, from + t * 0.5),
          6,
        )
    }
  }
  const last = parts[1]!
  const reloaded = WallNode.parse(JSON.parse(JSON.stringify(last)))
  const moved = { ...reloaded, start: [1, 1] as [number, number], end: [1, 3] as [number, number] }
  const movedReference = wallTopReference(moved)
  expect(movedReference.start[0]).toBeCloseTo(1)
  expect(movedReference.start[1]).toBeCloseTo(-1)
  expect(movedReference.end[0]).toBeCloseTo(1)
  expect(movedReference.end[1]).toBeCloseTo(3)
  expect(wallTopReference({ ...reloaded, supportSlabId: 'slab_remapped' }).supportSlabId).toBe(
    'slab_remapped',
  )
  expect(wallTopReference({ ...reloaded, supportSlabId: undefined }).supportSlabId).toBeUndefined()
  const reversed = { ...last, ...reverseWallDirection(last) }
  const reversedNodes = { ...after, [last.id]: reversed }
  const reversedBase = wallSupportForNodes(reversed, reversedNodes).elevation
  const base = wallSupportForNodes(wall, nodes).elevation
  for (const t of [0, 0.5, 1])
    expect(getWallTop(reversed, level.id, reversedNodes, reversedBase, t)).toBeCloseTo(
      getWallTop(wall, level.id, nodes, base, 1 - t * 0.5),
      6,
    )
  const merge = planWallMerge(
    after,
    parts.map((part) => part.id),
  )
  const spans = wallSpans(after, level.id)
  for (const [part, from] of [
    [parts[0]!, 0],
    [parts[1]!, 0.5],
  ] as const)
    expect(spans.get(part.id)!.top).toBeCloseTo(getWallTop(wall, level.id, nodes, base, from), 6)
  const merged = merge.changes.update.find((entry) => entry.id === merge.wallId)!.data as WallNode
  const mergedNodes = { ...after, [merged.id]: merged }
  delete mergedNodes[parts.find((part) => part.id !== merged.id)!.id]
  for (const [heightA, heightB] of [
    [0.4, 0.05],
    [0.1, 0.7],
  ] as const) {
    const updatedA = { ...a, elevation: heightA }
    const updatedB = { ...b, elevation: heightB }
    const beforeChange = { ...nodes, [a.id]: updatedA, [b.id]: updatedB }
    const mergedChange = { ...mergedNodes, [a.id]: updatedA, [b.id]: updatedB }
    for (const t of [0, 0.5, 1])
      expect(
        getWallTop(
          merged,
          level.id,
          mergedChange,
          wallSupportForNodes(merged, mergedChange).elevation,
          t,
        ),
      ).toBeCloseTo(
        getWallTop(
          wall,
          level.id,
          beforeChange,
          wallSupportForNodes(wall, beforeChange).elevation,
          t,
        ),
        6,
      )
  }
})

test('split storey-bound walls retain the original covering-slab election', () => {
  const wall = WallNode.parse({
    id: 'wall_cover',
    parentId: 'level_lower',
    start: [0, 0],
    end: [4, 0],
    endHeightOffset: -1,
  })
  const lower = LevelNode.parse({
    id: 'level_lower',
    parentId: 'building_cover',
    level: 0,
    height: 3,
    children: [wall.id],
  })
  const cover = SlabNode.parse({
    id: 'slab_cover',
    parentId: 'level_upper',
    elevation: 0,
    thickness: 0.3,
    polygon: [
      [-1, -1],
      [2, -1],
      [2, 1],
      [-1, 1],
    ],
  })
  const upper = LevelNode.parse({
    id: 'level_upper',
    parentId: 'building_cover',
    level: 1,
    height: 3,
    children: [cover.id],
  })
  const building = BuildingNode.parse({ id: 'building_cover', children: [lower.id, upper.id] })
  const nodes = Object.fromEntries(
    [wall, lower, upper, cover, building].map((node) => [node.id, node]),
  ) as Record<AnyNodeId, AnyNode>
  const parts = splitWall(wall, [0.5], nodes)!.create.map((part) => ({
    ...part,
    parentId: lower.id,
  }))
  const after = { ...nodes, [lower.id]: { ...lower, children: parts.map((part) => part.id) } }
  delete after[wall.id]
  for (const part of parts) after[part.id] = part
  for (const thickness of [0.3, 0.6]) {
    const changedCover = { ...cover, thickness }
    const originalNodes = { ...nodes, [cover.id]: changedCover }
    const splitNodes = { ...after, [cover.id]: changedCover }
    const base = wallSupportForNodes(wall, originalNodes).elevation
    for (const [part, from] of [
      [parts[0]!, 0],
      [parts[1]!, 0.5],
    ] as const)
      for (const t of [0, 0.5, 1])
        expect(
          getWallTop(
            part,
            lower.id,
            splitNodes,
            wallSupportForNodes(part, splitNodes).elevation,
            t,
          ),
        ).toBeCloseTo(getWallTop(wall, lower.id, originalNodes, base, from + t * 0.5), 6)
  }
})

test('split ground-pinned walls retain the original floor-construction lift', () => {
  const wall = WallNode.parse({
    id: 'wall_ground-split',
    parentId: 'level_ground-split',
    start: [0, 0],
    end: [4, 0],
    supportSlabId: 'ground',
    height: 2,
    endHeightOffset: 1,
  })
  const slab = SlabNode.parse({
    id: 'slab_ground-split',
    parentId: wall.parentId,
    plateRole: 'base',
    floorHeight: 0.5,
    polygon: [
      [-1, -1],
      [5, -1],
      [5, 1],
      [-1, 1],
    ],
  })
  const level = LevelNode.parse({ id: wall.parentId, height: 3, children: [wall.id, slab.id] })
  const nodes = { [wall.id]: wall, [level.id]: level, [slab.id]: slab } as Record<
    AnyNodeId,
    AnyNode
  >
  const originalBase = wallSupportForNodes(wall, nodes).elevation
  expect(originalBase).toBeGreaterThan(0)
  const parts = splitWall(wall, [0.5], nodes)!.create.map((part) => ({
    ...part,
    parentId: level.id,
  }))
  const after = {
    [level.id]: level,
    [slab.id]: slab,
    ...Object.fromEntries(parts.map((part) => [part.id, part])),
  } as Record<AnyNodeId, AnyNode>
  for (const [part, from] of [
    [parts[0]!, 0],
    [parts[1]!, 0.5],
  ] as const)
    for (const t of [0, 0.5, 1])
      expect(
        getWallTop(part, level.id, after, wallSupportForNodes(part, after).elevation, t),
      ).toBeCloseTo(getWallTop(wall, level.id, nodes, originalBase, from + t * 0.5), 6)
})
