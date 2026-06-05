import { describe, expect, test } from 'bun:test'
import type { AnyNode } from '../../schema'
import { BuildingNode, CeilingNode, ElevatorNode, LevelNode } from '../../schema'
import {
  DEFAULT_ELEVATOR_LEVEL_HEIGHT,
  getElevatorLevelHeight,
  resolveElevatorBuildingLevels,
  resolveElevatorLevels,
  resolveElevatorServiceLevelIds,
  resolveElevatorServiceLevels,
} from './elevator-service'

function buildScene({
  levelHeights,
  fromLevelId,
  toLevelId,
  servedLevelIds,
  defaultLevelId,
}: {
  levelHeights: number[] // Array of (number, height-in-meters) — height may be undefined to use default
  fromLevelId?: string | null
  toLevelId?: string | null
  servedLevelIds?: string[]
  defaultLevelId?: string | null
}) {
  const building = BuildingNode.parse({ name: 'Building' })
  const levels = levelHeights.map((height, index) => {
    const level = LevelNode.parse({
      name: `Level ${index}`,
      level: index,
      parentId: building.id,
    })
    // For non-default heights, attach a ceiling that conveys the level height
    if (height !== DEFAULT_ELEVATOR_LEVEL_HEIGHT) {
      const ceiling = CeilingNode.parse({
        name: 'C',
        parentId: level.id,
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        height,
      })
      return {
        level: { ...level, children: [ceiling.id] },
        ceiling,
      }
    }
    return { level }
  })

  const elevator = ElevatorNode.parse({
    name: 'Elevator',
    parentId: building.id,
    position: [0, 0, 0],
    width: 1.6,
    depth: 1.6,
    fromLevelId: fromLevelId ?? null,
    toLevelId: toLevelId ?? null,
    ...(servedLevelIds && { servedLevelIds }),
    ...(defaultLevelId !== undefined && { defaultLevelId }),
  })

  const buildingWithChildren = {
    ...building,
    children: [...levels.map((l) => l.level.id), elevator.id],
  }

  const allNodes = [
    buildingWithChildren,
    ...levels.flatMap((l) => (l.ceiling ? [l.level, l.ceiling] : [l.level])),
    elevator,
  ]
  const nodes = Object.fromEntries(allNodes.map((n) => [n.id, n])) as Record<string, AnyNode>

  return { nodes, building: buildingWithChildren, elevator, levels: levels.map((l) => l.level) }
}

describe('getElevatorLevelHeight', () => {
  test('returns ceiling height when level has a ceiling child', () => {
    const { nodes, levels } = buildScene({ levelHeights: [3.0, 2.5] })
    expect(getElevatorLevelHeight(levels[0]!.id, nodes)).toBeCloseTo(3.0)
  })

  test('returns DEFAULT_ELEVATOR_LEVEL_HEIGHT when level has no ceiling/wall children', () => {
    const { nodes, levels } = buildScene({ levelHeights: [2.5] })
    expect(getElevatorLevelHeight(levels[0]!.id, nodes)).toBe(DEFAULT_ELEVATOR_LEVEL_HEIGHT)
  })

  test('returns DEFAULT_ELEVATOR_LEVEL_HEIGHT for missing levelId', () => {
    const { nodes } = buildScene({ levelHeights: [2.5] })
    expect(getElevatorLevelHeight('nonexistent', nodes)).toBe(DEFAULT_ELEVATOR_LEVEL_HEIGHT)
  })
})

describe('resolveElevatorBuildingLevels', () => {
  test('returns sorted level list from elevator building', () => {
    const { nodes, elevator, levels } = buildScene({ levelHeights: [2.5, 2.5, 2.5] })
    const resolved = resolveElevatorBuildingLevels(elevator, nodes)
    expect(resolved.map((l) => l.id)).toEqual(levels.map((l) => l.id))
  })

  test('returns empty list when elevator has no building parent', () => {
    const elevator = ElevatorNode.parse({ name: 'E', parentId: null })
    const nodes: Record<string, AnyNode> = { [elevator.id]: elevator } as any
    expect(resolveElevatorBuildingLevels(elevator, nodes)).toEqual([])
  })
})

describe('resolveElevatorServiceLevels — bounds vs legacy served', () => {
  test('explicit fromLevelId/toLevelId range overrides legacy servedLevelIds', () => {
    const { nodes, elevator, levels } = buildScene({
      levelHeights: [2.5, 2.5, 2.5, 2.5],
      fromLevelId: undefined,
      toLevelId: undefined,
      servedLevelIds: ['NOT_REAL_ID'],
    })
    // Set explicit fromLevelId/toLevelId
    const elevatorWithBounds = {
      ...elevator,
      fromLevelId: levels[1]!.id,
      toLevelId: levels[2]!.id,
    }
    const updatedNodes = { ...nodes, [elevatorWithBounds.id]: elevatorWithBounds }
    const serviceLevels = resolveElevatorServiceLevels(elevatorWithBounds, updatedNodes)
    // Bounds take precedence; legacy servedLevelIds ignored
    expect(serviceLevels.map((l) => l.id)).toEqual([levels[1]!.id, levels[2]!.id])
  })

  test('legacy servedLevelIds used when fromLevelId/toLevelId are missing', () => {
    const built = buildScene({ levelHeights: [2.5, 2.5, 2.5, 2.5] })
    const elevatorLegacy = {
      ...built.elevator,
      fromLevelId: null,
      toLevelId: null,
      servedLevelIds: [built.levels[1]!.id, built.levels[2]!.id, built.levels[3]!.id],
    }
    const updatedNodes = { ...built.nodes, [elevatorLegacy.id]: elevatorLegacy }
    const serviceLevels = resolveElevatorServiceLevels(elevatorLegacy, updatedNodes)
    expect(serviceLevels.map((l) => l.id)).toEqual([
      built.levels[1]!.id,
      built.levels[2]!.id,
      built.levels[3]!.id,
    ])
  })

  test('returns empty when building has no levels', () => {
    const elevator = ElevatorNode.parse({ name: 'E', parentId: null })
    const nodes: Record<string, AnyNode> = { [elevator.id]: elevator } as any
    expect(resolveElevatorServiceLevels(elevator, nodes)).toEqual([])
  })

  test('resolveElevatorServiceLevelIds returns IDs only', () => {
    const { nodes, elevator, levels } = buildScene({ levelHeights: [2.5, 2.5] })
    const elev = { ...elevator, fromLevelId: levels[0]!.id, toLevelId: levels[1]!.id }
    const updated = { ...nodes, [elev.id]: elev }
    expect(resolveElevatorServiceLevelIds(elev, updated)).toEqual([levels[0]!.id, levels[1]!.id])
  })
})

describe('resolveElevatorLevels — cumulativeY with mixed heights', () => {
  test('baseY accumulates per level using each level\'s ceiling height', () => {
    // Heights: L0=2.5, L1=3.0, L2=4.0
    const { nodes, elevator, levels } = buildScene({
      levelHeights: [2.5, 3.0, 4.0],
      fromLevelId: undefined,
      toLevelId: undefined,
    })
    const elev = { ...elevator, fromLevelId: levels[0]!.id, toLevelId: levels[2]!.id }
    const updated = { ...nodes, [elev.id]: elev }
    const { entries } = resolveElevatorLevels(elev, updated)
    expect(entries).toHaveLength(3)
    expect(entries[0]!.baseY).toBeCloseTo(0)
    expect(entries[1]!.baseY).toBeCloseTo(2.5)
    expect(entries[2]!.baseY).toBeCloseTo(2.5 + 3.0)
  })

  test('defaultEntry falls back to fromLevelId then to entries[0]', () => {
    const { nodes, elevator, levels } = buildScene({ levelHeights: [2.5, 2.5, 2.5] })
    const elev = {
      ...elevator,
      fromLevelId: levels[0]!.id,
      toLevelId: levels[2]!.id,
      defaultLevelId: null,
    }
    const updated = { ...nodes, [elev.id]: elev }
    const { defaultEntry } = resolveElevatorLevels(elev, updated)
    // No defaultLevelId, so fallback to fromLevelId
    expect(defaultEntry?.id).toBe(levels[0]!.id)
  })

  test('shaftBaseY = first served baseY, shaftTopY = next-level baseY (or cumulative)', () => {
    const { nodes, elevator, levels } = buildScene({ levelHeights: [2.5, 3.0, 4.0] })
    // Serve only level 1, level above is level 2 with baseY = 2.5+3 = 5.5
    const elev = { ...elevator, fromLevelId: levels[1]!.id, toLevelId: levels[1]!.id }
    const updated = { ...nodes, [elev.id]: elev }
    const { shaftBaseY, shaftTopY } = resolveElevatorLevels(elev, updated)
    expect(shaftBaseY).toBeCloseTo(2.5) // L1 base
    expect(shaftTopY).toBeCloseTo(2.5 + 3.0) // L2 base (next-level)
  })

  test('shaftTopY for top-level service uses cumulativeY (no next level)', () => {
    const { nodes, elevator, levels } = buildScene({ levelHeights: [2.5, 3.0] })
    const elev = { ...elevator, fromLevelId: levels[0]!.id, toLevelId: levels[1]!.id }
    const updated = { ...nodes, [elev.id]: elev }
    const { shaftTopY } = resolveElevatorLevels(elev, updated)
    expect(shaftTopY).toBeCloseTo(5.5) // cumulative = 2.5+3.0
  })

  test('totalHeight always >= cabHeight + 0.3 floor', () => {
    const { nodes, elevator, levels } = buildScene({ levelHeights: [2.5] })
    const elev = {
      ...elevator,
      fromLevelId: levels[0]!.id,
      toLevelId: levels[0]!.id,
      cabHeight: 2.35,
    }
    const updated = { ...nodes, [elev.id]: elev }
    const { totalHeight } = resolveElevatorLevels(elev, updated)
    expect(totalHeight).toBeGreaterThanOrEqual(2.35 + 0.3)
  })

  test('returns empty entries when no service levels', () => {
    const elevator = ElevatorNode.parse({ name: 'E', parentId: null })
    const nodes: Record<string, AnyNode> = { [elevator.id]: elevator } as any
    const { entries, defaultEntry } = resolveElevatorLevels(elevator, nodes)
    expect(entries).toEqual([])
    expect(defaultEntry).toBeNull()
  })
})
