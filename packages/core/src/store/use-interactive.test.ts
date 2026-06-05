import { beforeEach, describe, expect, test } from 'bun:test'
import type { Interactive } from '../schema/nodes/item'
import type { AnyNodeId } from '../schema/types'
import { useInteractive } from './use-interactive'

/**
 * use-interactive — runtime state for operable items, doors, windows,
 * skylights, and elevators. The store is global; reset it between tests so
 * cases don't leak.
 */

function reset() {
  useInteractive.setState({
    items: {},
    doors: {},
    doorAnimations: {},
    windows: {},
    windowAnimations: {},
    skylights: {},
    skylightAnimations: {},
    elevators: {},
  })
}

beforeEach(reset)

const ID = 'item_1' as AnyNodeId
const ELEV = 'elev_1' as AnyNodeId
const L1 = 'level_1' as AnyNodeId
const L2 = 'level_2' as AnyNodeId

function makeInteractive(overrides: Partial<Interactive> = {}): Interactive {
  return {
    controls: [],
    effects: [],
    ...overrides,
  } as Interactive
}

describe('initItem — idempotent + control default resolution', () => {
  test('no-op when interactive has no controls (lights without sliders)', () => {
    useInteractive.getState().initItem(ID, makeInteractive())
    expect(useInteractive.getState().items[ID]).toBeUndefined()
  })

  test('initialises toggle / slider / temperature controls to their defaults', () => {
    const interactive = makeInteractive({
      controls: [
        { kind: 'toggle', label: 'Power', default: true } as never,
        { kind: 'slider', label: 'Bright', min: 0, max: 100, step: 1, displayMode: 'slider', default: 42 } as never,
        // temperature with no `default` falls back to min
        { kind: 'temperature', label: 'Temp', min: 16, max: 30, unit: 'C' } as never,
      ],
    })
    useInteractive.getState().initItem(ID, interactive)
    expect(useInteractive.getState().items[ID]?.controlValues).toEqual([true, 42, 16])
  })

  test('second initItem call is idempotent (does not overwrite user-set values)', () => {
    const interactive = makeInteractive({
      controls: [{ kind: 'toggle', label: 'x', default: false } as never],
    })
    useInteractive.getState().initItem(ID, interactive)
    useInteractive.getState().setControlValue(ID, 0, true)
    useInteractive.getState().initItem(ID, interactive)
    expect(useInteractive.getState().items[ID]?.controlValues).toEqual([true])
  })
})

describe('setControlValue', () => {
  test('updates the indexed value without touching neighbours', () => {
    useInteractive.getState().initItem(
      ID,
      makeInteractive({
        controls: [
          { kind: 'toggle', label: 'a', default: false } as never,
          { kind: 'toggle', label: 'b', default: false } as never,
        ],
      }),
    )
    useInteractive.getState().setControlValue(ID, 1, true)
    expect(useInteractive.getState().items[ID]?.controlValues).toEqual([false, true])
  })

  test('no-op when item is unknown (avoid creating a phantom entry)', () => {
    useInteractive.getState().setControlValue('ghost' as AnyNodeId, 0, true)
    expect(useInteractive.getState().items['ghost' as AnyNodeId]).toBeUndefined()
  })
})

describe('door transient state', () => {
  test('setDoorOpenState merges (operationState + swingAngle can coexist)', () => {
    useInteractive.getState().setDoorOpenState(ID, { operationState: 0.4 })
    useInteractive.getState().setDoorOpenState(ID, { swingAngle: 30 })
    expect(useInteractive.getState().doors[ID]).toEqual({ operationState: 0.4, swingAngle: 30 })
  })

  test('removeDoorOpenState drops only the target key', () => {
    useInteractive.getState().setDoorOpenState(ID, { operationState: 1 })
    useInteractive.getState().setDoorOpenState('other' as AnyNodeId, { operationState: 0.5 })
    useInteractive.getState().removeDoorOpenState(ID)
    expect(useInteractive.getState().doors[ID]).toBeUndefined()
    expect(useInteractive.getState().doors['other' as AnyNodeId]).toEqual({ operationState: 0.5 })
  })

  test('startDoorAnimation REPLACES (not merges) — animation is a frame-scheduled tween, last-write-wins', () => {
    useInteractive.getState().startDoorAnimation(ID, {
      field: 'operationState',
      from: 0,
      to: 1,
      startedAt: null,
      durationMs: 300,
      persist: true,
    })
    useInteractive.getState().startDoorAnimation(ID, {
      field: 'swingAngle',
      from: 0,
      to: 90,
      startedAt: null,
      durationMs: 200,
      persist: false,
    })
    expect(useInteractive.getState().doorAnimations[ID]).toEqual({
      field: 'swingAngle',
      from: 0,
      to: 90,
      startedAt: null,
      durationMs: 200,
      persist: false,
    })
  })

  test('cancelDoorAnimation removes the queued tween', () => {
    useInteractive.getState().startDoorAnimation(ID, {
      field: 'operationState',
      from: 0,
      to: 1,
      startedAt: null,
      durationMs: 300,
      persist: true,
    })
    useInteractive.getState().cancelDoorAnimation(ID)
    expect(useInteractive.getState().doorAnimations[ID]).toBeUndefined()
  })
})

describe('initElevator — idempotent guard', () => {
  test('first call seeds default phase=idle and currentLevelId', () => {
    useInteractive.getState().initElevator(ELEV, L1, 0)
    const state = useInteractive.getState().elevators[ELEV]
    expect(state?.currentLevelId).toBe(L1)
    expect(state?.phase).toBe('idle')
    expect(state?.carY).toBe(0)
    expect(state?.queue).toEqual([])
  })

  test('re-init preserves currentLevelId + phase (mid-trip remount does not snap car back to L1)', () => {
    // Simulate: elevator is mid-trip (phase=moving, target=L2) and the
    // renderer unmounts/remounts (level switch, suspense boundary, hot-reload).
    // If initElevator wasn't idempotent we'd clobber the live trip state.
    useInteractive.getState().initElevator(ELEV, L1, 0)
    useInteractive.getState().setElevatorState(ELEV, {
      currentLevelId: L2,
      targetLevelId: L1,
      phase: 'moving',
      carY: 3.2,
    })
    useInteractive.getState().initElevator(ELEV, L1, 0) // remount → re-init
    const state = useInteractive.getState().elevators[ELEV]
    expect(state?.currentLevelId).toBe(L2)
    expect(state?.targetLevelId).toBe(L1)
    expect(state?.phase).toBe('moving')
    expect(state?.carY).toBe(3.2)
  })
})

describe('setElevatorState + removeElevator', () => {
  test('setElevatorState no-ops on unknown elevator (no phantom entry)', () => {
    useInteractive.getState().setElevatorState('ghost' as AnyNodeId, { phase: 'open' })
    expect(useInteractive.getState().elevators['ghost' as AnyNodeId]).toBeUndefined()
  })

  test('setElevatorState merges (partial update preserves carY/queue)', () => {
    useInteractive.getState().initElevator(ELEV, L1, 5)
    useInteractive.getState().setElevatorState(ELEV, { queue: [L2] })
    useInteractive.getState().setElevatorState(ELEV, { phase: 'closing' })
    const state = useInteractive.getState().elevators[ELEV]
    expect(state?.carY).toBe(5)
    expect(state?.queue).toEqual([L2])
    expect(state?.phase).toBe('closing')
  })

  test('removeElevator clears state when renderer unmounts', () => {
    useInteractive.getState().initElevator(ELEV, L1, 0)
    useInteractive.getState().removeElevator(ELEV)
    expect(useInteractive.getState().elevators[ELEV]).toBeUndefined()
  })
})
