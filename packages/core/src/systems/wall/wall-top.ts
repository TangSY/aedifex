import type { WallNode } from '../../schema/nodes/wall'
import {
  getWallChordFrame,
  getWallCurveFrameAt,
  getWallCurveLength,
  getWallStationAtChordFraction,
} from './wall-curve'

type WallTopShape = Partial<Pick<WallNode, 'start' | 'end' | 'curveOffset'>>

/**
 * Minimum wall body height in meters. Governs both the wall height
 * arrow's lower drag bound and the slab-elevation clamp: a slab may not
 * rise past `storeyHeight - MIN_WALL_HEIGHT` while a plane-bound wall
 * elects it as its base, or the wall's extrusion (plane minus base)
 * would collapse below this minimum.
 */
export const MIN_WALL_HEIGHT = 0.5
export const MIN_WALL_END_HEIGHT = 0.01

export function clampWallEndHeightOffset(offset: number | undefined, bodyHeight: number): number {
  return Math.max(offset ?? 0, MIN_WALL_END_HEIGHT - Math.max(MIN_WALL_END_HEIGHT, bodyHeight))
}

export function wallHasSlopedTop(wall: Pick<WallNode, 'endHeightOffset' | 'topProfile'>): boolean {
  const profile = wall.topProfile
  return profile
    ? Boolean(
        (profile.offset && (profile.to !== profile.from || profile.across)) ||
          (profile.endShift ?? 0) !== (profile.startShift ?? 0) ||
          profile.acrossShift,
      )
    : Boolean(wall.endHeightOffset)
}

export function wallFollowsStorey(
  wall: Pick<WallNode, 'height' | 'supportSlabId' | 'topProfile'>,
  authoredStoreyHeight: number | null,
): boolean {
  if (wall.topProfile) return wall.topProfile.supportHeight === undefined
  return (
    wall.height == null ||
    (authoredStoreyHeight !== null &&
      wall.supportSlabId !== 'ground' &&
      Math.abs(wall.height - authoredStoreyHeight) <= 1e-6)
  )
}

/**
 * Wall-top inversion (vertical building model): a wall with no stored
 * `height` is plane-bound — its top sits at the storey plane (level-local
 * Y = the level's stored height), so a slab lifting the wall's base makes
 * the wall shorter, never taller, and no gap can open at the top of a
 * level. An explicit height equal to the authored storey height expresses the
 * same storey-top intent, even when the resolved plane is clamped or lifted.
 * Other explicit walls stand on their elected support; ground-hosted walls
 * always retain their authored body height.
 *
 * Returns the top in level-local Y (same frame as `electedBase`).
 */
export function resolveWallTopPlane({
  wall,
  storeyHeight,
  electedBase,
  authoredStoreyHeight = storeyHeight,
  t = 0,
}: {
  wall: Pick<WallNode, 'height' | 'supportSlabId' | 'endHeightOffset' | 'topProfile'> & WallTopShape
  storeyHeight: number
  electedBase: number
  authoredStoreyHeight?: number | null
  t?: number
}): number {
  if (wall.topProfile) {
    const {
      offset,
      from,
      to,
      across = 0,
      supportHeight,
      startShift = 0,
      endShift = 0,
      acrossShift = 0,
    } = wall.topProfile
    const start = supportHeight === undefined ? storeyHeight : electedBase + supportHeight
    let transverse = 0
    if ((across || acrossShift) && wall.start && wall.end && t > 0 && t < 1) {
      const shape = { start: wall.start, end: wall.end, curveOffset: wall.curveOffset }
      const chord = getWallChordFrame(shape)
      if (chord.length > 1e-9) {
        const station = getWallStationAtChordFraction(shape, t)
        const point = getWallCurveFrameAt(shape, station / getWallCurveLength(shape)).point
        transverse =
          ((point.x - chord.start.x) * chord.normal.x +
            (point.y - chord.start.y) * chord.normal.y) /
          chord.length
      }
    }
    return (
      start +
      clampWallEndHeightOffset(offset, start - electedBase) *
        (from + (to - from) * t + across * transverse) +
      startShift +
      (endShift - startShift) * t +
      acrossShift * transverse
    )
  }
  const start = wallFollowsStorey(wall, authoredStoreyHeight)
    ? storeyHeight
    : electedBase + wall.height!
  return start + clampWallEndHeightOffset(wall.endHeightOffset, start - electedBase) * t
}

export function resolveWallTop(
  wall: Pick<WallNode, 'height' | 'supportSlabId' | 'endHeightOffset' | 'topProfile'> &
    WallTopShape,
  storeyHeight: number,
  electedBase: number,
  authoredStoreyHeight: number | null = storeyHeight,
  t = 0,
): number {
  const top = resolveWallTopPlane({ wall, storeyHeight, electedBase, authoredStoreyHeight, t })
  return wall.topProfile ? Math.max(electedBase + MIN_WALL_END_HEIGHT, top) : top
}

/**
 * Extruded height of the wall body: {@link resolveWallTop} minus the
 * elected base. Base convention: the elected slab-support elevation itself
 * — the viewer computes `effectiveBaseElevation = min(baseElevation,
 * slabElevation)` and defaults `baseElevation` to the elected elevation,
 * so with only the election in hand the two coincide. Fill-down below the
 * elected base (`baseSegments`) is a geometry detail the extruder handles
 * separately and never changes where the top sits.
 *
 * Equivalently: the wall-local Y of the wall's top, measured from the wall
 * mesh origin (which sits at `electedBase`). May be non-positive when a
 * slab reaches the storey plane; callers own the degenerate-geometry
 * policy.
 */
export function resolveWallEffectiveHeight(
  wall: Pick<WallNode, 'height' | 'supportSlabId' | 'endHeightOffset' | 'topProfile'> &
    WallTopShape,
  storeyHeight: number,
  electedBase: number,
  authoredStoreyHeight: number | null = storeyHeight,
  t = 0,
): number {
  return resolveWallTop(wall, storeyHeight, electedBase, authoredStoreyHeight, t) - electedBase
}
