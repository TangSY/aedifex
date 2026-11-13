import type { AnyNode, AnyNodeId } from '@aedifex/core'
import type { WallHit } from '../shared/wall-attach-target'
import {
  cabinetWallFrameAtLocalX,
  findClosestCabinetWallInPlan,
  resolveCabinetWallFaceOffset,
} from './wall-snap'

type Graph = Record<AnyNodeId, AnyNode>
type CabinetOnWall = {
  hit: WallHit
  levelId: AnyNodeId
  nodes: Graph
  width: number
  depth: number
  position: readonly [number, number, number]
}

export function findCabinetReferenceWall({
  nodes,
  levelId,
  wallId,
  position,
  yaw,
}: {
  nodes: Graph
  levelId: AnyNodeId
  wallId: AnyNodeId
  position: readonly [number, number, number]
  yaw: number
}): WallHit | null {
  const wall = nodes[wallId]
  if (wall?.type !== 'wall' || wall.parentId !== levelId) return null
  const hit = findClosestCabinetWallInPlan({
    nodes,
    parentLevelId: levelId,
    excludeIds: Object.values(nodes)
      .filter((node) => node.type === 'wall' && node.id !== wallId)
      .map((node) => node.id as AnyNodeId),
    planPoint: [position[0], position[2]],
    maxDistance: Infinity,
  })
  if (!hit || hit.wall.id !== wallId) return null
  const front = Math.sin(yaw) * -hit.dirY + Math.cos(yaw) * hit.dirX >= 0
  return { ...hit, side: front ? 'front' : 'back', itemRotation: front ? 0 : Math.PI }
}

export function cabinetWallCoordinates({
  hit,
  levelId,
  nodes,
  width,
  depth,
  position,
}: CabinetOnWall) {
  const frame = cabinetWallFrameAtLocalX(hit, hit.localX)
  const sign = hit.side === 'front' ? 1 : -1
  const face = resolveCabinetWallFaceOffset({ hit, nodes, parentLevelId: levelId })
  const away =
    ((position[0] - frame.point.x) * frame.normal.x +
      (position[2] - frame.point.y) * frame.normal.y) *
    sign
  return {
    distance: Math.max(0, Math.min(Math.max(0, hit.wallLength - width), hit.localX - width / 2)),
    offset: away - face * sign - depth / 2,
  }
}

export function resolveCabinetCoordinates({
  hit,
  levelId,
  nodes,
  width,
  depth,
  position,
  distance,
  offset,
}: CabinetOnWall & { distance: number; offset: number }): {
  position: [number, number, number]
  wallLocalX: number
  yaw: number
} | null {
  const limit = Math.max(0, hit.wallLength - width)
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(offset) ||
    distance < -1e-4 ||
    distance > limit + 1e-4
  )
    return null
  const station =
    hit.wallLength <= width
      ? hit.wallLength / 2
      : Math.min(limit, Math.max(0, distance)) + width / 2
  const frame = cabinetWallFrameAtLocalX(hit, station)
  const face = resolveCabinetWallFaceOffset({
    hit: { ...hit, localX: station },
    nodes,
    parentLevelId: levelId,
  })
  const sign = hit.side === 'front' ? 1 : -1
  const normalOffset = face + sign * (depth / 2 + offset)
  return {
    position: [
      frame.point.x + frame.normal.x * normalOffset,
      position[1],
      frame.point.y + frame.normal.y * normalOffset,
    ],
    wallLocalX: station,
    yaw: Math.atan2(frame.normal.x * sign, frame.normal.y * sign),
  }
}
