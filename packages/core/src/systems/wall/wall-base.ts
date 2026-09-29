import { GROUND_SUPPORT_ID } from '../../lib/support-host'
import type { SlabNode, WallNode } from '../../schema'
import { computeWallSlabSupport } from '../slab/slab-support'

export type ResolveWallBaseElevationArgs = {
  wall: WallNode
  slabs: readonly SlabNode[]
  walls: WallNode[]
  levelBase?: number
}

/**
 * Level-local Y where a wall begins after resolving its support surface.
 *
 * Ground-hosted walls stay pinned to the level base even when a slab overlaps
 * them. Every other wall follows the normal slab election. `supportOffset` is
 * applied last in both cases, matching the rendered spatial-grid result.
 */
export function resolveWallBaseElevation({
  wall,
  slabs,
  walls,
  levelBase = 0,
}: ResolveWallBaseElevationArgs): number {
  const offset = wall.supportOffset ?? 0
  if (wall.supportSlabId === GROUND_SUPPORT_ID) return levelBase + offset

  return (
    computeWallSlabSupport(
      wall,
      slabs,
      walls,
      wall.supportSlabId ?? null,
      null,
      levelBase,
    ).elevation + offset
  )
}
