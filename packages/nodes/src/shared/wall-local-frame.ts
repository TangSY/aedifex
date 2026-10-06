import { getWallBodyCenterOffset, getWallCurveFrameAt, getWallCurveLength, type WallNode } from '@aedifex/core'

/** Converts wall-local coordinates to the building render frame. */
export function wallLocalToWorld(
  wallNode: WallNode,
  localX: number,
  localY: number,
  levelYOffset = 0,
  supportElevation = 0,
  localZ = 0,
): [number, number, number] {
  const wallLength = getWallCurveLength(wallNode)
  const frame = getWallCurveFrameAt(wallNode, wallLength > 1e-6 ? localX / wallLength : 0)
  const across = getWallBodyCenterOffset(wallNode) + localZ
  return [
    frame.point.x + frame.normal.x * across,
    supportElevation + (wallNode.supportOffset ?? 0) + localY + levelYOffset,
    frame.point.y + frame.normal.y * across,
  ]
}
