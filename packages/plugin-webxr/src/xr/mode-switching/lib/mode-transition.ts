export type TransitionPhase =
  | 'idle'
  | 'fade-out'
  | 'black'
  | 'fade-in'
  | 'rearm'
export const TRANSITION_FADE_SECONDS = 0.18
export const TRANSITION_NEUTRAL_SECONDS = 0.15

/** A full black frame precedes commit; large frame deltas cannot skip it. */
export function createModeTransition() {
  let phase: TransitionPhase = 'idle'
  let opacity = 0
  let neutralTime = 0
  return {
    get phase() {
      return phase
    },
    get opacity() {
      return opacity
    },
    start() {
      if (phase !== 'idle') return false
      phase = 'fade-out'
      neutralTime = 0
      return true
    },
    reset() {
      phase = 'idle'
      opacity = 0
      neutralTime = 0
    },
    advance(
      delta: number,
      tracked: boolean,
      neutral: boolean,
      commit: () => void,
    ) {
      const dt = Math.min(0.05, Math.max(0, Number.isFinite(delta) ? delta : 0))
      if (!tracked) {
        neutralTime = 0
        return phase
      }
      if (phase === 'fade-out') {
        opacity = Math.min(1, opacity + dt / TRANSITION_FADE_SECONDS)
        if (opacity === 1) phase = 'black'
      } else if (phase === 'black') {
        // Stay opaque for the commit frame as well.
        commit()
        phase = 'fade-in'
      } else if (phase === 'fade-in') {
        opacity = Math.max(0, opacity - dt / TRANSITION_FADE_SECONDS)
        if (opacity === 0) phase = 'rearm'
      } else if (phase === 'rearm') {
        neutralTime = neutral ? neutralTime + dt : 0
        if (neutralTime >= TRANSITION_NEUTRAL_SECONDS) phase = 'idle'
      }
      return phase
    },
  }
}
