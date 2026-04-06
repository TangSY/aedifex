import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  type DoorNode,
  type WallNode,
  type WindowNode,
  type ZoneNode,
  pointInPolygon,
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
  AddLevelToolCall,
  AddSlabToolCall,
  UpdateSlabToolCall,
  AddCeilingToolCall,
  UpdateCeilingToolCall,
  AddRoofToolCall,
  UpdateRoofToolCall,
  AddZoneToolCall,
  UpdateZoneToolCall,
  AddBuildingToolCall,
  UpdateSiteToolCall,
  AddScanToolCall,
  AddGuideToolCall,
  UpdateItemToolCall,
  MoveItemToolCall,
  RemoveItemToolCall,
  RemoveNodeToolCall,
  ToolResult,
  UpdateMaterialToolCall,
  UpdateDoorToolCall,
  UpdateWallToolCall,
  UpdateWindowToolCall,
  ValidatedAddDoor,
  ValidatedAddItem,
  ValidatedAddWall,
  ValidatedAddWindow,
  ValidatedAddLevel,
  ValidatedAddSlab,
  ValidatedUpdateSlab,
  ValidatedAddCeiling,
  ValidatedUpdateCeiling,
  ValidatedAddRoof,
  ValidatedUpdateRoof,
  ValidatedAddZone,
  ValidatedUpdateZone,
  ValidatedAddBuilding,
  ValidatedUpdateSite,
  ValidatedAddScan,
  ValidatedAddGuide,
  ValidatedUpdateItem,
  ValidatedMoveItem,
  ValidatedOperation,
  ValidatedRemoveItem,
  ValidatedRemoveNode,
  ValidatedUpdateMaterial,
  ValidatedUpdateDoor,
  ValidatedUpdateWall,
  ValidatedUpdateWindow,
} from './types'

// ============================================================================
// Mutation Executor
// Pure validation + resolution layer. Returns ValidatedOperation[].
// Does NOT touch scene state — that's the preview manager's job.
// ============================================================================

/**
 * Validate whether a string is a valid http/https URL.
 */
function isValidModelUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Validate and resolve a single AI tool call into a ValidatedOperation.
 * Accepts an optional wallCache to avoid redundant wall lookups within a batch.
 */
export function validateToolCall(
  toolCall: AIToolCall,
  wallCache?: Map<string, WallNode[]>,
  pendingRemovalIds?: Set<string>,
): ValidatedOperation[] {
  switch (toolCall.tool) {
    case 'add_item':
      return [validateAddItem(toolCall, wallCache)]
    case 'remove_item':
      return [validateRemoveItem(toolCall)]
    case 'move_item':
      return [validateMoveItem(toolCall, wallCache)]
    case 'update_material':
      return [validateUpdateMaterial(toolCall)]
    case 'add_wall':
      return [validateAddWall(toolCall, wallCache)]
    case 'add_door':
      return [validateAddDoor(toolCall, wallCache, pendingRemovalIds)]
    case 'add_window':
      return [validateAddWindow(toolCall, wallCache, pendingRemovalIds)]
    case 'update_wall':
      return [validateUpdateWall(toolCall, wallCache)]
    case 'update_door':
      return [validateUpdateDoor(toolCall)]
    case 'update_window':
      return [validateUpdateWindow(toolCall)]
    case 'remove_node':
      return [validateRemoveNode(toolCall)]
    case 'add_level':
      return [validateAddLevel(toolCall)]
    case 'add_slab':
      return [validateAddSlab(toolCall)]
    case 'update_slab':
      return [validateUpdateSlab(toolCall)]
    case 'add_ceiling':
      return [validateAddCeiling(toolCall, wallCache)]
    case 'update_ceiling':
      return [validateUpdateCeiling(toolCall, wallCache)]
    case 'add_roof':
      return [validateAddRoof(toolCall)]
    case 'update_roof':
      return [validateUpdateRoof(toolCall)]
    case 'add_zone':
      return [validateAddZone(toolCall)]
    case 'update_zone':
      return [validateUpdateZone(toolCall)]
    case 'add_building':
      return [validateAddBuilding(toolCall)]
    case 'update_site':
      return [validateUpdateSite(toolCall)]
    case 'add_scan':
      return [validateAddScan(toolCall)]
    case 'add_guide':
      return [validateAddGuide(toolCall)]
    case 'update_item':
      return [validateUpdateItem(toolCall)]
    case 'batch_operations': {
      // Collect nodeIds from remove operations so add_door/add_window validators
      // can skip overlap checks against nodes that will be removed in this batch.
      const batchRemovalIds = new Set<string>()
      const { nodes } = useScene.getState()
      for (const op of toolCall.operations) {
        const opRecord = op as Record<string, unknown>
        const opType = (opRecord.type as string) ?? guessToolType(opRecord)
        if (opType === 'remove_node' || opType === 'remove_item') {
          const nodeId = (opRecord.nodeId as string) ?? ''
          if (nodeId) {
            batchRemovalIds.add(nodeId)
            // If removing a wall, also mark its children (doors/windows) as pending removal
            const node = nodes[nodeId as AnyNodeId]
            if (node && 'children' in node && Array.isArray((node as WallNode).children)) {
              for (const childId of (node as WallNode).children) {
                batchRemovalIds.add(childId)
              }
            }
          }
        }
      }

      return toolCall.operations.flatMap((op) => {
        const opRecord = op as Record<string, unknown>
        const toolType = (opRecord.type as string) ?? guessToolType(opRecord)
        if (toolType === 'unknown') {
          return [{
            type: 'remove_item' as const,
            status: 'invalid' as const,
            nodeId: '' as AnyNodeId,
            errorReason: `Could not determine operation type for batch operation. Provide an explicit 'type' field. Keys present: ${Object.keys(opRecord).join(', ')}`,
          }] satisfies ValidatedOperation[]
        }
        const fullOp = { ...opRecord, tool: toolType } as AIToolCall
        return validateToolCall(fullOp, wallCache, batchRemovalIds.size > 0 ? batchRemovalIds : undefined)
      })
    }
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
 *
 * Creates a per-batch wall cache to avoid redundant `getWallsForLevel` calls
 * across multiple validators within the same batch.
 */
export function validateAllToolCalls(toolCalls: AIToolCall[]): ValidatedOperation[] {
  // Create wall cache for this validation batch — avoids repeated
  // tree traversals in getWallsForLevel across multiple tool calls.
  const wallCache = new Map<string, WallNode[]>()
  const validated = toolCalls.flatMap((tc) => validateToolCall(tc, wallCache))
  // Batch intra-collision: resolve overlaps between items in the same batch
  const deconflicted = resolveBatchCollisions(validated)
  const optimized = optimizeLayout(deconflicted)
  // Zone boundary re-check: optimizer (snapToNearestWall, spacing) may have
  // pushed items outside zone boundaries. Clamp them back inside.
  const bounded = optimized.map((op) => enforceZoneBoundaryPostOptimize(op, wallCache))
  // Post-optimization batch collision re-check: optimizer may have moved items
  // (wall snap, group spacing) causing new overlaps between batch items.
  return resolveBatchCollisions(bounded)
}

/**
 * Post-optimization zone boundary enforcement.
 * The optimizer (snapToNearestWall, adjustForGroupSpacing) may push items
 * outside zone boundaries. This re-checks and clamps them back inside.
 */
function enforceZoneBoundaryPostOptimize(op: ValidatedOperation, _wallCache?: Map<string, WallNode[]>): ValidatedOperation {
  if (op.status === 'invalid') return op
  if (op.type !== 'add_item' && op.type !== 'move_item') return op

  const levelId = useViewer.getState().selection.levelId
  if (!levelId) return op

  let dimensions: [number, number, number]

  if (op.type === 'add_item') {
    if (!op.asset || op.asset.attachTo) return op
    dimensions = (op.asset.dimensions ?? [1, 1, 1]) as [number, number, number]
  } else {
    const { nodes } = useScene.getState()
    const node = nodes[op.nodeId]
    if (!node || node.type !== 'item' || node.asset.attachTo) return op
    dimensions = (node.asset.dimensions ?? [1, 1, 1]) as [number, number, number]
  }

  const zoneBoundary = checkZoneBoundary(op.position, dimensions, op.rotation, levelId)

  if (zoneBoundary === 'too-large') {
    const name = op.type === 'add_item' ? (op.asset?.name ?? 'Item') : 'Item'
    return {
      ...op,
      status: 'invalid',
      errorReason: `"${name}" is too large for any room after layout optimization.`,
    } as ValidatedOperation
  }

  if (zoneBoundary) {
    op = {
      ...op,
      position: zoneBoundary.position,
      status: 'adjusted',
      adjustmentReason: [
        'adjustmentReason' in op ? op.adjustmentReason : undefined,
        zoneBoundary.reason,
      ].filter(Boolean).join(' '),
    } as ValidatedOperation
  }

  // Wall collision check after optimizer — prevents wall penetration
  const opWithPos = op as { position: [number, number, number]; rotation: [number, number, number] }
  const wallCollision = checkWallCollision(opWithPos.position, dimensions, opWithPos.rotation, levelId)
  if (wallCollision === 'no-space') {
    const name = op.type === 'add_item' ? ((op as ValidatedAddItem).asset?.name ?? 'Item') : 'Item'
    return {
      ...op,
      status: 'invalid',
      errorReason: `"${name}" cannot be placed — surrounded by walls with no valid position.`,
    } as ValidatedOperation
  }
  if (wallCollision) {
    return {
      ...op,
      position: wallCollision.position,
      status: 'adjusted',
      adjustmentReason: [
        'adjustmentReason' in op ? op.adjustmentReason : undefined,
        wallCollision.reason,
      ].filter(Boolean).join(' '),
    } as ValidatedOperation
  }

  return op
}

/**
 * Resolve collisions between add_item operations within the same batch.
 * Each item is validated against the scene, but not against other items
 * in the batch. This function checks pairwise overlaps and auto-offsets
 * colliding items.
 */
/**
 * Resolve collisions between add_item operations within the same batch.
 * For each item, compute minimum separation from all previously placed items
 * using AABB overlap analysis (no brute-force iteration).
 */
function resolveBatchCollisions(operations: ValidatedOperation[]): ValidatedOperation[] {
  const floorItems: { index: number; op: ValidatedAddItem }[] = []
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!
    if (op.type === 'add_item' && op.status !== 'invalid' && op.asset && !op.asset.attachTo) {
      floorItems.push({ index: i, op })
    }
  }

  if (floorItems.length < 2) return operations

  const result = [...operations]
  const occupiedAABBs: { minX: number; maxX: number; minZ: number; maxZ: number }[] = []

  for (const { index, op } of floorItems) {
    // op.asset is guaranteed non-null: floorItems is filtered by `op.asset && !op.asset.attachTo`
    const dims = (op.asset!.dimensions ?? [1, 1, 1]) as [number, number, number]
    let position = [...op.position] as [number, number, number]
    const aabb = getItemAABB(position, dims, op.rotation)

    // Compute combined push vector from all overlapping items
    let pushX = 0
    let pushZ = 0
    let hasCollision = false

    for (const other of occupiedAABBs) {
      const overlapX = Math.min(aabb.maxX, other.maxX) - Math.max(aabb.minX, other.minX)
      const overlapZ = Math.min(aabb.maxZ, other.maxZ) - Math.max(aabb.minZ, other.minZ)

      if (overlapX <= 0 || overlapZ <= 0) continue
      hasCollision = true

      const otherCx = (other.minX + other.maxX) / 2
      const otherCz = (other.minZ + other.maxZ) / 2

      // Push along axis of least overlap
      if (overlapX < overlapZ) {
        pushX += (position[0] >= otherCx ? 1 : -1) * (overlapX + 0.05)
      } else {
        pushZ += (position[2] >= otherCz ? 1 : -1) * (overlapZ + 0.05)
      }
    }

    if (hasCollision) {
      position = [position[0] + pushX, position[1], position[2] + pushZ]

      // Re-check wall collision after batch push — items pushed to avoid
      // overlapping siblings may have been pushed into walls.
      const levelId = useViewer.getState().selection.levelId
      if (levelId) {
        const wallCollision = checkWallCollision(position, dims, op.rotation, levelId)
        if (wallCollision === 'no-space') {
          result[index] = {
            ...op,
            position,
            status: 'invalid',
            errorReason: `"${op.asset!.name}" was pushed into walls while resolving batch collision — no valid position available.`,
          } as ValidatedAddItem
          // Don't add to occupiedAABBs — this item is rejected
          continue
        }
        if (wallCollision) {
          position = wallCollision.position
        }
      }

      result[index] = {
        ...op,
        position,
        status: 'adjusted',
        adjustmentReason: [op.adjustmentReason, 'Position adjusted to avoid overlap with other items in the same batch.'].filter(Boolean).join(' '),
      }
    }

    occupiedAABBs.push(getItemAABB(position, dims, op.rotation))
  }

  return result
}

/**
 * Build a structured ToolResult from validated operations.
 * This result is fed back to the LLM so it can iterate on its decisions.
 * When createdNodeIds is provided, include them so the LLM can reference
 * newly created nodes (e.g., wall IDs for adding doors/windows).
 */
/**
 * Build a tool result for LLM feedback or UI display.
 *
 * When compact=true (default for LLM), caps adjustment details at 3 entries
 * to save tokens. Inspired by Claude Code's toolResultStorage pattern.
 */
export function buildToolResult(
  toolName: string,
  operations: ValidatedOperation[],
  createdNodeIds?: AnyNodeId[],
  { compact = false }: { compact?: boolean } = {},
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
      // Compact mode: cap adjustments to save LLM context tokens
      adjustments: compact ? adjustments.slice(0, 3) : adjustments,
      errors,
      createdNodeIds: createdNodeIds ?? [],
    },
  }
}

// ============================================================================
// Individual Validators
// ============================================================================

function validateAddItem(call: AddItemToolCall, _wallCache?: Map<string, WallNode[]>): ValidatedAddItem {
  // Guard against undefined catalogSlug (can happen when batch_operations
  // guesses wrong tool type for an operation missing the 'type' field)
  if (!call.catalogSlug) {
    return {
      type: 'add_item',
      status: 'invalid',
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

  // Shape mismatch warning — tell AI the resolved item differs from request
  if (result.shapeWarning) {
    adjustmentReason = result.shapeWarning
  }

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

  // R1 + R2: Height constraints for ceiling items
  if (asset.attachTo === 'ceiling') {
    const heightLevelId = useViewer.getState().selection.levelId
    if (heightLevelId) {
      const heightCtx = getLevelHeightContext(heightLevelId)
      const ceilingHeight = getCeilingAtPosition(position[0], position[2], heightCtx.ceilings)
      if (ceilingHeight === null) {
        return {
          type: 'add_item',
          status: 'invalid',
          asset,
          position,
          rotation,
          errorReason: `"${asset.name}" requires a ceiling, but no ceiling exists at this position. Use add_ceiling first.`,
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
          // tryAutoOffset returned null — two cases:
          // 1. Internal re-check found no collision (false positive / stale grid) → item is fine
          // 2. Push was negligible but collision remains → invalid
          // Re-verify to distinguish:
          const recheck = spatialGridManager.canPlaceOnFloor(
            levelId,
            position,
            asset.dimensions ?? [1, 1, 1],
            rotation,
          )
          if (!recheck.valid && recheck.conflictIds.length > 0) {
            // Collision confirmed — item cannot be placed without clipping.
            // Search for nearby valid positions to include in the error feedback.
            const alternatives = findAlternativePositions(
              position,
              asset.dimensions ?? [1, 1, 1],
              rotation,
              levelId,
            )

            let errorMsg = `"${asset.name}" collides with existing items at [${position.map((v) => v.toFixed(1)).join(', ')}].`
            if (alternatives.length > 0) {
              const altStr = alternatives
                .map((p) => `[${p.map((v) => v.toFixed(1)).join(', ')}]`)
                .join(' or ')
              errorMsg += ` Suggested valid positions: ${altStr}. You can retry with one of these positions, or use propose_placement to let the user choose, or use ask_user to let the user specify a custom position.`
            } else {
              errorMsg += ` No valid nearby positions found. The area may be too crowded. Use ask_user to suggest the user remove some items or specify a different area.`
            }

            return {
              type: 'add_item',
              status: 'invalid',
              asset,
              position,
              rotation,
              errorReason: errorMsg,
            }
          }
          // No collision on re-check — false positive, item is fine at this position
        }
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

      // R5: Floor item height vs ceiling check
      const heightCtx = getLevelHeightContext(levelId)
      const itemTopY = position[1] + ((asset.dimensions ?? [1, 1, 1])[1] ?? 1)
      const ceilingAtItem = getCeilingAtPosition(position[0], position[2], heightCtx.ceilings)
      if (ceilingAtItem !== null && itemTopY > ceilingAtItem) {
        return {
          type: 'add_item',
          status: 'invalid',
          asset,
          position,
          rotation,
          errorReason: `"${asset.name}" is ${itemTopY.toFixed(1)}m tall but ceiling is at ${ceilingAtItem.toFixed(1)}m. Item exceeds ceiling height.`,
        }
      }

      // Zone boundary check — ensure item stays inside a room
      const zoneBoundary = checkZoneBoundary(
        position,
        asset.dimensions ?? [1, 1, 1],
        rotation,
        levelId,
      )
      if (zoneBoundary === 'too-large') {
        return {
          type: 'add_item',
          status: 'invalid',
          asset,
          position,
          rotation,
          errorReason: `"${asset.name}" is too large for any room on this level. The user needs to expand the room (move/extend walls) before this item can be placed.`,
        }
      }
      if (zoneBoundary) {
        position = zoneBoundary.position
        adjustmentReason = adjustmentReason
          ? `${adjustmentReason} ${zoneBoundary.reason}`
          : zoneBoundary.reason
      }

      // Wall collision check — prevents item from overlapping with wall geometry.
      // Works for both indoor (pushed inward) and outdoor (pushed outward) items.
      const wallCollision = checkWallCollision(position, asset.dimensions ?? [1, 1, 1], rotation, levelId)
      if (wallCollision === 'no-space') {
        return {
          type: 'add_item',
          status: 'invalid',
          asset,
          position,
          rotation,
          errorReason: `"${asset.name}" cannot be placed here — no valid position available (surrounded by walls).`,
        }
      }
      if (wallCollision) {
        position = wallCollision.position
        adjustmentReason = adjustmentReason
          ? `${adjustmentReason} ${wallCollision.reason}`
          : wallCollision.reason
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

function validateMoveItem(call: MoveItemToolCall, _wallCache?: Map<string, WallNode[]>): ValidatedMoveItem {
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

      // R5: Floor item height vs ceiling check (move_item)
      if (!node.asset.attachTo) {
        const moveHeightCtx = getLevelHeightContext(levelId)
        const moveItemTopY = position[1] + ((node.asset.dimensions ?? [1, 1, 1])[1] ?? 1)
        const moveCeilingH = getCeilingAtPosition(position[0], position[2], moveHeightCtx.ceilings)
        if (moveCeilingH !== null && moveItemTopY > moveCeilingH) {
          return {
            type: 'move_item',
            status: 'invalid',
            nodeId: call.nodeId as AnyNodeId,
            position,
            rotation,
            errorReason: `"${node.name ?? node.asset.name}" is ${moveItemTopY.toFixed(1)}m tall but ceiling is at ${moveCeilingH.toFixed(1)}m.`,
          }
        }
      }

      // Zone boundary check — ensure item stays inside a room
      const zoneBoundary = checkZoneBoundary(
        position,
        node.asset.dimensions,
        rotation,
        levelId,
      )
      if (zoneBoundary === 'too-large') {
        return {
          type: 'move_item',
          status: 'invalid',
          nodeId: call.nodeId as AnyNodeId,
          position,
          rotation,
          errorReason: `"${node.name ?? node.asset.name}" is too large for any room on this level. The user needs to expand the room before moving this item there.`,
        }
      }
      if (zoneBoundary) {
        position = zoneBoundary.position
        adjustmentReason = adjustmentReason
          ? `${adjustmentReason} ${zoneBoundary.reason}`
          : zoneBoundary.reason
      }

      // Wall collision check
      const wallCollision = checkWallCollision(position, node.asset.dimensions, rotation, levelId)
      if (wallCollision === 'no-space') {
        return {
          type: 'move_item',
          status: 'invalid',
          nodeId: call.nodeId as AnyNodeId,
          position,
          rotation,
          errorReason: `"${node.name ?? node.asset.name}" cannot be moved here — no valid position available (surrounded by walls).`,
        }
      }
      if (wallCollision) {
        position = wallCollision.position
        adjustmentReason = adjustmentReason
          ? `${adjustmentReason} ${wallCollision.reason}`
          : wallCollision.reason
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
 * Search for valid nearby positions when auto-offset fails.
 * Probes 8 directions (cardinal + diagonal) with increasing distances.
 * Returns up to `maxResults` positions that pass floor collision,
 * wall collision, and zone boundary checks.
 *
 * Used to provide actionable suggestions in the error feedback to the LLM,
 * so it can retry or present options to the user via propose_placement.
 */
function findAlternativePositions(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
  maxResults: number = 2,
): [number, number, number][] {
  // 8 directions: cardinal + diagonal (normalized diagonal distance)
  const directions: [number, number][] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707],
  ]
  // Step sizes in meters — small increments first for closest valid spot
  const stepSizes = [0.5, 1.0, 1.5, 2.0, 3.0]
  const results: [number, number, number][] = []

  for (const step of stepSizes) {
    for (const [dx, dz] of directions) {
      const candidate: [number, number, number] = [
        Math.round((position[0] + dx * step) * 10) / 10,
        position[1],
        Math.round((position[2] + dz * step) * 10) / 10,
      ]

      // Check floor collision
      const floorCheck = spatialGridManager.canPlaceOnFloor(
        levelId, candidate, dimensions, rotation,
      )
      if (!floorCheck.valid) continue

      // Check wall collision
      const wallCheck = checkWallCollision(candidate, dimensions, rotation, levelId)
      if (wallCheck === 'no-space') continue
      const finalPos = wallCheck ? wallCheck.position : candidate

      // Check zone boundary
      const zoneCheck = checkZoneBoundary(finalPos, dimensions, rotation, levelId)
      if (zoneCheck === 'too-large') continue
      const boundedPos = zoneCheck ? zoneCheck.position : finalPos

      results.push(boundedPos)
      if (results.length >= maxResults) return results
    }
  }

  return results
}

/**
 * Find a valid position for an item that collides with existing items.
 * Uses the collision AABBs to compute a minimum separation vector,
 * then pushes the item in the direction of least overlap.
 */
function tryAutoOffset(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
  ignoreIds?: string[],
): [number, number, number] | null {
  const result = spatialGridManager.canPlaceOnFloor(levelId, position, dimensions, rotation, ignoreIds)
  if (result.valid) return null // No collision

  const { nodes } = useScene.getState()
  const itemAABB = getItemAABB(position, dimensions, rotation)

  // Compute minimum push vector from all conflicting items
  let pushX = 0
  let pushZ = 0

  for (const conflictId of result.conflictIds) {
    const conflictNode = nodes[conflictId as AnyNodeId]
    if (!conflictNode || conflictNode.type !== 'item') continue

    const cDims = (conflictNode.asset?.dimensions ?? [1, 1, 1]) as [number, number, number]
    const cAABB = getItemAABB(conflictNode.position, cDims, conflictNode.rotation)

    // Compute overlap on each axis
    const overlapX = Math.min(itemAABB.maxX, cAABB.maxX) - Math.max(itemAABB.minX, cAABB.minX)
    const overlapZ = Math.min(itemAABB.maxZ, cAABB.maxZ) - Math.max(itemAABB.minZ, cAABB.minZ)

    if (overlapX <= 0 || overlapZ <= 0) continue // No actual overlap

    // Push along the axis with least overlap (minimum separation)
    if (overlapX < overlapZ) {
      // Push along X
      const dir = position[0] >= (cAABB.minX + cAABB.maxX) / 2 ? 1 : -1
      pushX += dir * (overlapX + 0.05)
    } else {
      // Push along Z
      const dir = position[2] >= (cAABB.minZ + cAABB.maxZ) / 2 ? 1 : -1
      pushZ += dir * (overlapZ + 0.05)
    }
  }

  if (Math.abs(pushX) < 0.01 && Math.abs(pushZ) < 0.01) return null

  const candidate: [number, number, number] = [
    position[0] + pushX,
    position[1],
    position[2] + pushZ,
  ]

  // Verify the pushed position is valid
  const verify = spatialGridManager.canPlaceOnFloor(levelId, candidate, dimensions, rotation, ignoreIds)
  if (verify.valid) return candidate

  // Push didn't fully resolve — return null to indicate failure.
  // The caller should mark the item as invalid rather than placing it
  // at a position with known collisions (causes clipping/penetration).
  return null
}

/**
 * Guess tool type from operation object (for batch operations).
 * Returns 'unknown' when no confident match can be made, so the caller
 * can mark the operation as invalid instead of misrouting it.
 */
function guessToolType(op: Record<string, unknown>): string {
  // add_wall: requires both start and end arrays
  if ('start' in op && 'end' in op && Array.isArray(op.start) && Array.isArray(op.end)) {
    return 'add_wall'
  }

  // add_door / add_window: requires wallId + positionAlongWall
  if ('wallId' in op && 'positionAlongWall' in op && typeof op.wallId === 'string') {
    if ('hingesSide' in op || 'swingDirection' in op) return 'add_door'
    if ('heightFromFloor' in op) return 'add_window'
    return 'add_door'
  }

  // add_item: requires catalogSlug (string) and position (array)
  if ('catalogSlug' in op && typeof op.catalogSlug === 'string' && 'position' in op && Array.isArray(op.position)) {
    return 'add_item'
  }

  // update_material: requires nodeId + material object
  if ('nodeId' in op && 'material' in op && typeof op.nodeId === 'string' && typeof op.material === 'object') {
    return 'update_material'
  }

  // move_item: requires nodeId + position + no material (to avoid confusion with update_material)
  if ('nodeId' in op && 'position' in op && Array.isArray(op.position) && !('material' in op) && typeof op.nodeId === 'string') {
    return 'move_item'
  }

  // remove_item / remove_node: requires nodeId only (no position, no material, no other fields)
  if ('nodeId' in op && typeof op.nodeId === 'string' && !('position' in op) && !('material' in op) && !('catalogSlug' in op)) {
    return 'remove_item'
  }

  // Structural types with polygon
  if ('polygon' in op && Array.isArray(op.polygon)) {
    if ('height' in op && !('elevation' in op)) return 'add_ceiling'
    if ('elevation' in op) return 'add_slab'
    return 'add_zone'
  }

  // add_scan / add_guide: requires url
  if ('url' in op && typeof op.url === 'string') {
    // Distinguish by presence of guide-specific context or fall back to scan
    return 'add_scan'
  }

  // add_roof: requires roofType or (width + depth + roofHeight)
  if ('roofType' in op || ('width' in op && 'depth' in op && 'roofHeight' in op)) {
    return 'add_roof'
  }

  // No confident match — return 'unknown' so caller marks it invalid
  return 'unknown'
}

// ============================================================================
// Wall / Door / Window Validators
// ============================================================================

/** Minimum wall length in meters */
const MIN_WALL_LENGTH = 0.5

function validateAddWall(call: AddWallToolCall, wallCache?: Map<string, WallNode[]>): ValidatedAddWall {
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

/**
 * Find positions along a wall where perpendicular walls connect (T-junctions).
 * Returns an array of { position: number, thickness: number } where position
 * is the distance along the wall and thickness is the perpendicular wall's thickness.
 */
function findJunctionPositions(
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
 * Adjust a door/window position to avoid T-junction conflicts.
 * Returns the adjusted position and whether adjustment was needed.
 */
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

function avoidJunctions(
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

function validateAddDoor(call: AddDoorToolCall, _wallCache?: Map<string, WallNode[]>, pendingRemovalIds?: Set<string>): ValidatedAddDoor {
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

function validateAddWindow(call: AddWindowToolCall, _wallCache?: Map<string, WallNode[]>, pendingRemovalIds?: Set<string>): ValidatedAddWindow {
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

function validateUpdateWall(call: UpdateWallToolCall, _wallCache?: Map<string, WallNode[]>): ValidatedUpdateWall {
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

function validateUpdateDoor(call: UpdateDoorToolCall): ValidatedUpdateDoor {
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

function validateUpdateWindow(call: UpdateWindowToolCall): ValidatedUpdateWindow {
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
// New Node Type Validators
// ============================================================================

/** Helper: compute polygon area using shoelace formula */
function polygonArea(polygon: [number, number][]): number {
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i]![0] * polygon[j]![1]
    area -= polygon[j]![0] * polygon[i]![1]
  }
  return Math.abs(area) / 2
}

/** Helper: find the current building and its levels */
function findBuildingAndLevels(): {
  buildingId: AnyNodeId | null
  levels: { id: string; level: number }[]
} {
  const { nodes } = useScene.getState()
  const levelId = useViewer.getState().selection.levelId
  if (!levelId) return { buildingId: null, levels: [] }

  const currentLevel = nodes[levelId as AnyNodeId]
  if (!currentLevel) return { buildingId: null, levels: [] }

  const buildingId = currentLevel.parentId as AnyNodeId | null
  if (!buildingId) return { buildingId: null, levels: [] }

  const building = nodes[buildingId]
  if (!building || building.type !== 'building') return { buildingId: null, levels: [] }

  const levels = (building.children as string[])
    .map((id) => nodes[id as AnyNodeId])
    .filter((n): n is AnyNode => !!n && n.type === 'level')
    .map((n) => ({ id: n.id, level: (n as { level: number }).level ?? 0 }))

  return { buildingId, levels }
}

function validateAddLevel(call: AddLevelToolCall): ValidatedAddLevel {
  const { buildingId, levels } = findBuildingAndLevels()

  if (!buildingId) {
    return {
      type: 'add_level',
      status: 'invalid',
      level: 0,
      buildingId: '' as AnyNodeId,
      errorReason: 'No building found in current scene. Use add_building first.',
    }
  }

  const nextLevel = levels.length > 0
    ? Math.max(...levels.map((l) => l.level)) + 1
    : 0

  return {
    type: 'add_level',
    status: 'valid',
    level: nextLevel,
    name: call.name,
    buildingId,
  }
}

function validateAddSlab(call: AddSlabToolCall): ValidatedAddSlab {
  const polygon = call.polygon as [number, number][]

  if (!polygon || polygon.length < 3) {
    return {
      type: 'add_slab',
      status: 'invalid',
      polygon: polygon ?? [],
      elevation: call.elevation ?? 0.05,
      holes: (call.holes ?? []) as [number, number][][],
      errorReason: 'Slab polygon must have at least 3 points.',
    }
  }

  const area = polygonArea(polygon)
  if (area < 1) {
    return {
      type: 'add_slab',
      status: 'invalid',
      polygon,
      elevation: call.elevation ?? 0.05,
      holes: (call.holes ?? []) as [number, number][][],
      errorReason: `Slab polygon area too small (${area.toFixed(1)}m²). Minimum is 1m².`,
    }
  }

  return {
    type: 'add_slab',
    status: 'valid',
    polygon,
    elevation: call.elevation ?? 0.05,
    holes: (call.holes ?? []) as [number, number][][],
  }
}

function validateUpdateSlab(call: UpdateSlabToolCall): ValidatedUpdateSlab {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_slab', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Slab "${call.nodeId}" not found.` }
  }
  if (node.type !== 'slab') {
    return { type: 'update_slab', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a slab.` }
  }

  if (call.polygon && call.polygon.length < 3) {
    return { type: 'update_slab', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'Polygon must have at least 3 points.' }
  }

  return {
    type: 'update_slab',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    elevation: call.elevation,
    polygon: call.polygon as [number, number][] | undefined,
  }
}

function validateAddCeiling(call: AddCeilingToolCall, _wallCache?: Map<string, WallNode[]>): ValidatedAddCeiling {
  let polygon = call.polygon as [number, number][]
  let polygonAutoDetected = false

  // Fallback: auto-detect polygon from the largest zone when polygon is missing or invalid
  if (!polygon || polygon.length < 3) {
    const levelId = useViewer.getState().selection.levelId
    if (!levelId) {
      return {
        type: 'add_ceiling',
        status: 'invalid',
        polygon: polygon ?? [],
        height: call.height ?? 2.5,
        errorReason: 'Ceiling polygon must have at least 3 points, and no active level was found to auto-detect a zone boundary.',
      }
    }

    const zones = getZonesForLevel(levelId)
    if (zones.length === 0) {
      return {
        type: 'add_ceiling',
        status: 'invalid',
        polygon: polygon ?? [],
        height: call.height ?? 2.5,
        errorReason: 'Ceiling polygon must have at least 3 points, and no zones were found on the current level to auto-detect a boundary.',
      }
    }

    // Pick the zone with the largest area
    const largestZone = zones.reduce((best, zone) => {
      return polygonArea(zone.polygon as [number, number][]) > polygonArea(best.polygon as [number, number][]) ? zone : best
    })

    polygon = largestZone.polygon as [number, number][]
    polygonAutoDetected = true
  }

  if (!polygon || polygon.length < 3) {
    return {
      type: 'add_ceiling',
      status: 'invalid',
      polygon: polygon ?? [],
      height: call.height ?? 2.5,
      errorReason: 'Ceiling polygon must have at least 3 points.',
    }
  }

  const area = polygonArea(polygon)
  if (area < 1) {
    return {
      type: 'add_ceiling',
      status: 'invalid',
      polygon,
      height: call.height ?? 2.5,
      errorReason: `Ceiling polygon area too small (${area.toFixed(1)}m²). Minimum is 1m².`,
    }
  }

  // R3: Ceiling height must match wall height
  const ceilLevelId = useViewer.getState().selection.levelId
  let ceilingHeight = call.height ?? 2.5
  let ceilAdjustReason: string | undefined

  if (ceilLevelId) {
    const heightCtx = getLevelHeightContext(ceilLevelId)

    // Auto-adjust ceiling height to match wall height
    if (Math.abs(ceilingHeight - heightCtx.wallHeight) > 0.1) {
      ceilAdjustReason = `Ceiling height adjusted from ${ceilingHeight}m to ${heightCtx.wallHeight}m to match wall height.`
      ceilingHeight = heightCtx.wallHeight
    }

    // R4: Check if existing items exceed wall height (can't add ceiling)
    if (heightCtx.tallestItemHeight > heightCtx.wallHeight) {
      return {
        type: 'add_ceiling',
        status: 'invalid',
        polygon,
        height: ceilingHeight,
        errorReason: `Cannot add ceiling: existing items reach ${heightCtx.tallestItemHeight.toFixed(1)}m, which exceeds wall height ${heightCtx.wallHeight.toFixed(1)}m. Remove or shorten tall items first.`,
      }
    }
  }

  const autoDetectReason = polygonAutoDetected
    ? 'Ceiling polygon was auto-detected from the largest zone boundary (no polygon provided by AI).'
    : undefined
  const combinedAdjustReason = [autoDetectReason, ceilAdjustReason].filter(Boolean).join(' ') || undefined

  return {
    type: 'add_ceiling',
    status: combinedAdjustReason ? 'adjusted' : 'valid',
    polygon,
    height: ceilingHeight,
    material: call.material,
    adjustmentReason: combinedAdjustReason,
  }
}

function validateUpdateCeiling(call: UpdateCeilingToolCall, _wallCache?: Map<string, WallNode[]>): ValidatedUpdateCeiling {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_ceiling', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Ceiling "${call.nodeId}" not found.` }
  }
  if (node.type !== 'ceiling') {
    return { type: 'update_ceiling', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a ceiling.` }
  }

  if (!call.height && !call.material) {
    return { type: 'update_ceiling', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'No properties to update. Provide height and/or material.' }
  }

  // R3: If height is being changed, auto-adjust to match wall height
  let adjustedHeight = call.height
  let uCeilAdjust: string | undefined
  if (call.height) {
    const uCeilLevelId = useViewer.getState().selection.levelId
    if (uCeilLevelId) {
      const hCtx = getLevelHeightContext(uCeilLevelId)
      if (Math.abs(call.height - hCtx.wallHeight) > 0.1) {
        adjustedHeight = hCtx.wallHeight
        uCeilAdjust = `Ceiling height adjusted from ${call.height}m to ${hCtx.wallHeight}m to match wall height.`
      }
    }
  }

  return {
    type: 'update_ceiling',
    status: uCeilAdjust ? 'adjusted' as const : 'valid' as const,
    nodeId: call.nodeId as AnyNodeId,
    height: adjustedHeight,
    material: call.material,
  }
}

const VALID_ROOF_TYPES = new Set(['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'])

function validateAddRoof(call: AddRoofToolCall): ValidatedAddRoof {
  if (!call.width || call.width <= 0) {
    return {
      type: 'add_roof',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      width: call.width ?? 0,
      depth: call.depth ?? 0,
      roofType: call.roofType ?? 'gable',
      roofHeight: call.roofHeight ?? 2.5,
      wallHeight: call.wallHeight ?? 0.5,
      overhang: call.overhang ?? 0.3,
      errorReason: 'Roof width must be > 0.',
    }
  }

  if (!call.depth || call.depth <= 0) {
    return {
      type: 'add_roof',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      width: call.width,
      depth: call.depth ?? 0,
      roofType: call.roofType ?? 'gable',
      roofHeight: call.roofHeight ?? 2.5,
      wallHeight: call.wallHeight ?? 0.5,
      overhang: call.overhang ?? 0.3,
      errorReason: 'Roof depth must be > 0.',
    }
  }

  if (!VALID_ROOF_TYPES.has(call.roofType)) {
    return {
      type: 'add_roof',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      width: call.width,
      depth: call.depth,
      roofType: 'gable',
      roofHeight: call.roofHeight ?? 2.5,
      wallHeight: call.wallHeight ?? 0.5,
      overhang: call.overhang ?? 0.3,
      errorReason: `Invalid roofType "${call.roofType}". Must be one of: ${[...VALID_ROOF_TYPES].join(', ')}.`,
    }
  }

  return {
    type: 'add_roof',
    status: 'valid',
    position: call.position ?? [0, 0, 0],
    width: call.width,
    depth: call.depth,
    roofType: call.roofType,
    roofHeight: call.roofHeight ?? 2.5,
    wallHeight: call.wallHeight ?? 0.5,
    overhang: call.overhang ?? 0.3,
  }
}

function validateUpdateRoof(call: UpdateRoofToolCall): ValidatedUpdateRoof {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_roof', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Roof segment "${call.nodeId}" not found.` }
  }
  if (node.type !== 'roof-segment') {
    return { type: 'update_roof', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a roof-segment.` }
  }

  if (call.roofType && !VALID_ROOF_TYPES.has(call.roofType)) {
    return { type: 'update_roof', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Invalid roofType "${call.roofType}".` }
  }

  return {
    type: 'update_roof',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    roofType: call.roofType,
    roofHeight: call.roofHeight,
    wallHeight: call.wallHeight,
    width: call.width,
    depth: call.depth,
  }
}

function validateAddZone(call: AddZoneToolCall): ValidatedAddZone {
  const polygon = call.polygon as [number, number][]

  if (!polygon || polygon.length < 3) {
    return {
      type: 'add_zone',
      status: 'invalid',
      polygon: polygon ?? [],
      errorReason: 'Zone polygon must have at least 3 points.',
    }
  }

  return {
    type: 'add_zone',
    status: 'valid',
    polygon,
    name: call.name,
  }
}

function validateUpdateZone(call: UpdateZoneToolCall): ValidatedUpdateZone {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_zone', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Zone "${call.nodeId}" not found.` }
  }
  if (node.type !== 'zone') {
    return { type: 'update_zone', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a zone.` }
  }

  if (call.polygon && call.polygon.length < 3) {
    return { type: 'update_zone', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'Polygon must have at least 3 points.' }
  }

  return {
    type: 'update_zone',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    polygon: call.polygon as [number, number][] | undefined,
    name: call.name,
  }
}

function validateAddBuilding(call: AddBuildingToolCall): ValidatedAddBuilding {
  return {
    type: 'add_building',
    status: 'valid',
    position: call.position ?? [0, 0, 0],
    name: call.name,
  }
}

function validateUpdateSite(call: UpdateSiteToolCall): ValidatedUpdateSite {
  const { nodes } = useScene.getState()
  // Find site node
  const site = Object.values(nodes).find((n) => n.type === 'site')

  if (!site) {
    return { type: 'update_site', status: 'invalid', nodeId: '' as AnyNodeId, errorReason: 'No site node found in scene.' }
  }

  if (call.polygon && call.polygon.length < 3) {
    return { type: 'update_site', status: 'invalid', nodeId: site.id as AnyNodeId, errorReason: 'Site polygon must have at least 3 points.' }
  }

  return {
    type: 'update_site',
    status: 'valid',
    nodeId: site.id as AnyNodeId,
    polygon: call.polygon as [number, number][] | undefined,
  }
}

function validateAddScan(call: AddScanToolCall): ValidatedAddScan {
  if (!call.url) {
    return {
      type: 'add_scan',
      status: 'invalid',
      url: '',
      position: [0, 0, 0],
      scale: 1,
      opacity: 0.5,
      errorReason: 'URL is required for scan.',
    }
  }

  if (!isValidModelUrl(call.url)) {
    return {
      type: 'add_scan',
      status: 'invalid',
      url: call.url,
      position: call.position ?? [0, 0, 0],
      scale: call.scale ?? 1,
      opacity: call.opacity ?? 0.5,
      errorReason: 'URL must be a valid http/https URL.',
    }
  }

  return {
    type: 'add_scan',
    status: 'valid',
    url: call.url,
    position: call.position ?? [0, 0, 0],
    scale: call.scale ?? 1,
    opacity: call.opacity ?? 0.5,
  }
}

function validateAddGuide(call: AddGuideToolCall): ValidatedAddGuide {
  if (!call.url) {
    return {
      type: 'add_guide',
      status: 'invalid',
      url: '',
      position: [0, 0, 0],
      scale: 1,
      opacity: 0.5,
      errorReason: 'URL is required for guide.',
    }
  }

  if (!isValidModelUrl(call.url)) {
    return {
      type: 'add_guide',
      status: 'invalid',
      url: call.url,
      position: call.position ?? [0, 0, 0],
      scale: call.scale ?? 1,
      opacity: call.opacity ?? 0.5,
      errorReason: 'URL must be a valid http/https URL.',
    }
  }

  return {
    type: 'add_guide',
    status: 'valid',
    url: call.url,
    position: call.position ?? [0, 0, 0],
    scale: call.scale ?? 1,
    opacity: call.opacity ?? 0.5,
  }
}

function validateUpdateItem(call: UpdateItemToolCall): ValidatedUpdateItem {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_item', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Item "${call.nodeId}" not found.` }
  }
  if (node.type !== 'item') {
    return { type: 'update_item', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not an item.` }
  }

  if (!call.scale) {
    return { type: 'update_item', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'No properties to update. Provide scale.' }
  }

  return {
    type: 'update_item',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    scale: call.scale,
  }
}

// ============================================================================
// Wall Crossing Detection
// ============================================================================

/**
 * Endpoint proximity tolerance — if a new wall's endpoint is within this
 * distance of the existing wall segment, treat it as a T-junction (allowed).
 */
const ENDPOINT_TOLERANCE = 0.3

/**
 * Detect if two wall segments cross THROUGH each other (not at endpoints).
 * Returns true only for genuine crossing — NOT for T-junctions where one
 * wall's endpoint touches the other wall's body.
 */
function wallsCrossThrough(
  a1: [number, number], a2: [number, number],
  b1: [number, number], b2: [number, number],
): boolean {
  // Pre-check: walls sharing endpoints are never crossings.
  // This handles T-junctions, extensions, and corners where one wall's
  // endpoint lands exactly on (or very near) the other wall's endpoint.
  const SHARED_ENDPOINT_EPS = 0.5 // same as grid snap tolerance
  for (const ep1 of [a1, a2]) {
    for (const ep2 of [b1, b2]) {
      if (Math.hypot(ep1[0] - ep2[0], ep1[1] - ep2[1]) < SHARED_ENDPOINT_EPS) {
        return false // shared endpoint = T-junction or extension, not crossing
      }
    }
  }

  // Standard segment intersection test using cross products
  const d1x = a2[0] - a1[0], d1z = a2[1] - a1[1]
  const d2x = b2[0] - b1[0], d2z = b2[1] - b1[1]

  const cross = d1x * d2z - d1z * d2x
  // Nearly parallel — handled by collinear overlap check
  if (Math.abs(cross) < 1e-6) return false

  const t = ((b1[0] - a1[0]) * d2z - (b1[1] - a1[1]) * d2x) / cross
  const u = ((b1[0] - a1[0]) * d1z - (b1[1] - a1[1]) * d1x) / cross

  // No intersection if parameters outside [0, 1]
  if (t < 0 || t > 1 || u < 0 || u > 1) return false

  // Intersection exists. Now check if it's at endpoints (T-junction = allowed).
  // If either segment's parameter is very close to 0 or 1, one wall's endpoint
  // is touching the other wall — this is a valid T-junction or corner.
  // Use a minimum absolute tolerance to avoid overly tight rejection on long walls.
  const aLen = Math.hypot(d1x, d1z)
  const bLen = Math.hypot(d2x, d2z)
  const ENDPOINT_T = Math.max(ENDPOINT_TOLERANCE / aLen, 0.05)
  const ENDPOINT_U = Math.max(ENDPOINT_TOLERANCE / bLen, 0.05)

  const aAtEndpoint = t < ENDPOINT_T || t > 1 - ENDPOINT_T
  const bAtEndpoint = u < ENDPOINT_U || u > 1 - ENDPOINT_U

  // If EITHER segment's intersection is at its endpoint, it's a T-junction → allowed
  if (aAtEndpoint || bAtEndpoint) return false

  // Both segments cross each other mid-body → genuine crossing → blocked
  return true
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

// WALL_CLEARANCE removed — replaced by checkWallCollision constraint solver

/**
 * Collect all WallNode instances belonging to a given level.
 * Accepts an optional cache map to avoid redundant tree traversals
 * when called multiple times for the same level within a batch.
 */
function getWallsForLevel(levelId: string, wallCache?: Map<string, WallNode[]>): WallNode[] {
  if (wallCache) {
    const cached = wallCache.get(levelId)
    if (cached) return cached
  }

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

  if (wallCache) {
    wallCache.set(levelId, walls)
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

// distPointToSegment, distAABBToSegment, adjustForWallClearance removed
// — replaced by checkWallCollision constraint solver

// ============================================================================
// Height Constraint Validation
// ============================================================================

/**
 * Collect height-related context for a level: wall height, ceilings, tallest item.
 * Used by multiple validators to enforce vertical spatial constraints.
 */
function getLevelHeightContext(levelId: string): {
  wallHeight: number
  ceilings: { id: string; height: number; polygon: [number, number][] }[]
  tallestItemHeight: number
} {
  const { nodes } = useScene.getState()
  const walls = getWallsForLevel(levelId)
  const wallHeight = walls.length > 0
    ? Math.max(...walls.map((w) => w.height ?? 2.5))
    : 2.5

  const ceilings: { id: string; height: number; polygon: [number, number][] }[] = []
  let tallestItemHeight = 0

  const visited = new Set<string>()
  const queue = [levelId]
  while (queue.length > 0) {
    const nid = queue.shift()!
    if (visited.has(nid)) continue
    visited.add(nid)
    const node = nodes[nid as AnyNodeId]
    if (!node) continue
    if (node.type === 'ceiling') {
      const cn = node as { id: string; height?: number; polygon: [number, number][] }
      ceilings.push({ id: cn.id, height: cn.height ?? 2.5, polygon: cn.polygon })
    }
    if (node.type === 'item' && !(node as { asset: { attachTo?: string } }).asset.attachTo) {
      const dims = ((node as { asset: { dimensions?: number[] } }).asset.dimensions ?? [1, 1, 1]) as number[]
      const topY = ((node as { position: number[] }).position[1] ?? 0) + (dims[1] ?? 1)
      if (topY > tallestItemHeight) tallestItemHeight = topY
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const cid of node.children) queue.push(cid as string)
    }
  }

  return { wallHeight, ceilings, tallestItemHeight }
}

/**
 * Find the ceiling that covers a given XZ position.
 * Returns the ceiling height if found, null otherwise.
 */
function getCeilingAtPosition(
  x: number,
  z: number,
  ceilings: { id: string; height: number; polygon: [number, number][] }[],
): number | null {
  for (const c of ceilings) {
    if (c.polygon.length >= 3 && pointInPolygon(x, z, c.polygon)) {
      return c.height
    }
  }
  return null
}

// ============================================================================
// Zone Boundary Validation
// ============================================================================

/**
 * Collect all ZoneNode instances belonging to a given level.
 */
function getZonesForLevel(levelId: string): ZoneNode[] {
  const { nodes } = useScene.getState()
  const zones: ZoneNode[] = []
  const visited = new Set<string>()
  const queue: string[] = [levelId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId as AnyNodeId] as AnyNode | undefined
    if (!node) continue

    if (node.type === 'zone') {
      zones.push(node as ZoneNode)
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const childId of node.children) {
        queue.push(childId as string)
      }
    }
  }
  return zones
}

/**
 * Compute the 4 XZ footprint corners of an item given its position, dimensions, and Y rotation.
 */
function getItemCorners(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
): [number, number][] {
  const [x, , z] = position
  const [w, , d] = dimensions
  const yRot = rotation[1]
  const halfW = w / 2
  const halfD = d / 2
  const cos = Math.cos(yRot)
  const sin = Math.sin(yRot)

  return [
    [x + (-halfW * cos + halfD * sin), z + (-halfW * sin - halfD * cos)],
    [x + (halfW * cos + halfD * sin), z + (halfW * sin - halfD * cos)],
    [x + (halfW * cos - halfD * sin), z + (halfW * sin + halfD * cos)],
    [x + (-halfW * cos - halfD * sin), z + (-halfW * sin + halfD * cos)],
  ]
}

/**
 * Check if an item is fully inside at least one zone on the level.
 * Returns:
 * - null if fully inside a zone (no adjustment needed)
 * - 'too-large' if item cannot fit in any zone
 * - { position, reason } if the position was clamped to fit inside a zone
 */
/**
 * Check if an item's AABB overlaps with any wall segment on the level.
 * If overlap detected, push the item perpendicular to the wall (away from
 * the wall center line, toward whichever side the item center is on).
 *
 * This works for both indoor and outdoor items — it directly tests against
 * wall geometry rather than inferring from zone polygons.
 */
/**
 * Compute item half-extent projected onto a given normal direction.
 * For an axis-aligned AABB with half-sizes (hx, hz), the projected half-extent
 * onto direction (nx, nz) is |nx|*hx + |nz|*hz (support function of AABB).
 */
function itemHalfExtentOnNormal(
  itemHalfX: number,
  itemHalfZ: number,
  nx: number,
  nz: number,
): number {
  return Math.abs(nx) * itemHalfX + Math.abs(nz) * itemHalfZ
}

function checkWallCollision(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
): { position: [number, number, number]; reason: string } | 'no-space' | null {
  const walls = getWallsForLevel(levelId)
  if (walls.length === 0) return null

  const [ix, iy, iz] = position
  const itemAABB = getItemAABB(position, dimensions, rotation)
  const itemHalfX = (itemAABB.maxX - itemAABB.minX) / 2
  const itemHalfZ = (itemAABB.maxZ - itemAABB.minZ) / 2

  // For each colliding wall, compute a push vector along the wall's actual normal.
  // Works for walls at any angle (horizontal, vertical, diagonal).
  let pushX = 0
  let pushZ = 0
  let hasCollision = false

  for (const wall of walls) {
    const thickness = wall.thickness ?? 0.2
    const halfThick = thickness / 2
    const wdx = wall.end[0] - wall.start[0]
    const wdz = wall.end[1] - wall.start[1]
    const wallLen = Math.hypot(wdx, wdz)
    if (wallLen < 0.01) continue

    const udx = wdx / wallLen
    const udz = wdz / wallLen

    // Project item center onto wall line
    const t = ((ix + pushX - wall.start[0]) * udx + (iz + pushZ - wall.start[1]) * udz) / wallLen
    if (t < -0.5 || t > wallLen + 0.5) continue

    // Wall normal (perpendicular)
    const nx = -udz
    const nz = udx
    const signedDist = (ix + pushX - wall.start[0]) * nx + (iz + pushZ - wall.start[1]) * nz

    // Item half-extent projected onto wall normal direction
    const halfExtent = itemHalfExtentOnNormal(itemHalfX, itemHalfZ, nx, nz)
    const minDist = halfThick + halfExtent + 0.02

    const penetration = minDist - Math.abs(signedDist)
    if (penetration <= 0.01) continue

    hasCollision = true
    const pushDir = signedDist >= 0 ? 1 : -1
    pushX += nx * pushDir * penetration
    pushZ += nz * pushDir * penetration
  }

  if (!hasCollision) return null

  // Verify: check if the pushed position still collides with any wall.
  // If so, the space is too tight (contradictory constraints).
  let stillCollides = false
  const newX = ix + pushX
  const newZ = iz + pushZ

  for (const wall of walls) {
    const thickness = wall.thickness ?? 0.2
    const halfThick = thickness / 2
    const wdx = wall.end[0] - wall.start[0]
    const wdz = wall.end[1] - wall.start[1]
    const wallLen = Math.hypot(wdx, wdz)
    if (wallLen < 0.01) continue

    const udx = wdx / wallLen
    const udz = wdz / wallLen
    const t = ((newX - wall.start[0]) * udx + (newZ - wall.start[1]) * udz) / wallLen
    if (t < -0.5 || t > wallLen + 0.5) continue

    const nx = -udz
    const nz = udx
    const signedDist = (newX - wall.start[0]) * nx + (newZ - wall.start[1]) * nz
    const halfExtent = itemHalfExtentOnNormal(itemHalfX, itemHalfZ, nx, nz)
    const minDist = halfThick + halfExtent + 0.02

    if (minDist - Math.abs(signedDist) > 0.01) {
      stillCollides = true
      break
    }
  }

  if (stillCollides) return 'no-space'

  if (Math.abs(pushX) < 0.005 && Math.abs(pushZ) < 0.005) {
    return null
  }

  return {
    position: [newX, iy, newZ],
    reason: 'Position adjusted to avoid overlapping with wall.',
  }
}

/**
 * Get the maximum wall thickness for walls bordering a level.
 * Used to compute safe interior margin for furniture placement.
 */
function getMaxWallThickness(levelId: string): number {
  const walls = getWallsForLevel(levelId)
  if (walls.length === 0) return 0.2 // default
  return Math.max(...walls.map((w) => w.thickness ?? 0.2))
}

function checkZoneBoundary(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  levelId: string,
): { position: [number, number, number]; reason: string } | 'too-large' | null {
  const zones = getZonesForLevel(levelId)
  if (zones.length === 0) return null // No zones exist, skip check

  // Determine placement intent from item CENTER position:
  // - Center inside a zone → indoor placement → enforce wall inset
  // - Center outside all zones → outdoor placement → don't interfere
  const [x, y, z] = position
  const centerInZone = zones.find(
    (zone) => zone.polygon.length >= 3 && pointInPolygon(x, z, zone.polygon)
  )

  if (!centerInZone) {
    // Item center is outside all zones — outdoor placement, skip zone boundary check.
    // Wall collision is handled separately by checkWallCollision (below).
    return null
  }

  // Indoor placement — check if item fits properly inside the zone.
  // Wall thickness margin: zone polygon edges sit on wall center lines,
  // so inset by half wall thickness + clearance to prevent visual clipping.
  const maxWallThick = getMaxWallThickness(levelId)
  const WALL_INSET = maxWallThick / 2 + 0.02 // half wall thickness + 2cm clearance

  const corners = getItemCorners(position, dimensions, rotation)
  const allCornersInside = corners.every(([cx, cz]) => pointInPolygon(cx, cz, centerInZone.polygon))

  if (allCornersInside) {
    // All corners inside zone. Check if any corner is in the wall thickness area
    // (between wall center line and wall inner surface).
    const cornerInWallArea = corners.some(([cx, cz]) => {
      for (let i = 0; i < centerInZone.polygon.length; i++) {
        const j = (i + 1) % centerInZone.polygon.length
        const [ax, az] = centerInZone.polygon[i]!
        const [bx, bz] = centerInZone.polygon[j]!
        const edgeDx = bx - ax
        const edgeDz = bz - az
        const len2 = edgeDx * edgeDx + edgeDz * edgeDz
        if (len2 < 0.001) continue
        const t = Math.max(0, Math.min(1, ((cx - ax) * edgeDx + (cz - az) * edgeDz) / len2))
        const projX = ax + t * edgeDx
        const projZ = az + t * edgeDz
        const dist = Math.hypot(cx - projX, cz - projZ)
        if (dist < WALL_INSET) return true
      }
      return false
    })
    if (!cornerInWallArea) {
      return null // Fully inside with safe margin — no adjustment needed
    }
    // Corner(s) in wall thickness area — fall through to clamp inward
  }

  // Indoor item with corners outside zone or in wall area — clamp to wall inner surface
  const bestZone = centerInZone

  // Compute zone AABB
  const xs = bestZone.polygon.map((p) => p[0])
  const zs = bestZone.polygon.map((p) => p[1])
  const zoneMinX = Math.min(...xs)
  const zoneMaxX = Math.max(...xs)
  const zoneMinZ = Math.min(...zs)
  const zoneMaxZ = Math.max(...zs)

  // Compute item's AABB half-extents (accounts for rotation)
  const aabb = getItemAABB(position, dimensions, rotation)
  let halfExtentX = (aabb.maxX - aabb.minX) / 2
  let halfExtentZ = (aabb.maxZ - aabb.minZ) / 2

  // For items with approximately square footprint (width ≈ depth), the base is likely
  // circular (e.g. Round Carpet, round tables). The AABB corners overshoot the actual
  // circular edge by ~41%, so reduce the effective half-extents by ~15% to better
  // approximate the inscribed circle radius (circle radius = half the square side).
  const [dimW, , dimD] = dimensions
  const isCircularFootprint = Math.abs(dimW - dimD) < 0.1 && Math.min(dimW, dimD) > 0.3
  if (isCircularFootprint) {
    halfExtentX *= 0.85
    halfExtentZ *= 0.85
  }

  // Check if item can fit in the zone at all (with wall inset)
  const usableWidth = (zoneMaxX - zoneMinX) - WALL_INSET * 2
  const usableDepth = (zoneMaxZ - zoneMinZ) - WALL_INSET * 2
  if (halfExtentX * 2 > usableWidth || halfExtentZ * 2 > usableDepth) {
    // Try without inset — item might still fit if it's nearly the room size
    if (halfExtentX * 2 > (zoneMaxX - zoneMinX) || halfExtentZ * 2 > (zoneMaxZ - zoneMinZ)) {
      return 'too-large'
    }
  }

  // Clamp center position so the AABB fits within zone AABB with wall margin.
  const clampedX = Math.max(zoneMinX + halfExtentX + WALL_INSET, Math.min(zoneMaxX - halfExtentX - WALL_INSET, x))
  const clampedZ = Math.max(zoneMinZ + halfExtentZ + WALL_INSET, Math.min(zoneMaxZ - halfExtentZ - WALL_INSET, z))

  const newPos: [number, number, number] = [clampedX, y, clampedZ]

  // Verify all corners are now inside the zone polygon
  const newCorners = getItemCorners(newPos, dimensions, rotation)
  if (newCorners.every(([cx, cz]) => pointInPolygon(cx, cz, bestZone.polygon))) {
    return {
      position: newPos,
      reason: `Position adjusted to stay within room "${bestZone.name}".`,
    }
  }

  // Last resort: place at zone center
  const centerX = (zoneMinX + zoneMaxX) / 2
  const centerZ = (zoneMinZ + zoneMaxZ) / 2
  const centerPos: [number, number, number] = [centerX, y, centerZ]
  const centerCorners = getItemCorners(centerPos, dimensions, rotation)
  if (centerCorners.every(([cx, cz]) => pointInPolygon(cx, cz, bestZone.polygon))) {
    return {
      position: centerPos,
      reason: `Position adjusted to room center of "${bestZone.name}". Original position was outside room boundaries.`,
    }
  }

  // Cannot fit even at center — item is too large for this zone shape
  return 'too-large'
}
