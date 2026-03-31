import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  type WallNode,
  spatialGridManager,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { resolveCatalogSlug } from './ai-catalog-resolver'
import { clampToWall, hasWallChildOverlap } from '../tools/door/door-math'
import { optimizeLayout } from './ai-layout-optimizer'
import type {
  AIToolCall,
  AddDoorToolCall,
  AddItemToolCall,
  AddWallToolCall,
  AddWindowToolCall,
  MoveItemToolCall,
  RemoveItemToolCall,
  RemoveNodeToolCall,
  ToolResult,
  UpdateMaterialToolCall,
  ValidatedAddDoor,
  ValidatedAddItem,
  ValidatedAddWall,
  ValidatedAddWindow,
  ValidatedMoveItem,
  ValidatedOperation,
  ValidatedRemoveItem,
  ValidatedRemoveNode,
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
    case 'add_wall':
      return [validateAddWall(toolCall)]
    case 'add_door':
      return [validateAddDoor(toolCall)]
    case 'add_window':
      return [validateAddWindow(toolCall)]
    case 'remove_node':
      return [validateRemoveNode(toolCall)]
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
 * When createdNodeIds is provided, include them so the LLM can reference
 * newly created nodes (e.g., wall IDs for adding doors/windows).
 */
export function buildToolResult(
  toolName: string,
  operations: ValidatedOperation[],
  createdNodeIds?: AnyNodeId[],
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

  // Build created nodes summary for LLM reference
  let createdSummary = ''
  if (createdNodeIds && createdNodeIds.length > 0) {
    const { nodes } = useScene.getState()
    const nodeDescriptions = createdNodeIds.map((id) => {
      const node = nodes[id]
      if (!node) return `${id} (unknown)`
      if (node.type === 'wall') {
        const w = node as WallNode
        return `${id} (wall: [${w.start}] → [${w.end}])`
      }
      return `${id} (${node.type}: ${node.name})`
    })
    createdSummary = ` Created nodes: ${nodeDescriptions.join(', ')}.`
  }

  return {
    toolName,
    success,
    summary: `Executed ${operations.length} operations: ${parts.join(', ')}.${
      adjustments.length > 0 ? ` Adjustments: ${adjustments.join('; ')}` : ''
    }${errors.length > 0 ? ` Errors: ${errors.join('; ')}` : ''}${createdSummary}`,
    details: {
      validCount,
      adjustedCount,
      invalidCount,
      adjustments,
      errors,
      createdNodeIds: createdNodeIds ?? [],
    },
  }
}

// ============================================================================
// Individual Validators
// ============================================================================

function validateAddItem(call: AddItemToolCall): ValidatedAddItem {
  // Guard against undefined catalogSlug (can happen when batch_operations
  // guesses wrong tool type for an operation missing the 'type' field)
  if (!call.catalogSlug) {
    return {
      type: 'add_item',
      status: 'invalid',
      asset: null as unknown as AssetInput,
      position: call.position ?? [0, 0, 0],
      rotation: [0, call.rotationY ?? 0, 0],
      errorReason: 'Missing catalogSlug — cannot resolve catalog item.',
    }
  }

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

  // Reject wall-dependent items (windows, doors) if no walls exist in the scene
  if (asset.attachTo === 'wall') {
    const levelId = useViewer.getState().selection.levelId
    if (levelId) {
      const walls = getWallsForLevel(levelId)
      if (walls.length === 0) {
        return {
          type: 'add_item',
          status: 'invalid',
          asset,
          position,
          rotation,
          errorReason: `"${asset.name}" requires walls but no walls exist in the scene. The user must create walls first using the Wall tool (B key) before windows or doors can be installed.`,
        }
      }
    }
  }

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
  if ('start' in op && 'end' in op) return 'add_wall'
  if ('wallId' in op && 'positionAlongWall' in op) {
    // Distinguish door vs window by presence of door-specific fields
    if ('hingesSide' in op || 'swingDirection' in op) return 'add_door'
    if ('heightFromFloor' in op) return 'add_window'
    // Default: check for typical window height (> 0.5m from floor usually means window)
    return 'add_door'
  }
  if ('catalogSlug' in op) return 'add_item'
  if ('material' in op) return 'update_material'
  if ('nodeId' in op && 'position' in op) return 'move_item'
  if ('nodeId' in op) return 'remove_item'
  // Unknown operation type — return empty string so validateToolCall hits default branch
  // instead of incorrectly treating as add_item
  return ''
}

// ============================================================================
// Wall / Door / Window Validators
// ============================================================================

/** Minimum wall length in meters */
const MIN_WALL_LENGTH = 0.5

function validateAddWall(call: AddWallToolCall): ValidatedAddWall {
  const start = [...call.start] as [number, number]
  const end = [...call.end] as [number, number]
  const thickness = call.thickness ?? 0.2
  const height = call.height

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
    const existingWalls = getWallsForLevel(levelId)
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

function validateAddDoor(call: AddDoorToolCall): ValidatedAddDoor {
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

  // Check overlap with existing wall children
  if (hasWallChildOverlap(call.wallId, clampedX, clampedY, width, height)) {
    return {
      type: 'add_door',
      status: 'invalid',
      wallId: call.wallId as AnyNodeId,
      localX: clampedX,
      localY: clampedY,
      width,
      height,
      hingesSide: call.hingesSide ?? 'left',
      swingDirection: call.swingDirection ?? 'inward',
      side: call.side,
      errorReason: 'Position overlaps with existing door/window on this wall.',
    }
  }

  const wasAdjusted = Math.abs(clampedX - call.positionAlongWall) > 0.01

  return {
    type: 'add_door',
    status: wasAdjusted ? 'adjusted' : 'valid',
    wallId: call.wallId as AnyNodeId,
    localX: clampedX,
    localY: clampedY,
    width,
    height,
    side: call.side,
    hingesSide: call.hingesSide ?? 'left',
    swingDirection: call.swingDirection ?? 'inward',
    adjustmentReason: wasAdjusted ? 'Position clamped to wall bounds.' : undefined,
  }
}

function validateAddWindow(call: AddWindowToolCall): ValidatedAddWindow {
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

  // Check overlap with existing wall children
  if (hasWallChildOverlap(call.wallId, clampedX, clampedY, width, height)) {
    return {
      type: 'add_window',
      status: 'invalid',
      wallId: call.wallId as AnyNodeId,
      localX: clampedX,
      localY: clampedY,
      width,
      height,
      side: call.side,
      errorReason: 'Position overlaps with existing door/window on this wall.',
    }
  }

  const wasAdjusted = Math.abs(clampedX - call.positionAlongWall) > 0.01
    || (call.heightFromFloor !== undefined && Math.abs(clampedY - call.heightFromFloor) > 0.01)

  return {
    type: 'add_window',
    status: wasAdjusted ? 'adjusted' : 'valid',
    wallId: call.wallId as AnyNodeId,
    localX: clampedX,
    localY: clampedY,
    width,
    height,
    side: call.side,
    adjustmentReason: wasAdjusted ? 'Position clamped to wall bounds.' : undefined,
  }
}

function validateRemoveNode(call: RemoveNodeToolCall): ValidatedRemoveNode {
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

  // Only allow removing walls, doors, windows, and items
  const removableTypes = new Set(['wall', 'door', 'window', 'item'])
  if (!removableTypes.has(node.type)) {
    return {
      type: 'remove_node',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      nodeType: node.type,
      errorReason: `Cannot remove ${node.type} nodes. Only walls, doors, windows, and items can be removed.`,
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
// Wall & Zone Boundary Validation
// ============================================================================

/**
 * Compute how much two wall segments overlap if they are nearly collinear.
 * Returns overlap length in meters, or 0 if not collinear or no overlap.
 */
function computeCollinearOverlap(
  a1: [number, number], a2: [number, number],
  b1: [number, number], b2: [number, number],
): number {
  // Wall A direction
  const adx = a2[0] - a1[0]
  const adz = a2[1] - a1[1]
  const aLen = Math.hypot(adx, adz)
  if (aLen < 0.01) return 0

  // Wall B direction
  const bdx = b2[0] - b1[0]
  const bdz = b2[1] - b1[1]
  const bLen = Math.hypot(bdx, bdz)
  if (bLen < 0.01) return 0

  // Check collinearity: cross product should be ~0
  const cross = (adx / aLen) * (bdz / bLen) - (adz / aLen) * (bdx / bLen)
  if (Math.abs(cross) > 0.1) return 0 // Not collinear (>~6 degrees)

  // Check perpendicular distance between the two lines
  // Project b1 onto wall A's normal
  const nx = -adz / aLen
  const nz = adx / aLen
  const perpDist = Math.abs((b1[0] - a1[0]) * nx + (b1[1] - a1[1]) * nz)
  if (perpDist > 0.3) return 0 // Lines too far apart

  // Project all endpoints onto wall A's direction to find overlap
  const dax = adx / aLen
  const daz = adz / aLen
  const projA1 = 0
  const projA2 = aLen
  const projB1 = (b1[0] - a1[0]) * dax + (b1[1] - a1[1]) * daz
  const projB2 = (b2[0] - a1[0]) * dax + (b2[1] - a1[1]) * daz

  const aMin = Math.min(projA1, projA2)
  const aMax = Math.max(projA1, projA2)
  const bMin = Math.min(projB1, projB2)
  const bMax = Math.max(projB1, projB2)

  const overlapStart = Math.max(aMin, bMin)
  const overlapEnd = Math.min(aMax, bMax)

  return Math.max(0, overlapEnd - overlapStart)
}

/**
 * Minimum clearance (meters) between item AABB edge and wall centerline.
 * This is halfThick + WALL_CLEARANCE from centerline, meaning the item edge
 * will be WALL_CLEARANCE away from the wall inner surface.
 * Keep this very small (just enough to prevent z-fighting / visual clipping).
 * "Against wall" items should appear flush with the wall.
 */
const WALL_CLEARANCE = 0.02

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
 * Minimum distance from an AABB to a line segment (in 2D XZ plane).
 * Tests all 4 edges of the AABB against the segment, plus all 4 corners,
 * plus the closest point on the segment to the AABB center.
 * This is more robust than testing only discrete points, especially
 * when the AABB edge runs parallel to and overlaps the wall segment.
 */
function distAABBToSegment(
  aabb: { minX: number; maxX: number; minZ: number; maxZ: number },
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  // Sample dense points along all 4 AABB edges + corners
  const points: [number, number][] = [
    // Corners
    [aabb.minX, aabb.minZ],
    [aabb.maxX, aabb.minZ],
    [aabb.minX, aabb.maxZ],
    [aabb.maxX, aabb.maxZ],
    // Edge midpoints
    [(aabb.minX + aabb.maxX) / 2, aabb.minZ],
    [(aabb.minX + aabb.maxX) / 2, aabb.maxZ],
    [aabb.minX, (aabb.minZ + aabb.maxZ) / 2],
    [aabb.maxX, (aabb.minZ + aabb.maxZ) / 2],
    // Edge quarter points for better coverage on long edges
    [aabb.minX + (aabb.maxX - aabb.minX) * 0.25, aabb.minZ],
    [aabb.minX + (aabb.maxX - aabb.minX) * 0.75, aabb.minZ],
    [aabb.minX + (aabb.maxX - aabb.minX) * 0.25, aabb.maxZ],
    [aabb.minX + (aabb.maxX - aabb.minX) * 0.75, aabb.maxZ],
    [aabb.minX, aabb.minZ + (aabb.maxZ - aabb.minZ) * 0.25],
    [aabb.minX, aabb.minZ + (aabb.maxZ - aabb.minZ) * 0.75],
    [aabb.maxX, aabb.minZ + (aabb.maxZ - aabb.minZ) * 0.25],
    [aabb.maxX, aabb.minZ + (aabb.maxZ - aabb.minZ) * 0.75],
  ]

  // Also test closest point on the wall segment to the AABB center
  const cx = (aabb.minX + aabb.maxX) / 2
  const cz = (aabb.minZ + aabb.maxZ) / 2
  points.push([cx, cz])

  let minDist = Infinity
  for (const [px, pz] of points) {
    const d = distPointToSegment(px, pz, ax, az, bx, bz)
    if (d < minDist) minDist = d
  }
  return minDist
}

/**
 * Check if an item's AABB overlaps or is too close to any wall.
 * If so, push the item away from the nearest offending wall.
 * Returns the adjusted position, or null if no adjustment needed.
 *
 * Uses AABB-to-segment distance (not just discrete test points)
 * for robust detection even when the item edge runs parallel to a wall.
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

  // Multiple passes to handle items near wall corners (pushed from one wall into another)
  for (let pass = 0; pass < 3; pass++) {
    let passAdjusted = false

    for (const wall of walls) {
      const thickness = wall.thickness ?? 0.2
      const halfThick = thickness / 2
      const minClearance = halfThick + WALL_CLEARANCE

      const aabb = getItemAABB([px, py, pz], dimensions, rotation)

      const dist = distAABBToSegment(
        aabb,
        wall.start[0], wall.start[1],
        wall.end[0], wall.end[1],
      )

      if (dist < minClearance) {
        // Compute wall normal direction (perpendicular to wall segment)
        const wallDx = wall.end[0] - wall.start[0]
        const wallDz = wall.end[1] - wall.start[1]
        const wallLen = Math.hypot(wallDx, wallDz)
        if (wallLen < 0.001) continue

        const normalX = -wallDz / wallLen
        const normalZ = wallDx / wallLen

        // Determine which side of the wall the item center is on
        const toCenterX = px - wall.start[0]
        const toCenterZ = pz - wall.start[1]
        const side = Math.sign(toCenterX * normalX + toCenterZ * normalZ) || 1

        // Push along wall normal direction (toward the item's side)
        const pushDist = minClearance - dist + 0.02 // 2cm safety margin
        px += normalX * side * pushDist
        pz += normalZ * side * pushDist
        passAdjusted = true
        adjusted = true
        reasons.push(`Pushed away from wall to maintain ${WALL_CLEARANCE}m clearance`)
      }
    }

    if (!passAdjusted) break // No more adjustments needed
  }

  if (!adjusted) return null

  return {
    position: [px, py, pz],
    reason: reasons[0] ?? 'Position adjusted for wall clearance.',
  }
}
