/**
 * Default sill height (metres from the floor to the BOTTOM of a window) for a
 * fresh window that has no wall-face height yet — the off-wall ghost and the
 * floor-cursor placement use it so a new window floats slightly above the
 * ground rather than sitting on it. The committed Y is the window's CENTRE, so
 * callers add `height / 2`. An existing window keeps its own sill.
 */
export const DEFAULT_WINDOW_SILL_M = 0.5

export { wallLocalToWorld } from '../shared/wall-local-frame'

/** Window centre on its wall and under its ceiling: the shared rule in core (`clampWindowToWall`). */
export { clampWindowToWall as clampToWall } from '@aedifex/core/building'

/**
 * Wall-child overlap is shared by door + window placement (one source of
 * truth in `shared/wall-attach-target.ts`). Re-exported here so existing
 * `./window-math` importers don't change.
 */
export { hasWallChildOverlap } from '../shared/wall-attach-target'
