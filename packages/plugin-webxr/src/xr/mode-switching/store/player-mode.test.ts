import { beforeEach, describe, expect, test } from 'bun:test'
import {
  toggleXRPlayerMode,
  useXRPlayerMode,
  XR_PLAYER_MODES,
} from './player-mode'

describe('XR player mode', () => {
  test('repeated mode requests and retarget cannot interrupt a transition', () => {
    const mode = useXRPlayerMode.getState()
    mode.setMode('human')
    mode.placeEntry()
    mode.setMode('human')
    const revision = useXRPlayerMode.getState().entryTargetRevision
    mode.retargetEntry()
    mode.setMode('god')
    mode.cancelEntry()
    expect(useXRPlayerMode.getState().entryTargetRevision).toBe(revision)
    expect(useXRPlayerMode.getState().entryConfirmed).toBe(true)
    expect(useXRPlayerMode.getState().transitionTarget).toBe('human')
    mode.completeEntry()
    expect(useXRPlayerMode.getState().mode).toBe('god')
  })
  test('preview status updates do not swallow an Enter request', () => {
    useXRPlayerMode.getState().setMode('human')
    useXRPlayerMode.getState().placeEntry()
    useXRPlayerMode.getState().setMode('human')
    useXRPlayerMode.getState().setEntryMessage('Floor selected')
    useXRPlayerMode.getState().setTransitionPhase('black')
    useXRPlayerMode.getState().completeEntry()
    expect(useXRPlayerMode.getState().mode).toBe('human')
  })
  beforeEach(() => useXRPlayerMode.getState().reset())

  test('both directions change mode only under black and remain locked through fade-in', () => {
    toggleXRPlayerMode()
    expect(useXRPlayerMode.getState().mode).toBe(XR_PLAYER_MODES.GOD)
    expect(useXRPlayerMode.getState().entryRequested).toBe(true)
    expect(useXRPlayerMode.getState().entryConfirmed).toBe(false)
    toggleXRPlayerMode()
    expect(useXRPlayerMode.getState().entryConfirmed).toBe(false)
    useXRPlayerMode.getState().placeEntry()
    toggleXRPlayerMode()
    expect(useXRPlayerMode.getState().entryConfirmed).toBe(true)
    expect(useXRPlayerMode.getState().mode).toBe(XR_PLAYER_MODES.GOD)
    useXRPlayerMode.getState().completeEntry()
    expect(useXRPlayerMode.getState().mode).toBe('god')
    useXRPlayerMode.getState().setTransitionPhase('black')
    useXRPlayerMode.getState().completeEntry()
    expect(useXRPlayerMode.getState().mode).toBe(XR_PLAYER_MODES.HUMAN)
    expect(useXRPlayerMode.getState().inputLocked).toBe(true)
    useXRPlayerMode.getState().setTransitionPhase('idle')
    toggleXRPlayerMode()
    expect(useXRPlayerMode.getState().mode).toBe('human')
    expect(useXRPlayerMode.getState().transitionTarget).toBe('god')
    useXRPlayerMode.getState().setTransitionPhase('black')
    useXRPlayerMode.getState().completeReturn()
    expect(useXRPlayerMode.getState().mode).toBe(XR_PLAYER_MODES.GOD)
  })

  test('session reset clears a partially finished transition', () => {
    const state = useXRPlayerMode.getState()
    state.setMode('human')
    state.placeEntry()
    state.setMode('human')
    state.reset()
    expect(useXRPlayerMode.getState().inputLocked).toBe(false)
    expect(useXRPlayerMode.getState().transitionPhase).toBe('idle')
    expect(useXRPlayerMode.getState().transitionTarget).toBeNull()
  })

  test('cancel or invalid destination never enters Human mode', () => {
    useXRPlayerMode.getState().completeEntry()
    expect(useXRPlayerMode.getState().mode).toBe('god')
    useXRPlayerMode.getState().setMode('human')
    useXRPlayerMode.getState().setMode('human')
    useXRPlayerMode.getState().rejectEntry('No safe floor')
    expect(useXRPlayerMode.getState().entryConfirmed).toBe(false)
    expect(useXRPlayerMode.getState().mode).toBe('god')
    useXRPlayerMode.getState().cancelEntry()
    expect(useXRPlayerMode.getState().entryRequested).toBe(false)
    expect(useXRPlayerMode.getState().entryMessage).toBeNull()
  })

  test('replace clears placement and Enter stays gated until placed again', () => {
    const mode = useXRPlayerMode.getState()
    mode.setMode('human')
    mode.placeEntry()
    expect(useXRPlayerMode.getState().entryPlaced).toBe(true)
    mode.retargetEntry()
    mode.setMode('human')
    mode.completeEntry()
    expect(useXRPlayerMode.getState().entryPlaced).toBe(false)
    expect(useXRPlayerMode.getState().mode).toBe('god')
    mode.cancelEntry()
    mode.placeEntry()
    expect(useXRPlayerMode.getState().entryPlaced).toBe(false)
  })

  test('reopening entry invalidates presses from the cancelled request', () => {
    const mode = useXRPlayerMode.getState()
    mode.setMode('human')
    const revision = useXRPlayerMode.getState().entryTargetRevision
    mode.cancelEntry()
    mode.setMode('human')
    expect(useXRPlayerMode.getState().entryTargetRevision).toBeGreaterThan(
      revision,
    )
    expect(useXRPlayerMode.getState().entryPlaced).toBe(false)
  })
})
