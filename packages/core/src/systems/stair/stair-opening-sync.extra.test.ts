// Additional coverage for syncAutoStairOpenings beyond the original stair-opening-sync.test.ts.
// The original file has 2 pre-existing failures (see notes), which we intentionally don't
// duplicate or modify here.
import { describe, expect, test } from 'bun:test'
import type { AnyNode } from '../../schema'
import { BuildingNode, LevelNode, SlabNode, StairNode, StairSegmentNode } from '../../schema'
import { syncAutoStairOpenings } from './stair-opening-sync'

function buildBasicStair({
  slabOpeningMode = 'destination' as const,
  fromLevelKey = 'ground',
  toLevelKey = 'upper',
}: {
  slabOpeningMode?: 'destination' | 'none'
  fromLevelKey?: 'ground' | 'upper'
  toLevelKey?: 'ground' | 'upper'
} = {}) {
  const building = BuildingNode.parse({ name: 'Building' })
  const ground = LevelNode.parse({ name: 'Ground', level: 0, parentId: building.id })
  const upper = LevelNode.parse({ name: 'Upper', level: 1, parentId: building.id })
  const levelMap: Record<'ground' | 'upper', typeof ground> = { ground, upper }
  const segment = StairSegmentNode.parse({
    parentId: 'stair_main',
    width: 1,
    length: 2.6,
    height: 2.5,
    stepCount: 12,
  })
  const stair = StairNode.parse({
    id: 'stair_main',
    name: 'Main Stair',
    parentId: ground.id,
    position: [2, 0, 0.2],
    stairType: 'straight',
    fromLevelId: levelMap[fromLevelKey].id,
    toLevelId: levelMap[toLevelKey].id,
    slabOpeningMode,
    children: [segment.id],
  })
  return { building, ground, upper, stair, segment }
}

describe('syncAutoStairOpenings — additional coverage', () => {
  test('returns no updates when stair slabOpeningMode = "none"', () => {
    const { building, ground, upper, stair, segment } = buildBasicStair({
      slabOpeningMode: 'none',
    })
    const landingSlab = SlabNode.parse({
      name: 'Landing Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, landingSlab, stair, { ...segment, parentId: stair.id }].map(
        (node) => [node.id, node],
      ),
    ) as Record<string, AnyNode>

    const updates = syncAutoStairOpenings(nodes)
    expect(updates).toHaveLength(0)
  })

  test('simple stair adds an opening polygon to the destination slab', () => {
    const { building, ground, upper, stair, segment } = buildBasicStair()
    const landingSlab = SlabNode.parse({
      name: 'Landing Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, landingSlab, stair, { ...segment, parentId: stair.id }].map(
        (node) => [node.id, node],
      ),
    ) as Record<string, AnyNode>
    const updates = syncAutoStairOpenings(nodes)
    const slabUpdate = updates.find((u) => u.id === landingSlab.id)
    expect(slabUpdate).toBeDefined()
    expect(slabUpdate!.data.holes).toBeDefined()
    expect((slabUpdate!.data.holes ?? []).length).toBeGreaterThanOrEqual(1)
    expect(slabUpdate!.data.holeMetadata).toEqual([{ source: 'stair', stairId: stair.id }])
  })

  test('multiple stairs targeting same destination slab each contribute hole metadata', () => {
    const building = BuildingNode.parse({ name: 'Building' })
    const ground = LevelNode.parse({ name: 'Ground', level: 0, parentId: building.id })
    const upper = LevelNode.parse({ name: 'Upper', level: 1, parentId: building.id })

    const segA = StairSegmentNode.parse({
      parentId: 'stair_a',
      width: 1,
      length: 2.6,
      height: 2.5,
      stepCount: 12,
    })
    const stairA = StairNode.parse({
      id: 'stair_a',
      name: 'Stair A',
      parentId: ground.id,
      position: [1.5, 0, 0.2],
      stairType: 'straight',
      fromLevelId: ground.id,
      toLevelId: upper.id,
      slabOpeningMode: 'destination',
      children: [segA.id],
    })
    const segB = StairSegmentNode.parse({
      parentId: 'stair_b',
      width: 1,
      length: 2.6,
      height: 2.5,
      stepCount: 12,
    })
    const stairB = StairNode.parse({
      id: 'stair_b',
      name: 'Stair B',
      parentId: ground.id,
      position: [6, 0, 0.2],
      stairType: 'straight',
      fromLevelId: ground.id,
      toLevelId: upper.id,
      slabOpeningMode: 'destination',
      children: [segB.id],
    })
    const landingSlab = SlabNode.parse({
      name: 'Landing Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [8, 0],
        [8, 3],
        [0, 3],
      ],
    })
    const nodes = Object.fromEntries(
      [
        building,
        ground,
        upper,
        landingSlab,
        stairA,
        { ...segA, parentId: stairA.id },
        stairB,
        { ...segB, parentId: stairB.id },
      ].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const updates = syncAutoStairOpenings(nodes)
    const slabUpdate = updates.find((u) => u.id === landingSlab.id)
    expect(slabUpdate).toBeDefined()
    // Two distinct stair holes contributed
    const metadata = slabUpdate!.data.holeMetadata ?? []
    const stairAEntries = metadata.filter((m) => m.source === 'stair' && m.stairId === 'stair_a')
    const stairBEntries = metadata.filter((m) => m.source === 'stair' && m.stairId === 'stair_b')
    expect(stairAEntries.length).toBeGreaterThanOrEqual(1)
    expect(stairBEntries.length).toBeGreaterThanOrEqual(1)
  })

  test('curved stair on destination level produces a hole', () => {
    const building = BuildingNode.parse({ name: 'Building' })
    const ground = LevelNode.parse({ name: 'Ground', level: 0, parentId: building.id })
    const upper = LevelNode.parse({ name: 'Upper', level: 1, parentId: building.id })
    const stair = StairNode.parse({
      id: 'stair_curve',
      name: 'Curved Stair',
      parentId: ground.id,
      position: [2.5, 0, 1.5],
      stairType: 'curved',
      fromLevelId: ground.id,
      toLevelId: upper.id,
      slabOpeningMode: 'destination',
      width: 1.2,
      innerRadius: 0.5,
      sweepAngle: Math.PI / 2,
    })
    const landingSlab = SlabNode.parse({
      name: 'Landing Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, landingSlab, stair].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const updates = syncAutoStairOpenings(nodes)
    const slabUpdate = updates.find((u) => u.id === landingSlab.id)
    expect(slabUpdate).toBeDefined()
    expect(slabUpdate!.data.holeMetadata).toEqual([{ source: 'stair', stairId: stair.id }])
  })

  test('spiral stair with integrated top landing emits up to 2 polygons', () => {
    const building = BuildingNode.parse({ name: 'Building' })
    const ground = LevelNode.parse({ name: 'Ground', level: 0, parentId: building.id })
    const upper = LevelNode.parse({ name: 'Upper', level: 1, parentId: building.id })
    const stair = StairNode.parse({
      id: 'stair_spiral',
      name: 'Spiral Stair',
      parentId: ground.id,
      position: [3, 0, 3],
      stairType: 'spiral',
      fromLevelId: ground.id,
      toLevelId: upper.id,
      slabOpeningMode: 'destination',
      topLandingMode: 'integrated',
      innerRadius: 0.5,
      width: 1.0,
      topLandingDepth: 0.9,
    })
    const landingSlab = SlabNode.parse({
      name: 'Landing Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [8, 0],
        [8, 8],
        [0, 8],
      ],
    })
    const nodes = Object.fromEntries(
      [building, ground, upper, landingSlab, stair].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const updates = syncAutoStairOpenings(nodes)
    const slabUpdate = updates.find((u) => u.id === landingSlab.id)
    // The spiral landing should be on slab; we expect at least 1 hole present
    expect(slabUpdate).toBeDefined()
    const metadata = slabUpdate!.data.holeMetadata ?? []
    expect(metadata.length).toBeGreaterThanOrEqual(1)
    expect(metadata.every((m) => m.source === 'stair')).toBe(true)
  })

  test('returns no updates when stair is invisible', () => {
    const { building, ground, upper, stair, segment } = buildBasicStair()
    const invisibleStair = { ...stair, visible: false }
    const landingSlab = SlabNode.parse({
      name: 'Landing Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
    })
    const nodes = Object.fromEntries(
      [
        building,
        ground,
        upper,
        landingSlab,
        invisibleStair,
        { ...segment, parentId: stair.id },
      ].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>
    const updates = syncAutoStairOpenings(nodes)
    expect(updates).toHaveLength(0)
  })
})
