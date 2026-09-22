import type { WallNode } from '@aedifex/core'

/** Converts wall-local coordinates to the building render frame. */
export function wallLocalToWorld(
  wallNode: WallNode,
  localX: number,
  localY: number,
  levelYOffset = 0,
  supportElevation = 0,
): [number, number, number] {
  const wallAngle = Math.atan2(
    wallNode.end[1] - wallNode.start[1],
    wallNode.end[0] - wallNode.start[0],
  )
  return [
    wallNode.start[0] + localX * Math.cos(wallAngle),
    supportElevation + (wallNode.supportOffset ?? 0) + localY + levelYOffset,
    wallNode.start[1] + localX * Math.sin(wallAngle),
  ]
}
