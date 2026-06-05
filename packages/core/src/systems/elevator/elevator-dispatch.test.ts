import { describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId } from '../../schema'
import { BuildingNode, ElevatorNode, LevelNode } from '../../schema'
import type { ElevatorInteractiveState, ElevatorPhase } from '../../store/use-interactive'
import { resolveElevatorDispatchTarget } from './elevator-dispatch'

function makeBuilding(elevatorCount: number, levelCount: number) {
  const building = BuildingNode.parse({ name: 'Building' })
  const levels = Array.from({ length: levelCount }, (_, index) =>
    LevelNode.parse({
      name: `L${index}`,
      level: index,
      parentId: building.id,
    }),
  )
  const elevators = Array.from({ length: elevatorCount }, (_, index) =>
    ElevatorNode.parse({
      id: `elevator_${index}` as any,
      name: `E${index}`,
      parentId: building.id,
      position: [index * 2, 0, 0],
      width: 1.6,
      depth: 1.6,
      fromLevelId: levels[0]!.id,
      toLevelId: levels[levelCount - 1]!.id,
    }),
  )
  const buildingWithChildren = {
    ...building,
    children: [...levels.map((l) => l.id), ...elevators.map((e) => e.id)],
  }
  const nodes = Object.fromEntries(
    [buildingWithChildren, ...levels, ...elevators].map((n) => [n.id, n]),
  ) as Record<string, AnyNode>
  return { nodes, building: buildingWithChildren, levels, elevators }
}

function makeState({
  currentLevelId,
  phase = 'idle' as ElevatorPhase,
  queue = [],
  targetLevelId = null,
}: {
  currentLevelId: AnyNodeId
  phase?: ElevatorPhase
  queue?: AnyNodeId[]
  targetLevelId?: AnyNodeId | null
}): ElevatorInteractiveState {
  return {
    currentLevelId,
    targetLevelId,
    carY: 0,
    doorOpen: 0,
    phase,
    phaseStartedAt: null,
    queue,
    requestedStops: [],
  }
}

describe('resolveElevatorDispatchTarget', () => {
  test('returns requested elevator unchanged when it is not an elevator node', () => {
    const fakeId = 'not_an_elevator_xyz' as AnyNodeId
    const result = resolveElevatorDispatchTarget({
      elevators: {},
      levelId: 'level_zero' as AnyNodeId,
      nodes: {},
      requestedElevatorId: fakeId,
    })
    expect(result).toBe(fakeId)
  })

  test('single elevator: requested is always chosen', () => {
    const { nodes, levels, elevators } = makeBuilding(1, 2)
    const result = resolveElevatorDispatchTarget({
      elevators: {},
      levelId: levels[1]!.id as AnyNodeId,
      nodes,
      requestedElevatorId: elevators[0]!.id as AnyNodeId,
    })
    expect(result).toBe(elevators[0]!.id)
  })

  test('two elevators, both idle equidistant: tie-breaker -0.01 favors requested', () => {
    const { nodes, levels, elevators } = makeBuilding(2, 3)
    const elevators_state = {
      [elevators[0]!.id]: makeState({ currentLevelId: levels[0]!.id as AnyNodeId }),
      [elevators[1]!.id]: makeState({ currentLevelId: levels[0]!.id as AnyNodeId }),
    } as Record<AnyNodeId, ElevatorInteractiveState>
    // Request elevator 1 — it should win because of -0.01 tie-breaker
    const result = resolveElevatorDispatchTarget({
      elevators: elevators_state,
      levelId: levels[2]!.id as AnyNodeId,
      nodes,
      requestedElevatorId: elevators[1]!.id as AnyNodeId,
    })
    expect(result).toBe(elevators[1]!.id)
  })

  test('idle further elevator wins over busy closer elevator (queue penalty)', () => {
    const { nodes, levels, elevators } = makeBuilding(2, 4)
    const elevators_state = {
      // Elevator 0: closer (currently at L2), but busy with queue
      [elevators[0]!.id]: makeState({
        currentLevelId: levels[2]!.id as AnyNodeId,
        phase: 'moving',
        queue: [levels[3]!.id as AnyNodeId, levels[0]!.id as AnyNodeId],
        targetLevelId: levels[3]!.id as AnyNodeId,
      }),
      // Elevator 1: further (at L0), but completely idle
      [elevators[1]!.id]: makeState({ currentLevelId: levels[0]!.id as AnyNodeId }),
    } as Record<AnyNodeId, ElevatorInteractiveState>
    // Target = L3. distance from E0 = |3-2|=1, from E1 = |3-0|=3.
    // E0 score = 1 + 2*2 + 1 + 0.5 = 6.5
    // E1 score = 3 + 0 + 0 = 3
    // Without tie-breaker: E1 wins. Request E0 to ensure tie-breaker doesn't override
    const result = resolveElevatorDispatchTarget({
      elevators: elevators_state,
      levelId: levels[3]!.id as AnyNodeId,
      nodes,
      requestedElevatorId: elevators[0]!.id as AnyNodeId,
    })
    expect(result).toBe(elevators[1]!.id)
  })

  test('elevators that do not serve target level are skipped (returns requested)', () => {
    const { nodes, levels, elevators } = makeBuilding(2, 3)
    // Disable elevator 0 for level 2
    const elev0 = { ...elevators[0]!, disabledLevelIds: [levels[2]!.id] }
    const updatedNodes = { ...nodes, [elev0.id]: elev0 }
    const result = resolveElevatorDispatchTarget({
      elevators: {},
      levelId: levels[2]!.id as AnyNodeId,
      nodes: updatedNodes,
      requestedElevatorId: elevators[0]!.id as AnyNodeId,
    })
    // Elevator 0 returns null score; elevator 1 wins (only viable candidate)
    expect(result).toBe(elevators[1]!.id)
  })

  test('requested elevator falls back when no candidate matches', () => {
    const { nodes, elevators } = makeBuilding(1, 2)
    // Disable the only elevator for the requested level
    const fakeLevelId = 'level_unknown' as AnyNodeId
    const result = resolveElevatorDispatchTarget({
      elevators: {},
      levelId: fakeLevelId,
      nodes,
      requestedElevatorId: elevators[0]!.id as AnyNodeId,
    })
    expect(result).toBe(elevators[0]!.id)
  })

  test('elevator on serviceOnlyLevelIds is excluded from landing-call dispatch', () => {
    const { nodes, levels, elevators } = makeBuilding(2, 3)
    const elev0 = { ...elevators[0]!, serviceOnlyLevelIds: [levels[2]!.id] }
    const updatedNodes = { ...nodes, [elev0.id]: elev0 }
    const result = resolveElevatorDispatchTarget({
      elevators: {},
      levelId: levels[2]!.id as AnyNodeId,
      nodes: updatedNodes,
      requestedElevatorId: elevators[0]!.id as AnyNodeId,
    })
    expect(result).toBe(elevators[1]!.id)
  })

  test('invisible elevators are skipped', () => {
    const { nodes, levels, elevators } = makeBuilding(2, 3)
    const elev1Invisible = { ...elevators[1]!, visible: false }
    const updatedNodes = { ...nodes, [elev1Invisible.id]: elev1Invisible }
    const result = resolveElevatorDispatchTarget({
      elevators: {},
      levelId: levels[1]!.id as AnyNodeId,
      nodes: updatedNodes,
      requestedElevatorId: elevators[1]!.id as AnyNodeId,
    })
    // Invisible E1 is skipped; E0 is selected
    expect(result).toBe(elevators[0]!.id)
  })

  test('open-phase elevator gets minor open penalty', () => {
    const { nodes, levels, elevators } = makeBuilding(2, 3)
    const elevators_state = {
      // Both at L0; E0 is in 'open' phase (penalty +0.2)
      [elevators[0]!.id]: makeState({
        currentLevelId: levels[0]!.id as AnyNodeId,
        phase: 'open',
      }),
      [elevators[1]!.id]: makeState({ currentLevelId: levels[0]!.id as AnyNodeId }),
    } as Record<AnyNodeId, ElevatorInteractiveState>
    // Request E0. Score E0 = 1 + 0 + 0 + 0.2 - 0.01 = 1.19
    // Score E1 = 1 + 0 + 0 + 0 = 1.0. E1 wins.
    const result = resolveElevatorDispatchTarget({
      elevators: elevators_state,
      levelId: levels[1]!.id as AnyNodeId,
      nodes,
      requestedElevatorId: elevators[0]!.id as AnyNodeId,
    })
    expect(result).toBe(elevators[1]!.id)
  })
})
