import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  type WallNode,
  spatialGridManager,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { resolveCatalogSlug } from './ai-catalog-resolver'
import { optimizeLayout } from './ai-layout-optimizer'
import type {
  AIToolCall,
  AddItemToolCall,
  MoveItemToolCall,
  RemoveItemToolCall,
  ToolResult,
  UpdateMaterialToolCall,
  ValidatedAddItem,
  ValidatedMoveItem,
  ValidatedOperation,
  ValidatedRemoveItem,
  ValidatedUpdateMaterial,
} from './types'

// ============================================================================
// Mutation Executor
// Pure validation + resolution layer. Returns ValidatedOperation[].
// Does NOT touch scene state — that's the preview manager's job.
// ============================================================================

/**
 * Validate and resolve a single AI tool call into a ValidatedOperation.
 */
export function validateToolCall(toolCall: AIToolCall): ValidatedOperation[] {
  switch (toolCall.tool) {
    case 'add_item':
      return [validateAddItem(toolCall)]
    case 'remove_item':
      return [validateRemoveItem(toolCall)]
    case 'move_item':
      return [validateMoveItem(toolCall)]
    case 'update_material':
      return [validateUpdateMaterial(toolCall)]
    case 'batch_operations':
      return toolCall.operations.flatMap((op) => {
        // Reconstruct full tool call with tool field
        const opRecord = op as Record<string, unknown>
        const fullOp = { ...opRecord, tool: opRecord.type ?? guessToolType(opRecord) } as AIToolCall
        return validateToolCall(fullOp)
      })
    case 'propose_placement':
    case 'ask_user':
    case 'confirm_preview':
    case 'reject_preview':
      // Non-mutation tools — handled separately by the agent loop
      return []
    default:
      return []
  }
}

/**
 * Validate and resolve all tool calls from a message.
 * After validation, runs the layout optimizer for post-correction.
 */
export function validateAllToolCalls(toolCalls: AIToolCall[]): ValidatedOperation[] {
  const validated = toolCalls.flatMap(validateToolCall)
  return optimizeLayout(validated)
}

/**
 * Build a structured ToolResult from validated operations.
 * This result is fed back to the LLM so it can iterate on its decisions.
 */
export function buildToolResult(
  toolName: string,
  operations: ValidatedOperation[],
): ToolResult {
  const validCount = operations.filter((op) => op.status === 'valid').length
  const adjustedCount = operations.filter((op) => op.status === 'adjusted').length
  const invalidCount = operations.filter((op) => op.status === 'invalid').length

  const adjustments: string[] = []
  const errors: string[] = []

  for (const op of operations) {
    if (op.status === 'adjusted') {
      const reason = 'adjustmentReason' in op ? op.adjustmentReason : undefined
      if (reason) adjustments.push(`${op.type}: ${reason}`)
    }
    if (op.status === 'invalid') {
      const reason = 'errorReason' in op ? op.errorReason : undefined
      if (reason) errors.push(`${op.type}: ${reason}`)
    }
  }

  const success = invalidCount === 0
  const parts: string[] = []
  if (validCount > 0) parts.push(`${validCount} succeeded`)
  if (adjustedCount > 0) parts.push(`${adjustedCount} adjusted`)
  if (invalidCount > 0) parts.push(`${invalidCount} failed`)

  return {
    toolName,
    success,
    summary: `Executed ${operations.length} operations: ${parts.join(', ')}.${
      adjustments.length > 0 ? ` Adjustments: ${adjustments.join('; ')}` : ''
    }${errors.length > 0 ? ` Errors: ${errors.join('; ')}` : ''}`,
    details: {
      validCount,
      adjustedCount,
      invalidCount,
      adjustments,
      errors,
    },
  }
}

// ============================================================================
// Individual Validators
// ============================================================================

function validateAddItem(call: AddItemToolCall): ValidatedAddItem {
  // Resolve catalog slug to full asset
  const result = resolveCatalogSlug(call.catalogSlug)

  if (!result.asset) {
    return {
      type: 'add_item',
      status: 'invalid',
      asset: null as unknown as AssetInput,
      position: call.position,
      rotation: [0, call.rotationY, 0],
      errorReason: `Catalog item "${call.catalogSlug}" not found.${
        result.suggestions?.length
          ? ` Suggestions: ${result.suggestions.map((s) => s.id).join(', ')}`
          : ''
      }`,
    }
  }

  const asset = result.asset
  let position = [...call.position] as [number, number, number]
  const rotation: [number, number, number] = [0, call.rotationY, 0]
  let adjustmentReason: string | undefined

  // Skip collision detection for wall/ceiling items
  if (!asset.attachTo) {
    const levelId = useViewer.getState().selection.levelId
    if (levelId) {
      // Check floor collision
      const canPlace = spatialGridManager.canPlaceOnFloor(
        levelId,
        position,
        asset.dimensions ?? [1, 1, 1],
        rotation,
      )

      if (!canPlace.valid && canPlace.conflictIds.length > 0) {
        // Try to auto-offset the position
        const adjusted = tryAutoOffset(
          position,
          asset.dimensions ?? [1, 1, 1],
          rotation,
          levelId,
        )

        if (adjusted) {
          position = adjusted
          adjustmentReason = 'Position adjusted to avoid collision with existing items.'
        } else {
          return {
            type: 'add_item',
            status: 'adjusted',
            asset,
            position,
            rotation,
            adjustmentReason: 'Collision detected but could not auto-resolve. Placed at requested position.',
          }
        }
      }

      // Check wall clearance — push item away from walls if too close
      const wallAdj = adjustForWallClearance(
        position,
        asset.dimensions ?? [1, 1, 1],
        rotation,
        levelId,
      )
      if (wallAdj) {
        position = wallAdj.position
        adjustmentReason = adjustmentReason
          ? `${adjustmentReason} ${wallAdj.reason}`
          : wallAdj.reason
      }

      // Apply slab elevation
      const elevation = spatialGridManager.getSlabElevationForItem(
        levelId,
        position,
        asset.dimensions ?? [1, 1, 1],
        rotation,
      )
      if (elevation > 0) {
        position[1] = elevation
      }
    }
  }

  return {
    type: 'add_item',
    status: adjustmentReason ? 'adjusted' : 'valid',
    asset,
    position,
    rotation,
    adjustmentReason,
  }
}

function validateRemoveItem(call: RemoveItemToolCall): ValidatedRemoveItem {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return {
      type: 'remove_item',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      errorReason: `Node "${call.nodeId}" not found in scene.`,
    }
  }

  if (node.type !== 'item') {
    return {
      type: 'remove_item',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      errorReason: `Node "${call.nodeId}" is a ${node.type}, not an item. Only items can be removed by AI.`,
    }
  }

  return {
    type: 'remove_item',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
  }
}

function validateMoveItem(call: MoveItemToolCall): ValidatedMoveItem {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return {
      type: 'move_item',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      position: call.position,
      rotation: [0, call.rotationY ?? 0, 0],
      errorReason: `Node "${call.nodeId}" not found in scene.`,
    }
  }

  if (node.type !== 'item') {
    return {
      type: 'move_item',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      position: call.position,
      rotation: [0, call.rotationY ?? 0, 0],
      errorReason: `Node "${call.nodeId}" is a ${node.type}, not an item.`,
    }
  }

  let position = [...call.position] as [number, number, number]
  const rotation: [number, number, number] = [0, call.rotationY ?? node.rotation[1], 0]
  let adjustmentReason: string | undefined

  // Floor collision check
  if (!node.asset.attachTo) {
    const levelId = useViewer.getState().selection.levelId
    if (levelId) {
      const canPlace = spatialGridManager.canPlaceOnFloor(
        levelId,
        position,
        node.asset.dimensions,
        rotation,
        [node.id], // Ignore self
      )

      if (!canPlace.valid) {
        const adjusted = tryAutoOffset(
          position,
          node.asset.dimensions,
          rotation,
          levelId,
          [node.id],
        )

        if (adjusted) {
          position = adjusted
          adjustmentReason = 'Position adjusted to avoid collision.'
        }
      }

      // Check wall clearance
      const wallAdj = adjustForWallClearance(
        position,
        node.asset.dimensions,
        rotation,
        levelId,
      )
      if (wallAdj) {
        position = wallAdj.position
        adjustmentReason = adjustmentReason
          ? `${adjustmentReason} ${wallAdj.reason}`
          : wallAdj.reason
      }

      // Apply slab elevation
      const elevation = spatialGridManager.getSlabElevationForItem(
        levelId,
        position,
        node.asset.dimensions,
        rotation,
      )
      if (elevation > 0) {
        position[1] = elevation
      }
    }
  }

  return {
    type: 'move_item',
    status: adjustmentReason ? 'adjusted' : 'valid',
    nodeId: call.nodeId as AnyNodeId,
    position,
    rotation,
    adjustmentReason,
  }
}

function validateUpdateMaterial(call: UpdateMaterialToolCall): ValidatedUpdateMaterial {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return {
      type: 'update_material',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      material: call.material,
      errorReason: `Node "${call.nodeId}" not found in scene.`,
    }
  }

  return {
    type: 'update_material',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    material: call.material,
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Try to find a nearby valid position by offsetting in cardinal directions.
 */
function tryAutoOffset(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
  ignoreIds?: string[],
): [number, number, number] | null {
  const [w, , d] = dimensions
  const offsets: [number, number][] = [
    [w, 0], [-w, 0], [0, d], [0, -d],
    [w * 0.5, d * 0.5], [-w * 0.5, d * 0.5],
    [w * 0.5, -d * 0.5], [-w * 0.5, -d * 0.5],
  ]

  for (const [dx, dz] of offsets) {
    const candidate: [number, number, number] = [
      position[0] + dx,
      position[1],
      position[2] + dz,
    ]

    const result = spatialGridManager.canPlaceOnFloor(
      levelId,
      candidate,
      dimensions,
      rotation,
      ignoreIds,
    )

    if (result.valid) {
      return candidate
    }
  }

  return null
}

/**
 * Guess tool type from operation object (for batch operations).
 */
function guessToolType(op: Record<string, unknown>): string {
  if ('catalogSlug' in op) return 'add_item'
  if ('material' in op) return 'update_material'
  if ('nodeId' in op && 'position' in op) return 'move_item'
  if ('nodeId' in op) return 'remove_item'
  return 'add_item'
}

// ============================================================================
// Wall & Zone Boundary Validation
// ============================================================================

/** Minimum clearance (meters) between item AABB edge and wall centerline. */
const WALL_CLEARANCE = 0.15

/**
 * Collect all WallNode instances belonging to a given level.
 */
function getWallsForLevel(levelId: string): WallNode[] {
  const { nodes } = useScene.getState()
  const walls: WallNode[] = []
  const visited = new Set<string>()
  const queue: string[] = [levelId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId as AnyNodeId] as AnyNode | undefined
    if (!node) continue

    if (node.type === 'wall') {
      walls.push(node as WallNode)
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const childId of node.children) {
        queue.push(childId as string)
      }
    }
  }
  return walls
}

/**
 * Compute the item's axis-aligned bounding box in the XZ plane.
 * Returns { minX, maxX, minZ, maxZ }.
 */
function getItemAABB(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const [x, , z] = position
  const [w, , d] = dimensions
  const yRot = rotation[1]
  const cos = Math.cos(yRot)
  const sin = Math.sin(yRot)
  const halfW = w / 2
  const halfD = d / 2

  // 4 corners of the rotated footprint
  const corners: [number, number][] = [
    [x + (-halfW * cos + halfD * sin), z + (-halfW * sin - halfD * cos)],
    [x + (halfW * cos + halfD * sin), z + (halfW * sin - halfD * cos)],
    [x + (halfW * cos - halfD * sin), z + (halfW * sin + halfD * cos)],
    [x + (-halfW * cos - halfD * sin), z + (-halfW * sin + halfD * cos)],
  ]

  const xs = corners.map((c) => c[0])
  const zs = corners.map((c) => c[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

/**
 * Minimum distance from a point to a line segment (in 2D XZ plane).
 */
function distPointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  if (lenSq === 0) return Math.hypot(px - ax, pz - az)

  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  const closestX = ax + t * dx
  const closestZ = az + t * dz
  return Math.hypot(px - closestX, pz - closestZ)
}

/**
 * Check if an item's AABB overlaps or is too close to any wall.
 * If so, push the item away from the nearest offending wall.
 * Returns the adjusted position, or null if no adjustment needed.
 */
function adjustForWallClearance(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
): { position: [number, number, number]; reason: string } | null {
  const walls = getWallsForLevel(levelId)
  if (walls.length === 0) return null

  let [px, py, pz] = position
  let adjusted = false
  const reasons: string[] = []

  // Check each wall and push item away if too close
  for (const wall of walls) {
    const thickness = wall.thickness ?? 0.2
    const halfThick = thickness / 2
    const minClearance = halfThick + WALL_CLEARANCE

    const aabb = getItemAABB([px, py, pz], dimensions, rotation)

    // Check all 4 AABB edge midpoints against the wall segment
    const testPoints: [number, number][] = [
      [(aabb.minX + aabb.maxX) / 2, aabb.minZ], // bottom edge center
      [(aabb.minX + aabb.maxX) / 2, aabb.maxZ], // top edge center
      [aabb.minX, (aabb.minZ + aabb.maxZ) / 2], // left edge center
      [aabb.maxX, (aabb.minZ + aabb.maxZ) / 2], // right edge center
      [aabb.minX, aabb.minZ], // corners
      [aabb.maxX, aabb.minZ],
      [aabb.minX, aabb.maxZ],
      [aabb.maxX, aabb.maxZ],
    ]

    // Compute wall normal direction (perpendicular to wall segment)
    const wallDx = wall.end[0] - wall.start[0]
    const wallDz = wall.end[1] - wall.start[1]
    const wallLen = Math.hypot(wallDx, wallDz)
    if (wallLen < 0.001) continue

    // Normal = wall direction rotated 90 degrees
    const normalX = -wallDz / wallLen
    const normalZ = wallDx / wallLen

    for (const [tx, tz] of testPoints) {
      const dist = distPointToSegment(
        tx, tz,
        wall.start[0], wall.start[1],
        wall.end[0], wall.end[1],
      )

      if (dist < minClearance) {
        // Determine which side of the wall the item center is on
        const toCenterX = px - wall.start[0]
        const toCenterZ = pz - wall.start[1]
        const side = Math.sign(toCenterX * normalX + toCenterZ * normalZ) || 1

        // Push along wall normal direction (toward the item's side)
        const pushDist = minClearance - dist + 0.05 // extra 5cm safety margin
        px += normalX * side * pushDist
        pz += normalZ * side * pushDist
        adjusted = true
        reasons.push(`Pushed away from wall to maintain ${WALL_CLEARANCE}m clearance`)
        break // Re-check with updated position on next wall
      }
    }
  }

  if (!adjusted) return null

  return {
    position: [px, py, pz],
    reason: reasons[0] ?? 'Position adjusted for wall clearance.',
  }
}
