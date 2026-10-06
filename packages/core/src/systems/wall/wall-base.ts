import type { AnyNode, SlabNode, WallNode } from '../../schema'
import { computeWallSlabSupport } from '../slab/slab-support'

export type ResolveWallBaseElevationArgs = {
  wall: WallNode
  slabs: readonly SlabNode[]
  walls: WallNode[]
  levelBase?: number
  nodes?: Readonly<Record<string, AnyNode>>
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
  nodes,
}: ResolveWallBaseElevationArgs): number {
  return (
    computeWallSlabSupport(
      wall,
      slabs,
      walls,
      wall.supportSlabId ?? null,
      null,
      levelBase,
      nodes,
    ).elevation
  )
}
