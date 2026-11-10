import { describe, expect, test } from 'bun:test'
import type { AnyNodeId } from '../../schema'
import { BuildingNode, ElevatorNode, LevelNode } from '../../schema'
import { useInteractive } from '../../store/use-interactive'
import useScene from '../../store/use-scene'
import {
  createElevatorInteractiveState,
  openElevatorDoor,
  openElevatorDoorState,
  queueElevatorRequest,
  requestElevatorLevel,
  stepElevatorRuntimeState,
  stepElevatorRuntimes,
} from './elevator-runtime'
import type { ElevatorLevelEntry } from './elevator-service'

const groundLevelId = 'level_ground' as AnyNodeId
const upperLevelId = 'level_upper' as AnyNodeId

const entries: ElevatorLevelEntry[] = [
  { id: groundLevelId as ElevatorLevelEntry['id'], label: '0', baseY: 0 },
  { id: upperLevelId as ElevatorLevelEntry['id'], label: '1', baseY: 2.5 },
]

const elevator = ElevatorNode.parse({
  speed: 10,
  doorDurationMs: 100,
  dwellMs: 0,
})

describe('elevator runtime helpers', () => {
  test('queues level requests without duplicating the target', () => {
    const state = createElevatorInteractiveState(groundLevelId, 0)
    const queued = queueElevatorRequest(state, upperLevelId)
    const duplicated = queueElevatorRequest(queued, upperLevelId)

    expect(queued.queue).toEqual([upperLevelId])
    expect(queued.requestedStops).toEqual([upperLevelId])
    expect(duplicated.queue).toEqual([upperLevelId])
    expect(duplicated.requestedStops).toEqual([upperLevelId])
  })

  test('opens doors only when the elevator is not moving', () => {
    const idle = createElevatorInteractiveState(groundLevelId, 0)
    const moving = { ...idle, phase: 'moving' as const }

    expect(openElevatorDoorState(idle).phase).toBe('opening')
    expect(openElevatorDoorState(moving)).toBe(moving)
  })

  test('moves to a queued level and clears the served request on arrival', () => {
    const queued = queueElevatorRequest(
      createElevatorInteractiveState(groundLevelId, 0),
      upperLevelId,
    )
    const moving = stepElevatorRuntimeState({
      defaultEntry: entries[0]!,
      delta: 0.016,
      elevator,
      entries,
      now: 0,
      state: queued,
    })

    const arrived = stepElevatorRuntimeState({
      defaultEntry: entries[0]!,
      delta: 1,
      elevator,
      entries,
      now: 100,
      state: moving,
    })

    const open = stepElevatorRuntimeState({
      defaultEntry: entries[0]!,
      delta: 1,
      elevator,
      entries,
      now: 200,
      state: arrived,
    })

    expect(moving.phase).toBe('moving')
    expect(arrived.currentLevelId).toBe(upperLevelId)
    expect(arrived.phase).toBe('opening')
    expect(open.phase).toBe('open')
    expect(open.queue).toEqual([])
    expect(open.requestedStops).toEqual([upperLevelId])
  })
})

describe('elevator service changes', () => {
  test('an unchanged idle cab keeps the same state', () => {
    const state = createElevatorInteractiveState(groundLevelId, 0)
    expect(
      stepElevatorRuntimeState({
        defaultEntry: entries[0]!,
        entries,
        elevator,
        now: 0,
        delta: 0.1,
        state,
      }),
    ).toBe(state)
  })

  test('removing the current landing resets to an available landing', () => {
    const next = stepElevatorRuntimeState({
      defaultEntry: entries[1]!,
      entries: [entries[1]!],
      elevator,
      now: 0,
      delta: 0.1,
      state: createElevatorInteractiveState(groundLevelId, 0),
    })
    expect(next.currentLevelId).toBe(upperLevelId)
    expect(next.carY).toBe(2.5)
    expect(next.doorOpen).toBe(0)
  })

  test('a stationary cab follows its landing elevation', () => {
    const revised = entries.map((entry) => ({ ...entry, baseY: entry.baseY + 1 }))
    const next = stepElevatorRuntimeState({
      defaultEntry: revised[0]!,
      entries: revised,
      elevator,
      now: 0,
      delta: 0.1,
      state: createElevatorInteractiveState(groundLevelId, 0),
    })
    expect(next.carY).toBe(1)
  })

  test('an idle cab leaves a disabled landing', () => {
    const changed = { ...elevator, disabledLevelIds: [upperLevelId] }
    let state = createElevatorInteractiveState(upperLevelId, 2.5)
    for (let tick = 0; tick < 20; tick++) {
      state = stepElevatorRuntimeState({
        defaultEntry: entries[0]!,
        entries,
        elevator: changed,
        now: tick * 100,
        delta: 0.1,
        state,
      })
    }
    expect(state.currentLevelId).toBe(groundLevelId)
    expect(state.carY).toBe(0)
  })

  test('a disabled destination is removed while a moving cab goes to an available landing', () => {
    const changed = { ...elevator, disabledLevelIds: [upperLevelId] }
    const state = {
      ...createElevatorInteractiveState(groundLevelId, 0),
      carY: 1,
      phase: 'moving' as const,
      targetLevelId: upperLevelId,
      queue: [upperLevelId],
      requestedStops: [upperLevelId],
    }
    const next = stepElevatorRuntimeState({
      defaultEntry: entries[0]!,
      entries,
      elevator: changed,
      now: 0,
      delta: 0.01,
      state,
    })
    expect(next.targetLevelId).toBe(groundLevelId)
    expect(next.carY).toBeLessThan(1)
    expect(next.queue).not.toContain(upperLevelId)
    expect(next.requestedStops).not.toContain(upperLevelId)
  })

  test('when every landing is disabled, a moving cab waits and resumes without jumping', () => {
    const moving = {
      ...createElevatorInteractiveState(groundLevelId, 0),
      carY: 1,
      phase: 'moving' as const,
      targetLevelId: upperLevelId,
      queue: [upperLevelId],
      requestedStops: [upperLevelId],
    }
    const unavailable = { ...elevator, disabledLevelIds: [groundLevelId, upperLevelId] }
    const wait = stepElevatorRuntimeState({
      defaultEntry: entries[0]!,
      entries,
      elevator: unavailable,
      now: 0,
      delta: 0.1,
      state: moving,
    })
    expect(wait.carY).toBe(1)
    expect(wait.phase).toBe('moving')
    expect(wait.targetLevelId).toBeNull()
    expect(wait.queue).toEqual([])
    const resume = stepElevatorRuntimeState({
      defaultEntry: entries[0]!,
      entries,
      elevator,
      now: 100,
      delta: 0.01,
      state: wait,
    })
    expect(resume.targetLevelId).toBe(groundLevelId)
    expect(resume.carY).toBeCloseTo(0.9)
  })

  test('a door closes when its landing becomes disabled', () => {
    const state = {
      ...createElevatorInteractiveState(upperLevelId, 2.5),
      phase: 'opening' as const,
      doorOpen: 0.8,
      targetLevelId: upperLevelId,
      queue: [upperLevelId],
      requestedStops: [upperLevelId],
    }
    const next = stepElevatorRuntimeState({
      defaultEntry: entries[0]!,
      entries,
      elevator: { ...elevator, disabledLevelIds: [upperLevelId] },
      now: 0,
      delta: 0.01,
      state,
    })
    expect(next.phase).toBe('closing')
    expect(next.doorOpen).toBeLessThan(0.8)
    expect(next.queue).not.toContain(upperLevelId)
  })

  test('requests and door opening obey the live service configuration', () => {
    const oldNodes = useScene.getState().nodes
    const oldElevators = useInteractive.getState().elevators
    try {
      const building = BuildingNode.parse({})
      const levels = [0, 1, 2].map((level) => LevelNode.parse({ parentId: building.id, level }))
      const lift = ElevatorNode.parse({
        parentId: building.id,
        fromLevelId: levels[0]!.id,
        toLevelId: levels[1]!.id,
        defaultLevelId: levels[1]!.id,
        disabledLevelIds: [levels[1]!.id],
      })
      building.children = [...levels.map((level) => level.id), lift.id]
      useScene.setState({
        nodes: Object.fromEntries([building, ...levels, lift].map((node) => [node.id, node])),
      })
      requestElevatorLevel(lift.id, levels[1]!.id)
      requestElevatorLevel(lift.id, levels[2]!.id)
      expect(useInteractive.getState().elevators[lift.id]).toBeUndefined()
      stepElevatorRuntimes(0, 0.1)
      expect(useInteractive.getState().elevators[lift.id]!.currentLevelId).toBe(levels[0]!.id)
      useInteractive
        .getState()
        .setElevatorState(lift.id, createElevatorInteractiveState(levels[1]!.id, 2.5))
      openElevatorDoor(lift.id)
      expect(useInteractive.getState().elevators[lift.id]!.phase).toBe('idle')
      useScene.setState({
        nodes: {
          ...useScene.getState().nodes,
          [lift.id]: { ...lift, disabledLevelIds: [], serviceOnlyLevelIds: [levels[1]!.id] },
        },
      })
      requestElevatorLevel(lift.id, levels[1]!.id)
      expect(useInteractive.getState().elevators[lift.id]!.queue).toEqual([levels[1]!.id])
      useScene.setState({
        nodes: { [building.id]: { ...building, children: [lift.id] }, [lift.id]: lift },
      })
      stepElevatorRuntimes(1, 0.1)
      expect(useInteractive.getState().elevators[lift.id]).toBeUndefined()
    } finally {
      useScene.setState({ nodes: oldNodes })
      useInteractive.setState({ elevators: oldElevators })
    }
  })
})
