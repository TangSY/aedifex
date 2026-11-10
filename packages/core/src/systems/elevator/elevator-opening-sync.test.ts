import { describe, expect, test } from 'bun:test'
import type { AnyNode } from '../../schema'
import {
  BuildingNode,
  CeilingNode,
  ElevatorNode,
  FloorOpeningNode,
  LevelNode,
  SlabNode,
} from '../../schema'
import { planOwnedFloorOpenings } from '../owned-floor-openings'
import { syncAutoElevatorOpenings } from './elevator-opening-sync'

describe('syncAutoElevatorOpenings', () => {
  test('does not add elevator holes when a manual surface hole already covers them', () => {
    const building = BuildingNode.parse({ name: 'Building' })
    const ground = LevelNode.parse({ name: 'Ground', level: 0, parentId: building.id })
    const upper = LevelNode.parse({ name: 'Upper', level: 1, parentId: building.id })
    const elevator = ElevatorNode.parse({
      name: 'Elevator',
      parentId: building.id,
      position: [2, 0, 1.5],
      width: 1.6,
      depth: 1.6,
    })
    const buildingWithChildren = {
      ...building,
      children: [ground.id, upper.id, elevator.id],
    }
    const manualOpening: Array<[number, number]> = [
      [1, 0.5],
      [3, 0.5],
      [3, 2.5],
      [1, 2.5],
    ]
    const sourceCeiling = CeilingNode.parse({
      name: 'Source Ceiling',
      parentId: ground.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      holes: [manualOpening],
      holeMetadata: [{ source: 'manual' }],
    })
    const upperSlab = SlabNode.parse({
      name: 'Upper Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      holes: [manualOpening],
      holeMetadata: [{ source: 'manual' }],
    })
    const nodes = Object.fromEntries(
      [buildingWithChildren, ground, upper, elevator, sourceCeiling, upperSlab].map((node) => [
        node.id,
        node,
      ]),
    ) as Record<string, AnyNode>

    const updates = syncAutoElevatorOpenings(nodes)

    expect(updates.find((update) => update.id === upperSlab.id)).toBeUndefined()
    expect(updates.find((update) => update.id === sourceCeiling.id)).toBeUndefined()
  })

  test('adds elevator holes when an existing manual hole is too small', () => {
    const building = BuildingNode.parse({ name: 'Building' })
    const ground = LevelNode.parse({ name: 'Ground', level: 0, parentId: building.id })
    const upper = LevelNode.parse({ name: 'Upper', level: 1, parentId: building.id })
    const elevator = ElevatorNode.parse({
      name: 'Elevator',
      parentId: building.id,
      position: [2, 0, 1.5],
      width: 1.6,
      depth: 1.6,
    })
    const buildingWithChildren = {
      ...building,
      children: [ground.id, upper.id, elevator.id],
    }
    const smallManualOpening: Array<[number, number]> = [
      [1.7, 1.2],
      [2.3, 1.2],
      [2.3, 1.8],
      [1.7, 1.8],
    ]
    const upperSlab = SlabNode.parse({
      name: 'Upper Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      holes: [smallManualOpening],
      holeMetadata: [{ source: 'manual' }],
    })
    const nodes = Object.fromEntries(
      [buildingWithChildren, ground, upper, elevator, upperSlab].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const updates = syncAutoElevatorOpenings(nodes)
    const slabUpdate = updates.find((update) => update.id === upperSlab.id)

    expect(slabUpdate?.data.holes).toHaveLength(2)
    expect(slabUpdate?.data.holes?.[0]).toEqual(smallManualOpening)
    expect(slabUpdate?.data.holeMetadata).toEqual([
      { source: 'manual' },
      { source: 'elevator', elevatorId: elevator.id },
    ])
  })

  test('removes stale auto elevator holes when a manual hole overlaps the elevator opening', () => {
    const building = BuildingNode.parse({ name: 'Building' })
    const ground = LevelNode.parse({ name: 'Ground', level: 0, parentId: building.id })
    const upper = LevelNode.parse({ name: 'Upper', level: 1, parentId: building.id })
    const elevator = ElevatorNode.parse({
      name: 'Elevator',
      parentId: building.id,
      position: [2, 0, 1.5],
      width: 1.6,
      depth: 1.6,
    })
    const buildingWithChildren = {
      ...building,
      children: [ground.id, upper.id, elevator.id],
    }
    const manualOpening: Array<[number, number]> = [
      [1, 0.5],
      [3, 0.5],
      [3, 2.5],
      [1, 2.5],
    ]
    const staleAutoOpening: Array<[number, number]> = [
      [1.12, 0.62],
      [2.88, 0.62],
      [2.88, 2.38],
      [1.12, 2.38],
    ]
    const upperSlab = SlabNode.parse({
      name: 'Upper Slab',
      parentId: upper.id,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      holes: [manualOpening, staleAutoOpening],
      holeMetadata: [{ source: 'manual' }, { source: 'elevator', elevatorId: elevator.id }],
    })
    const nodes = Object.fromEntries(
      [buildingWithChildren, ground, upper, elevator, upperSlab].map((node) => [node.id, node]),
    ) as Record<string, AnyNode>

    const updates = syncAutoElevatorOpenings(nodes)
    const slabUpdate = updates.find((update) => update.id === upperSlab.id)

    expect(slabUpdate?.data.holes).toEqual([manualOpening])
    expect(slabUpdate?.data.holeMetadata).toEqual([{ source: 'manual' }])
  })
})

for (const mode of ['building', 'level', 'legacy-level'] as const) {
  test(`elevator cuts remain in its own building; parent mode: ${mode}`, () => {
    const legacyParent = mode !== 'building'
    const a = BuildingNode.parse({ id: 'building_elevator_a' })
    const b = BuildingNode.parse({ id: 'building_elevator_b' })
    const a0 = LevelNode.parse({ id: 'level_elevator_a0', parentId: a.id, level: 0 })
    const a1 = LevelNode.parse({ id: 'level_elevator_a1', parentId: a.id, level: 1 })
    const b0 = LevelNode.parse({ id: 'level_elevator_b0', parentId: b.id, level: 0 })
    const b1 = LevelNode.parse({ id: 'level_elevator_b1', parentId: b.id, level: 1 })
    const elevator = ElevatorNode.parse({
      id: 'elevator_own_building',
      parentId: legacyParent ? a0.id : a.id,
      fromLevelId: a0.id,
      toLevelId: a1.id,
    })
    a.children = [a0.id, a1.id, ...(legacyParent ? [] : [elevator.id])]
    b.children = [b0.id, b1.id]
    if (legacyParent) a0.children = [elevator.id]
    if (mode === 'legacy-level') a0.parentId = null
    const polygon: [number, number][] = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
    ]
    const manual: [number, number][] = [
      [3, 3],
      [4, 3],
      [4, 4],
      [3, 4],
    ]
    const aSlab = SlabNode.parse({ parentId: a1.id, polygon })
    const aCeiling = CeilingNode.parse({ parentId: a0.id, polygon })
    const bSlab = SlabNode.parse({
      parentId: b1.id,
      polygon,
      holes: [manual],
      holeMetadata: [{ source: 'manual' }],
    })
    const bCeiling = CeilingNode.parse({ parentId: b0.id, polygon })
    const nodes = Object.fromEntries(
      [a, b, a0, a1, b0, b1, elevator, aSlab, aCeiling, bSlab, bCeiling].map((node) => [
        node.id,
        node,
      ]),
    ) as Record<string, AnyNode>
    const updates = syncAutoElevatorOpenings(nodes)
    expect(updates.map((update) => update.id)).toContain(aSlab.id)
    expect(updates.map((update) => update.id)).toContain(aCeiling.id)
    expect(updates.map((update) => update.id)).not.toContain(bSlab.id)
    expect(updates.map((update) => update.id)).not.toContain(bCeiling.id)

    const openings = [aSlab, aCeiling, bSlab, bCeiling].map((surface) =>
      FloorOpeningNode.parse({
        id: `floor-opening_${surface.id}`,
        parentId: surface.parentId,
        surfaceId: surface.id,
        source: 'elevator',
        ownerId: elevator.id,
        polygon: [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ],
        drawnOn: surface.type === 'slab' ? 'floor' : 'ceiling',
        cutsAdjacent: false,
      }),
    )
    for (const opening of openings) nodes[opening.id] = opening
    const manualOpening = FloorOpeningNode.parse({
      id: 'floor-opening_manual_other_building',
      parentId: b1.id,
      polygon: manual,
      source: 'manual',
    })
    nodes[manualOpening.id] = manualOpening
    const changes = planOwnedFloorOpenings(nodes)
    const deleted = changes.filter((change) => change.op === 'delete').map((change) => change.id)
    expect(deleted).toContain(openings[2]!.id)
    expect(deleted).toContain(openings[3]!.id)
    expect(deleted).not.toContain(openings[0]!.id)
    expect(deleted).not.toContain(openings[1]!.id)
    expect(deleted).not.toContain(manualOpening.id)
    expect(changes.some((change) => change.op === 'update' && change.id === bSlab.id)).toBe(false)
    expect(
      planOwnedFloorOpenings(nodes, { skipExistingSurfaces: true }).some(
        (change) => change.op === 'delete',
      ),
    ).toBe(false)
    expect(bSlab.holes).toEqual([manual])
    const reconciled = { ...nodes }
    for (const change of changes) {
      if (change.op === 'create') reconciled[change.node.id] = change.node
      else if (change.op === 'delete') delete reconciled[change.id]
      else reconciled[change.id] = { ...reconciled[change.id], ...change.data } as AnyNode
    }
    expect(reconciled[manualOpening.id]).toEqual(manualOpening)
    expect(planOwnedFloorOpenings(reconciled)).toEqual([])
  })
}
