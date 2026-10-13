import type { StandingDestination } from './standing-destination'

export type EntryTarget = { destination: StandingDestination; yaw: number }

/** Preview follows aim; explicit placement owns a fixed copy until Replace. */
export function createEntryTargeting() {
  let selected: EntryTarget | null = null
  let placed = false
  return {
    get placed() {
      return placed
    },
    get selected() {
      return selected
    },
    retarget() {
      selected = null
      placed = false
    },
    place(
      destination: StandingDestination | null,
      yaw: number,
      overUI: boolean,
    ) {
      if (placed || overUI || !destination) return false
      selected = {
        destination: { ...destination, point: destination.point.clone() },
        yaw,
      }
      placed = true
      return true
    },
    update(
      destination: StandingDestination | null,
      yaw: number,
      overUI: boolean,
      confirming: boolean,
    ) {
      if (!placed && !overUI && !confirming)
        selected = destination ? { destination, yaw } : null
      return selected
    },
  }
}
