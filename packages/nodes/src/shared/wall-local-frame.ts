import { getWallCurveFrameAt, getWallCurveLength, type WallNode } from '@aedifex/core'

/** Converts wall-local coordinates to the building render frame. */
export function wallLocalToWorld(
  wallNode: WallNode,
  localX: number,
  localY: number,
  levelYOffset = 0,
  supportElevation = 0,
): [number, number, number] {
  const wallLength = getWallCurveLength(wallNode)
  const frame = getWallCurveFrameAt(wallNode, wallLength > 1e-6 ? localX / wallLength : 0)
  return [
    frame.point.x,
    supportElevation + (wallNode.supportOffset ?? 0) + localY + levelYOffset,
    frame.point.y,
  ]
}
