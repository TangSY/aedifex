import { expect, test } from 'bun:test'
import { wallSupportForNodes } from '../../lib/opening-floor-datum'
import { type AnyNode, type AnyNodeId, LevelNode, SlabNode, WallNode } from '../../schema'
import { planNodeDeletion } from '../../store/actions/node-actions'
import { planWallMerge } from './wall-merge'
import { resolveWallTop } from './wall-top'
import { splitWall } from './wall-topology'

function scene(second: { height: number; endHeightOffset: number; reverse?: boolean }) {
  const a = WallNode.parse({
    id: 'wall_a',
    parentId: 'level_a',
    start: [0, 0],
    end: [2, 0],
    height: 2,
    endHeightOffset: 0.5,
  })
  const b = WallNode.parse({
    id: 'wall_b',
    parentId: 'level_a',
    start: second.reverse ? [4, 0] : [2, 0],
    end: second.reverse ? [2, 0] : [4, 0],
    height: second.height,
    endHeightOffset: second.endHeightOffset,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 4, children: [a.id, b.id] })
  return {
    a,
    b,
    nodes: Object.fromEntries([a, b, level].map((node) => [node.id, node])) as Record<
      AnyNodeId,
      AnyNode
    >,
  }
}

test('a continuous sloped top survives a merge in either direction', () => {
  for (const input of [
    { height: 2.5, endHeightOffset: 0.5 },
    { height: 3, endHeightOffset: -0.5, reverse: true },
  ]) {
    const { a, b, nodes } = scene(input)
    const result = planWallMerge(nodes, [a.id, b.id])
    const merged = result.changes.update.find((change) => change.id === result.wallId)!
      .data as WallNode
    expect(merged.height).toBeCloseTo(2)
    expect(merged.endHeightOffset).toBeCloseTo(1)
    expect(merged.start).toEqual([0, 0])
    expect(merged.end).toEqual([4, 0])
  }
})

test('a step or change of pitch cannot merge', () => {
  for (const input of [
    { height: 2.6, endHeightOffset: 0.5 },
    { height: 2.5, endHeightOffset: 0.8 },
  ]) {
    const { a, b, nodes } = scene(input)
    expect(() => planWallMerge(nodes, [a.id, b.id])).toThrow()
  }
})

test('a merge extending the kept wall backwards retains the original profile', () => {
  const { a, b, nodes } = scene({ height: 2.5, endHeightOffset: 0.5 })
  const primary = { ...b, id: 'wall_0' as WallNode['id'] }
  delete nodes[b.id]
  nodes[primary.id] = primary
  const result = planWallMerge(nodes, [a.id, primary.id])
  const merged = result.changes.update.find((change) => change.id === primary.id)!.data as WallNode
  expect(merged.start).toEqual([0, 0])
  expect(merged.end).toEqual([4, 0])
  expect(merged.height).toBeCloseTo(2)
  expect(merged.endHeightOffset).toBeCloseTo(1)
})

test('a storey-bound wall cannot merge with a fixed wall that only currently aligns', () => {
  const { a, b, nodes } = scene({ height: 3.5, endHeightOffset: -0.5 })
  nodes[a.id] = { ...a, height: undefined, endHeightOffset: -0.5 }
  expect(() => planWallMerge(nodes, [a.id, b.id])).toThrow()
})

test('merging split storey-bound walls retains their profile when the floor changes', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    endHeightOffset: -4,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const original = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const parts = splitWall(wall, [0.25], original)!.create.map((part) => ({
    ...part,
    parentId: level.id,
  }))
  const nodes = Object.fromEntries([level, ...parts].map((node) => [node.id, node])) as Record<
    AnyNodeId,
    AnyNode
  >
  const result = planWallMerge(
    nodes,
    parts.map((part) => part.id),
  )
  const merged = result.changes.update.find((change) => change.id === result.wallId)!
    .data as WallNode
  for (const height of [2, 3, 5])
    for (const t of [0, 0.5, 1])
      expect(resolveWallTop(merged, height, 0, height, t)).toBeCloseTo(
        resolveWallTop(wall, height, 0, height, t),
        6,
      )
})

test('merging split fixed-height walls keeps their support-relative profile', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    height: 2,
    endHeightOffset: -1,
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const original = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const parts = splitWall(wall, [0.25], original)!.create.map((part) => ({
    ...part,
    parentId: level.id,
  }))
  const nodes = Object.fromEntries([level, ...parts].map((node) => [node.id, node])) as Record<
    AnyNodeId,
    AnyNode
  >
  const result = planWallMerge(
    nodes,
    parts.map((part) => part.id),
  )
  const merged = result.changes.update.find((change) => change.id === result.wallId)!
    .data as WallNode
  for (const height of [2, 3, 5])
    for (const t of [0, 0.5, 1])
      expect(resolveWallTop(merged, height, 0.3, height, t)).toBeCloseTo(2.3 - t, 6)
})

test('merging shifted segments preserves a top that crosses the minimum clamp', () => {
  const wall = WallNode.parse({
    parentId: 'level_a',
    start: [0, 0],
    end: [4, 0],
    endHeightOffset: -3,
    topProfile: { offset: -2, from: 0, to: 1, endShift: -1 },
  })
  const level = LevelNode.parse({ id: 'level_a', height: 3, children: [wall.id] })
  const original = { [wall.id]: wall, [level.id]: level } as Record<AnyNodeId, AnyNode>
  const parts = splitWall(wall, [0.5, 0.9], original)!.create.map((part) => ({
    ...part,
    parentId: level.id,
  }))
  const nodes = Object.fromEntries([level, ...parts].map((node) => [node.id, node])) as Record<
    AnyNodeId,
    AnyNode
  >
  const result = planWallMerge(
    nodes,
    parts.map((part) => part.id),
  )
  const merged = result.changes.update.find((change) => change.id === result.wallId)!
    .data as WallNode
  for (const height of [2, 3, 5])
    for (const t of [0, 0.5, 0.9, 1])
      expect(resolveWallTop(merged, height, 0, height, t)).toBeCloseTo(
        resolveWallTop(wall, height, 0, height, t),
        6,
      )
})

test('does not merge continuous tops when doing so would change a wall support', () => {
  const { a, b, nodes } = scene({ height: 3, endHeightOffset: 0.5 })
  const slab = SlabNode.parse({
    id: 'slab_a',
    parentId: 'level_a',
    elevation: 0.5,
    polygon: [
      [-1, -1],
      [2, -1],
      [2, 1],
      [-1, 1],
    ],
  })
  const lifted = { ...a, supportSlabId: slab.id }
  nodes[a.id] = lifted
  nodes[slab.id] = slab
  expect(wallSupportForNodes(lifted, nodes).elevation).toBeCloseTo(0.5)
  expect(wallSupportForNodes(b, nodes).elevation).toBeCloseTo(0)
  expect(() => planWallMerge(nodes, [a.id, b.id])).toThrow()
})

test('deleting a junction heals only when the sloped tops continue', () => {
  for (const [offset, count] of [
    [0.5, 1],
    [0.8, 2],
  ] as const) {
    const { a, b, nodes } = scene({ height: 2.5, endHeightOffset: offset })
    const stub = WallNode.parse({
      id: 'wall_stub',
      parentId: 'level_a',
      start: [2, 0],
      end: [2, 2],
    })
    nodes[stub.id] = stub
    const result = planNodeDeletion({ nodes, rootNodeIds: [], collections: {} }, [stub.id], {
      mintDefaults: false,
      wallDeletionPlan: { changes: [] },
    })
    const walls = Object.values(result.nodes).filter(
      (node): node is WallNode => node.type === 'wall',
    )
    expect(walls).toHaveLength(count)
    if (count === 1) {
      expect(walls[0]!.height).toBeCloseTo(2)
      expect(walls[0]!.endHeightOffset).toBeCloseTo(1)
    } else {
      expect(result.nodes[a.id]).toBeDefined()
      expect(result.nodes[b.id]).toBeDefined()
    }
  }
})
