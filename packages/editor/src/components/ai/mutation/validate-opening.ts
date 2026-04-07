import {
  type AnyNodeId,
  type DoorNode,
  type WallNode,
  type WindowNode,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { clampToWall, hasWallChildOverlap } from '../../tools/door/door-math'
import type {
  AddDoorToolCall,
  AddWindowToolCall,
  UpdateDoorToolCall,
  UpdateWindowToolCall,
  ValidatedAddDoor,
  ValidatedAddWindow,
  ValidatedUpdateDoor,
  ValidatedUpdateWindow,
} from '../types'
import { avoidJunctions, findJunctionPositions } from './validate-wall'

// ============================================================================
// Door / Window Validators
// ============================================================================

export function validateAddDoor(call: AddDoorToolCall, _wallCache?: Map<string, WallNode[]>, pendingRemovalIds?: Set<string>): ValidatedAddDoor {
  const { nodes } = useScene.getState()
  const wallNode = nodes[call.wallId as AnyNodeId] as WallNode | undefined

  if (!wallNode || wallNode.type !== 'wall') {
    return {
      type: 'add_door',
      status: 'invalid',
      wallId: call.wallId as AnyNodeId,
      localX: 0,
      localY: 0,
      width: call.width ?? 0.9,
      height: call.height ?? 2.1,
      hingesSide: call.hingesSide ?? 'left',
      swingDirection: call.swingDirection ?? 'inward',
      side: call.side,
      errorReason: `Wall "${call.wallId}" not found.`,
    }
  }

  const width = call.width ?? 0.9
  const height = call.height ?? 2.1

  // Clamp position to wall bounds
  const { clampedX, clampedY } = clampToWall(wallNode, call.positionAlongWall, width, height)

  // Avoid T-junction conflicts (perpendicular walls)
  const levelId = useViewer.getState().selection.levelId
  let finalX = clampedX
  let junctionAdjusted = false
  let junctionReason: string | undefined
  if (levelId) {
    const wallDx = wallNode.end[0] - wallNode.start[0]
    const wallDz = wallNode.end[1] - wallNode.start[1]
    const wallLength = Math.hypot(wallDx, wallDz)
    const junctions = findJunctionPositions(wallNode, levelId)
    const result = avoidJunctions(finalX, width / 2, wallLength, junctions)
    finalX = result.adjustedPosition
    junctionAdjusted = result.wasAdjusted
    junctionReason = result.reason
  }

  // Check overlap with existing wall children (skip nodes pending removal in this batch)
  if (hasWallChildOverlap(call.wallId, finalX, clampedY, width, height, undefined, pendingRemovalIds)) {
    return {
      type: 'add_door',
      status: 'invalid',
      wallId: call.wallId as AnyNodeId,
      localX: finalX,
      localY: clampedY,
      width,
      height,
      hingesSide: call.hingesSide ?? 'left',
      swingDirection: call.swingDirection ?? 'inward',
      side: call.side,
      errorReason: 'Position overlaps with existing door/window on this wall.',
    }
  }

  const wasAdjusted = Math.abs(finalX - call.positionAlongWall) > 0.01 || junctionAdjusted
  const reasons = [
    Math.abs(clampedX - call.positionAlongWall) > 0.01 ? 'Position clamped to wall bounds.' : undefined,
    junctionReason,
  ].filter(Boolean).join(' ')

  return {
    type: 'add_door',
    status: wasAdjusted ? 'adjusted' : 'valid',
    wallId: call.wallId as AnyNodeId,
    localX: finalX,
    localY: clampedY,
    width,
    height,
    side: call.side,
    hingesSide: call.hingesSide ?? 'left',
    swingDirection: call.swingDirection ?? 'inward',
    adjustmentReason: wasAdjusted ? reasons : undefined,
  }
}

export function validateAddWindow(call: AddWindowToolCall, _wallCache?: Map<string, WallNode[]>, pendingRemovalIds?: Set<string>): ValidatedAddWindow {
  const { nodes } = useScene.getState()
  const wallNode = nodes[call.wallId as AnyNodeId] as WallNode | undefined

  if (!wallNode || wallNode.type !== 'wall') {
    return {
      type: 'add_window',
      status: 'invalid',
      wallId: call.wallId as AnyNodeId,
      localX: 0,
      localY: 0,
      width: call.width ?? 1.5,
      height: call.height ?? 1.5,
      side: call.side,
      errorReason: `Wall "${call.wallId}" not found.`,
    }
  }

  const width = call.width ?? 1.5
  const height = call.height ?? 1.5
  const wallHeight = wallNode.height ?? 2.8

  // Compute wall length
  const dx = wallNode.end[0] - wallNode.start[0]
  const dz = wallNode.end[1] - wallNode.start[1]
  const wallLength = Math.hypot(dx, dz)

  // Clamp X to wall bounds
  const clampedX = Math.max(width / 2, Math.min(wallLength - width / 2, call.positionAlongWall))

  // Default window center height: 1.2m from floor (center of standard window)
  const defaultCenterY = call.heightFromFloor ?? 1.2
  // Clamp Y to wall bounds
  const clampedY = Math.max(height / 2, Math.min(wallHeight - height / 2, defaultCenterY))

  // Avoid T-junction conflicts (perpendicular walls)
  const winLevelId = useViewer.getState().selection.levelId
  let finalWinX = clampedX
  let winJunctionAdjusted = false
  let winJunctionReason: string | undefined
  if (winLevelId) {
    const junctions = findJunctionPositions(wallNode, winLevelId)
    const jResult = avoidJunctions(finalWinX, width / 2, wallLength, junctions)
    finalWinX = jResult.adjustedPosition
    winJunctionAdjusted = jResult.wasAdjusted
    winJunctionReason = jResult.reason
  }

  // Check overlap with existing wall children (skip nodes pending removal in this batch)
  if (hasWallChildOverlap(call.wallId, finalWinX, clampedY, width, height, undefined, pendingRemovalIds)) {
    return {
      type: 'add_window',
      status: 'invalid',
      wallId: call.wallId as AnyNodeId,
      localX: finalWinX,
      localY: clampedY,
      width,
      height,
      side: call.side,
      errorReason: 'Position overlaps with existing door/window on this wall.',
    }
  }

  const wasAdjusted = Math.abs(finalWinX - call.positionAlongWall) > 0.01
    || (call.heightFromFloor !== undefined && Math.abs(clampedY - call.heightFromFloor) > 0.01)
    || winJunctionAdjusted
  const winReasons = [
    Math.abs(clampedX - call.positionAlongWall) > 0.01 ? 'Position clamped to wall bounds.' : undefined,
    winJunctionReason,
  ].filter(Boolean).join(' ')

  return {
    type: 'add_window',
    status: wasAdjusted ? 'adjusted' : 'valid',
    wallId: call.wallId as AnyNodeId,
    localX: finalWinX,
    localY: clampedY,
    width,
    height,
    side: call.side,
    adjustmentReason: wasAdjusted ? (winReasons || 'Position adjusted.') : undefined,
  }
}

export function validateUpdateDoor(call: UpdateDoorToolCall): ValidatedUpdateDoor {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_door', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Door "${call.nodeId}" not found.` }
  }
  if (node.type !== 'door') {
    return { type: 'update_door', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a door.` }
  }

  // If positionAlongWall is provided, clamp it to parent wall bounds
  let localX: number | undefined
  if (call.positionAlongWall !== undefined && node.parentId) {
    const parentWall = nodes[node.parentId as AnyNodeId]
    if (parentWall && parentWall.type === 'wall') {
      const w = parentWall as WallNode
      const wallLen = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
      const doorWidth = call.width ?? (node as DoorNode).width ?? 0.9
      localX = Math.max(doorWidth / 2, Math.min(wallLen - doorWidth / 2, call.positionAlongWall))
    }
  }

  return {
    type: 'update_door',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    width: call.width,
    height: call.height,
    localX,
    side: call.side,
    hingesSide: call.hingesSide,
    swingDirection: call.swingDirection,
  }
}

export function validateUpdateWindow(call: UpdateWindowToolCall): ValidatedUpdateWindow {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_window', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Window "${call.nodeId}" not found.` }
  }
  if (node.type !== 'window') {
    return { type: 'update_window', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a window.` }
  }

  let localX: number | undefined
  if (call.positionAlongWall !== undefined && node.parentId) {
    const parentWall = nodes[node.parentId as AnyNodeId]
    if (parentWall && parentWall.type === 'wall') {
      const w = parentWall as WallNode
      const wallLen = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
      const winWidth = call.width ?? (node as WindowNode).width ?? 1.5
      localX = Math.max(winWidth / 2, Math.min(wallLen - winWidth / 2, call.positionAlongWall))
    }
  }

  return {
    type: 'update_window',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    width: call.width,
    height: call.height,
    localX,
    localY: call.heightFromFloor,
    side: call.side,
  }
}
