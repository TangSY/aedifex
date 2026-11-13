import { expect, test } from 'bun:test'
import { floorIntentConflicts } from '../lib/floor-intent-changes'
import { BuildingNode, LevelNode, SlabNode, WallNode } from '../schema'
import { wallTopOverSlab, wallTopStationProfile } from '../services/storey'
import { getWallFaceOffsets } from '../systems/wall/wall-frame'
import { verifyScene } from './verify-scene'

function scene({
  height,
  endHeightOffset,
  holes = [],
}: {
  height: number
  endHeightOffset: number
  holes?: [number, number][][]
}) {
  const building = BuildingNode.parse({
    id: 'building_slab_slope',
    children: ['level_slab_slope0', 'level_slab_slope1'],
  })
  const ground = LevelNode.parse({
    id: 'level_slab_slope0',
    parentId: building.id,
    level: 0,
    height: 3.6,
    children: ['slab_slab_slope0', 'wall_slab_slope'],
  })
  const upper = LevelNode.parse({
    id: 'level_slab_slope1',
    parentId: building.id,
    level: 1,
    children: ['slab_slab_slope1'],
  })
  const floor = SlabNode.parse({
    id: 'slab_slab_slope0',
    parentId: ground.id,
    polygon: [
      [0, -1],
      [4, -1],
      [4, 1],
      [0, 1],
    ],
    elevation: 0.05,
    thickness: 0.05,
  })
  const cover = SlabNode.parse({
    id: 'slab_slab_slope1',
    parentId: upper.id,
    polygon: [
      [3, -1],
      [4, -1],
      [4, 1],
      [3, 1],
    ],
    elevation: 0.05,
    thickness: 0.05,
    holes,
    plateRole: 'base',
  })
  const wall = WallNode.parse({
    id: 'wall_slab_slope',
    parentId: ground.id,
    start: [0, 0],
    end: [4, 0],
    height,
    endHeightOffset,
  })
  const nodes = Object.fromEntries(
    [building, ground, upper, floor, cover, wall].map((node) => [node.id, node]),
  )
  return { nodes, ground, cover }
}

function contacts(args: Parameters<typeof scene>[0]) {
  const { nodes, ground } = scene(args)
  return verifyScene(nodes, {}, { activeLevelId: ground.id }).result.issues.filter(
    (issue) => issue.type === 'wall_covering_slab_contact',
  )
}

test('wall-slab check uses the covered portion of a sloped wall', () => {
  expect(contacts({ height: 3.75, endHeightOffset: -1 })).toEqual([])
  expect(contacts({ height: 2.75, endHeightOffset: 1 })).toContainEqual(
    expect.objectContaining({ coplanar: false }),
  )
  expect(
    contacts({
      height: 2.75,
      endHeightOffset: 1,
      holes: [
        [
          [3.1, -0.5],
          [4.1, -0.5],
          [4.1, 0.5],
          [3.1, 0.5],
        ],
      ],
    }),
  ).toEqual([])
})

test('lowering a partial covering slab checks the wall height under that slab', () => {
  const lowEnd = scene({ height: 3.75, endHeightOffset: -1 })
  const highEnd = scene({ height: 2.75, endHeightOffset: 1 })
  const conflicts = ({ nodes, cover }: ReturnType<typeof scene>) =>
    floorIntentConflicts(nodes, [{ id: cover.id, data: { thickness: 0.15 } }]).filter(
      (conflict) => conflict.code === 'floor-wall-fit',
    )
  expect(conflicts(lowEnd)).toHaveLength(0)
  expect(conflicts(highEnd)).toHaveLength(1)
})

test('a curved wall uses its interior top extrema and both wall faces', () => {
  const initial = scene({ height: 3, endHeightOffset: 0 })
  for (const curveOffset of [-1, 1]) {
    const wall = WallNode.parse({
      ...initial.nodes.wall_slab_slope,
      curveOffset,
      topProfile: { offset: 0, from: 0, to: 1, acrossShift: 4 },
    })
    const slab = SlabNode.parse({
      ...initial.cover,
      polygon: [
        [-2, -3],
        [6, -3],
        [6, 3],
        [-2, 3],
      ],
    })
    const nodes = { ...initial.nodes, [wall.id]: wall, [slab.id]: slab }
    const profile = wallTopStationProfile({
      wall,
      nodes,
      levelId: initial.ground.id,
      electedBase: 0.05,
    })
    const range = wallTopOverSlab({
      wall,
      slab,
      nodes,
      levelId: initial.ground.id,
      electedBase: 0.05,
    })!
    const { a, b } = getWallFaceOffsets(wall)
    const samples = Array.from({ length: 1001 }, (_, i) => (i * profile.length) / 1000).flatMap(
      (s) => [profile.topAt(s, a), profile.topAt(s, b)],
    )
    expect(range.min).toBeCloseTo(Math.min(...samples), 4)
    expect(range.max).toBeCloseTo(Math.max(...samples), 4)
  }
})

test('a top crossing inside a slab hole is not reported as coplanar', () => {
  const issues = contacts({
    height: 2.75,
    endHeightOffset: 1,
    holes: [
      [
        [3.3, -0.5],
        [3.5, -0.5],
        [3.5, 0.5],
        [3.3, 0.5],
      ],
    ],
  })
  expect(issues).toHaveLength(1)
  expect(issues[0]).toMatchObject({ coplanar: false })
})
