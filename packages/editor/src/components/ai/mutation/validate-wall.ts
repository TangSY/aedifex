import {
  type AnyNodeId,
  type WallNode,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import type {
  AddWallToolCall,
  RemoveNodeToolCall,
  UpdateWallToolCall,
  ValidatedAddWall,
  ValidatedRemoveNode,
  ValidatedUpdateWall,
} from '../types'
import { computeCollinearOverlap, wallsCrossThrough } from './collision-detection'
import { getLevelHeightContext, getWallsForLevel } from './spatial-queries'

// ============================================================================
// Wall Validators
// ============================================================================

/** Minimum wall length in meters */
const MIN_WALL_LENGTH = 0.5

export function validateAddWall(call: AddWallToolCall, wallCache?: Map<string, WallNode[]>): ValidatedAddWall {
  const start = [...call.start] as [number, number]
  const end = [...call.end] as [number, number]
  const thickness = call.thickness ?? 0.2

  // If height not specified, inherit from existing walls on this level.
  // Prevents mismatched wall heights (e.g., outer walls 3m, partition wall defaulting to 2.8m).
  let height = call.height
  if (height === undefined) {
    const levelId = useViewer.getState().selection.levelId
    if (levelId) {
      const existingWalls = getWallsForLevel(levelId, wallCache)
      if (existingWalls.length > 0) {
        // Use the most common wall height (mode), fallback to max
        const heights = existingWalls.map((w) => w.height ?? 2.5)
        const freq = new Map<number, number>()
        for (const h of heights) {
          freq.set(h, (freq.get(h) ?? 0) + 1)
        }
        let modeHeight = heights[0]!
        let maxFreq = 0
        for (const [h, count] of freq) {
          if (count > maxFreq) {
            maxFreq = count
            modeHeight = h
          }
        }
        height = modeHeight
      }
    }
  }

  // Snap to grid (0.5m)
  const snappedStart: [number, number] = [
    Math.round(start[0] / 0.5) * 0.5,
    Math.round(start[1] / 0.5) * 0.5,
  ]
  const snappedEnd: [number, number] = [
    Math.round(end[0] / 0.5) * 0.5,
    Math.round(end[1] / 0.5) * 0.5,
  ]

  // Check minimum length
  const dx = snappedEnd[0] - snappedStart[0]
  const dz = snappedEnd[1] - snappedStart[1]
  const length = Math.hypot(dx, dz)

  if (length < MIN_WALL_LENGTH) {
    return {
      type: 'add_wall',
      status: 'invalid',
      start: snappedStart,
      end: snappedEnd,
      thickness,
      height,
      errorReason: `Wall too short (${length.toFixed(2)}m). Minimum length is ${MIN_WALL_LENGTH}m.`,
    }
  }

  // Check for duplicate or overlapping walls
  const levelId = useViewer.getState().selection.levelId
  if (levelId) {
    const existingWalls = getWallsForLevel(levelId, wallCache)
    const DUPLICATE_TOLERANCE = 0.3 // meters

    for (const w of existingWalls) {
      // Check 1: Exact duplicate (same start/end within tolerance, either direction)
      const matchForward =
        Math.hypot(w.start[0] - snappedStart[0], w.start[1] - snappedStart[1]) < DUPLICATE_TOLERANCE &&
        Math.hypot(w.end[0] - snappedEnd[0], w.end[1] - snappedEnd[1]) < DUPLICATE_TOLERANCE
      const matchReverse =
        Math.hypot(w.start[0] - snappedEnd[0], w.start[1] - snappedEnd[1]) < DUPLICATE_TOLERANCE &&
        Math.hypot(w.end[0] - snappedStart[0], w.end[1] - snappedStart[1]) < DUPLICATE_TOLERANCE
      if (matchForward || matchReverse) {
        return {
          type: 'add_wall',
          status: 'invalid',
          start: snappedStart,
          end: snappedEnd,
          thickness,
          height,
          errorReason: `A wall already exists at this location ([${snappedStart}] → [${snappedEnd}]). Use wall ID "${w.id}" to reference it.`,
        }
      }

      // Check 2: Collinear overlap — new wall shares significant segment with existing wall
      const overlap = computeCollinearOverlap(
        snappedStart, snappedEnd,
        w.start as [number, number], w.end as [number, number],
      )
      if (overlap > 0.4) {
        // >0.4m overlap on a collinear wall = redundant
        return {
          type: 'add_wall',
          status: 'invalid',
          start: snappedStart,
          end: snappedEnd,
          thickness,
          height,
          errorReason: `New wall overlaps ${overlap.toFixed(1)}m with existing wall "${w.id}" ([${w.start}] → [${w.end}]). Use the existing wall instead.`,
        }
      }

      // Check 3: Non-collinear crossing — walls intersect at non-endpoint positions.
      // Allowed: T-junctions (new wall endpoint touches existing wall).
      // Blocked: walls that cross THROUGH each other mid-segment.
      const crossing = wallsCrossThrough(
        snappedStart, snappedEnd,
        w.start as [number, number], w.end as [number, number],
      )
      if (crossing) {
        return {
          type: 'add_wall',
          status: 'invalid',
          start: snappedStart,
          end: snappedEnd,
          thickness,
          height,
          errorReason: `New wall crosses through existing wall "${w.id}" ([${w.start}] → [${w.end}]). ` +
            `To extend a room, first remove the shared wall segment with remove_node, then add new walls that connect cleanly at endpoints.`,
        }
      }
    }
  }

  const wasAdjusted = snappedStart[0] !== start[0] || snappedStart[1] !== start[1]
    || snappedEnd[0] !== end[0] || snappedEnd[1] !== end[1]

  return {
    type: 'add_wall',
    status: wasAdjusted ? 'adjusted' : 'valid',
    start: snappedStart,
    end: snappedEnd,
    thickness,
    height,
    adjustmentReason: wasAdjusted ? 'Snapped to 0.5m grid.' : undefined,
  }
}

export function validateUpdateWall(call: UpdateWallToolCall, _wallCache?: Map<string, WallNode[]>): ValidatedUpdateWall {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return {
      type: 'update_wall',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      errorReason: `Wall "${call.nodeId}" not found in scene.`,
    }
  }

  if (node.type !== 'wall') {
    return {
      type: 'update_wall',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      errorReason: `Node "${call.nodeId}" is a ${node.type}, not a wall.`,
    }
  }

  if (!call.height && !call.thickness && !call.start && !call.end) {
    return {
      type: 'update_wall',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      errorReason: 'No properties to update. Provide height, thickness, start, and/or end.',
    }
  }

  // Snap start/end to grid if provided
  let start: [number, number] | undefined
  let end: [number, number] | undefined
  let adjustmentReason: string | undefined

  if (call.start) {
    start = [
      Math.round(call.start[0] / 0.5) * 0.5,
      Math.round(call.start[1] / 0.5) * 0.5,
    ]
    if (start[0] !== call.start[0] || start[1] !== call.start[1]) {
      adjustmentReason = 'Start point snapped to 0.5m grid.'
    }
  }

  if (call.end) {
    end = [
      Math.round(call.end[0] / 0.5) * 0.5,
      Math.round(call.end[1] / 0.5) * 0.5,
    ]
    if (end[0] !== call.end[0] || end[1] !== call.end[1]) {
      adjustmentReason = adjustmentReason
        ? `${adjustmentReason} End point snapped to 0.5m grid.`
        : 'End point snapped to 0.5m grid.'
    }
  }

  // Height change: warn if lowering below existing ceiling or tall items
  if (call.height) {
    const wallLevelId = useViewer.getState().selection.levelId
    if (wallLevelId) {
      const hCtx = getLevelHeightContext(wallLevelId)
      if (hCtx.tallestItemHeight > call.height) {
        adjustmentReason = adjustmentReason
          ? `${adjustmentReason} Warning: existing items reach ${hCtx.tallestItemHeight.toFixed(1)}m, new wall height is ${call.height}m.`
          : `Warning: existing items reach ${hCtx.tallestItemHeight.toFixed(1)}m, new wall height is ${call.height}m.`
      }
    }
  }

  return {
    type: 'update_wall',
    status: adjustmentReason ? 'adjusted' : 'valid',
    nodeId: call.nodeId as AnyNodeId,
    height: call.height,
    thickness: call.thickness,
    start,
    end,
    adjustmentReason,
  }
}

export function validateRemoveNode(call: RemoveNodeToolCall): ValidatedRemoveNode {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return {
      type: 'remove_node',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      nodeType: 'unknown',
      errorReason: `Node "${call.nodeId}" not found in scene.`,
    }
  }

  // Allow removing all user-created node types
  const removableTypes = new Set([
    'wall', 'door', 'window', 'item',
    'level', 'slab', 'ceiling', 'roof', 'roof-segment',
    'zone', 'scan', 'guide', 'building',
  ])
  if (!removableTypes.has(node.type)) {
    return {
      type: 'remove_node',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      nodeType: node.type,
      errorReason: `Cannot remove ${node.type} nodes.`,
    }
  }

  return {
    type: 'remove_node',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    nodeType: node.type,
  }
}

// ============================================================================
// Junction Helpers
// ============================================================================

/**
 * Find positions along a wall where perpendicular walls connect (T-junctions).
 * Returns an array of { position: number, thickness: number } where position
 * is the distance along the wall and thickness is the perpendicular wall's thickness.
 */
export function findJunctionPositions(
  wallNode: WallNode,
  levelId: string,
): { position: number; thickness: number }[] {
  const { nodes } = useScene.getState()
  const junctions: { position: number; thickness: number }[] = []

  const dx = wallNode.end[0] - wallNode.start[0]
  const dz = wallNode.end[1] - wallNode.start[1]
  const wallLen = Math.hypot(dx, dz)
  if (wallLen < 0.01) return junctions

  const walls = getWallsForLevel(levelId)

  for (const other of walls) {
    if (other.id === wallNode.id) continue

    // Check if either endpoint of the other wall lies on this wall
    for (const ep of [other.start, other.end]) {
      // Project endpoint onto wallNode's line
      const t = ((ep[0] - wallNode.start[0]) * dx + (ep[1] - wallNode.start[1]) * dz) / (wallLen * wallLen)
      if (t < 0.01 || t > 0.99) continue // Skip wall endpoints (corners, not T-junctions)

      const projX = wallNode.start[0] + t * dx
      const projZ = wallNode.start[1] + t * dz
      const dist = Math.hypot(ep[0] - projX, ep[1] - projZ)

      if (dist < 0.5) {
        // This endpoint connects to our wall — it's a T-junction
        junctions.push({
          position: t * wallLen,
          thickness: other.thickness ?? 0.2,
        })
      }
    }
  }

  return junctions
}

/**
 * Check if a position conflicts with any junction.
 */
function hasJunctionConflict(
  pos: number,
  halfWidth: number,
  junctions: { position: number; thickness: number }[],
): boolean {
  return junctions.some((junc) => {
    const minDist = halfWidth + junc.thickness / 2 + 0.05
    return Math.abs(pos - junc.position) < minDist
  })
}

/**
 * Adjust a door/window position to avoid T-junction conflicts.
 * Returns the adjusted position and whether adjustment was needed.
 */
export function avoidJunctions(
  position: number,
  halfWidth: number,
  wallLength: number,
  junctions: { position: number; thickness: number }[],
): { adjustedPosition: number; wasAdjusted: boolean; reason?: string } {
  if (junctions.length === 0) return { adjustedPosition: position, wasAdjusted: false }

  // No conflict at current position
  if (!hasJunctionConflict(position, halfWidth, junctions)) {
    return { adjustedPosition: position, wasAdjusted: false }
  }

  // Collect all "forbidden zones" (junction ± clearance) along the wall
  const forbidden = junctions.map((junc) => {
    const clearance = halfWidth + junc.thickness / 2 + 0.05
    return { min: junc.position - clearance, max: junc.position + clearance }
  }).sort((a, b) => a.min - b.min)

  // Find valid candidate positions: edges of each forbidden zone
  const candidates: number[] = []
  for (const zone of forbidden) {
    candidates.push(zone.min) // just before forbidden zone
    candidates.push(zone.max) // just after forbidden zone
  }

  // Filter candidates: must be within wall bounds AND not in any forbidden zone
  const validCandidates = candidates.filter((c) => {
    if (c < halfWidth || c > wallLength - halfWidth) return false
    return !hasJunctionConflict(c, halfWidth, junctions)
  })

  if (validCandidates.length === 0) {
    // No valid position found — return original (will fail at overlap check or be invalid)
    return {
      adjustedPosition: position,
      wasAdjusted: false,
      reason: 'No valid position available — wall is blocked by perpendicular walls.',
    }
  }

  // Pick the valid position closest to the original
  validCandidates.sort((a, b) => Math.abs(a - position) - Math.abs(b - position))
  const best = validCandidates[0]!

  return {
    adjustedPosition: best,
    wasAdjusted: true,
    reason: `Shifted to avoid perpendicular wall(s).`,
  }
}
