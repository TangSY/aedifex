import {
  type AnyNodeId,
  type DoorNode,
  getScaledDimensions,
  type ItemNode,
  useScene,
  type WallNode,
  type WindowNode,
} from '@aedifex/core'

/**
 * Converts wall-local coordinates to world coordinates.
 */
export function wallLocalToWorld(
  wallNode: WallNode,
  localX: number,
  localY: number,
  levelYOffset = 0,
  slabElevation = 0,
): [number, number, number] {
  const wallAngle = Math.atan2(
    wallNode.end[1] - wallNode.start[1],
    wallNode.end[0] - wallNode.start[0],
  )
  return [
    wallNode.start[0] + localX * Math.cos(wallAngle),
    slabElevation + (wallNode.supportOffset ?? 0) + localY + levelYOffset,
    wallNode.start[1] + localX * Math.sin(wallAngle),
  ]
}

/**
 * Clamp a door center so its full dimensions stay inside a wall.
 */
export function clampToWall(
  wallNode: WallNode,
  localX: number,
  width: number,
  height: number,
): { clampedX: number; clampedY: number } {
  const dx = wallNode.end[0] - wallNode.start[0]
  const dz = wallNode.end[1] - wallNode.start[1]
  const wallLength = Math.sqrt(dx * dx + dz * dz)

  return {
    clampedX: Math.max(width / 2, Math.min(wallLength - width / 2, localX)),
    clampedY: height / 2,
  }
}

/**
 * Check a proposed door rectangle against wall-attached children.
 */
export function hasWallChildOverlap(
  wallId: string,
  clampedX: number,
  clampedY: number,
  width: number,
  height: number,
  ignoreId?: string,
  pendingRemovalIds?: ReadonlySet<string> | string[],
): boolean {
  const nodes = useScene.getState().nodes
  const wallNode = nodes[wallId as AnyNodeId] as WallNode | undefined
  if (!wallNode) return true

  const halfW = width / 2
  const halfH = height / 2
  const newBottom = clampedY - halfH
  const newTop = clampedY + halfH
  const newLeft = clampedX - halfW
  const newRight = clampedX + halfW
  const removalSet =
    pendingRemovalIds instanceof Set
      ? pendingRemovalIds
      : Array.isArray(pendingRemovalIds)
        ? new Set(pendingRemovalIds)
        : null

  for (const childId of Array.isArray(wallNode.children) ? wallNode.children : []) {
    if (childId === ignoreId || removalSet?.has(childId)) continue
    const child = nodes[childId as AnyNodeId]
    if (!child) continue

    let childLeft: number
    let childRight: number
    let childBottom: number
    let childTop: number

    if (child.type === 'item') {
      const item = child as ItemNode
      if (item.asset.attachTo !== 'wall' && item.asset.attachTo !== 'wall-side') continue
      const [childWidth, childHeight] = getScaledDimensions(item)
      childLeft = item.position[0] - childWidth / 2
      childRight = item.position[0] + childWidth / 2
      childBottom = item.position[1]
      childTop = item.position[1] + childHeight
    } else if (child.type === 'window') {
      const windowNode = child as WindowNode
      childLeft = windowNode.position[0] - windowNode.width / 2
      childRight = windowNode.position[0] + windowNode.width / 2
      childBottom = windowNode.position[1] - windowNode.height / 2
      childTop = windowNode.position[1] + windowNode.height / 2
    } else if (child.type === 'door') {
      const doorNode = child as DoorNode
      childLeft = doorNode.position[0] - doorNode.width / 2
      childRight = doorNode.position[0] + doorNode.width / 2
      childBottom = doorNode.position[1] - doorNode.height / 2
      childTop = doorNode.position[1] + doorNode.height / 2
    } else {
      continue
    }

    const xOverlap = newLeft < childRight && newRight > childLeft
    const yOverlap = newBottom < childTop && newTop > childBottom
    if (xOverlap && yOverlap) return true
  }

  return false
}
