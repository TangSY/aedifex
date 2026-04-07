import {
  type AnyNodeId,
  type WallNode,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { optimizeLayout } from './ai-layout-optimizer'
import type {
  AIToolCall,
  ToolResult,
  ValidatedAddItem,
  ValidatedOperation,
} from './types'
import { checkWallCollision, checkZoneBoundary, getItemAABB } from './mutation/collision-detection'
import {
  guessToolType,
  validateAddItem,
  validateMoveItem,
  validateRemoveItem,
  validateUpdateItem,
  validateUpdateMaterial,
} from './mutation/validate-item'
import { validateAddDoor, validateAddWindow, validateUpdateDoor, validateUpdateWindow } from './mutation/validate-opening'
import {
  validateAddBuilding,
  validateAddCeiling,
  validateAddGuide,
  validateAddLevel,
  validateAddRoof,
  validateAddScan,
  validateAddSlab,
  validateAddStair,
  validateAddZone,
  validateUpdateCeiling,
  validateUpdateRoof,
  validateUpdateSite,
  validateUpdateSlab,
  validateUpdateStair,
  validateUpdateZone,
} from './mutation/validate-structure'
import { validateAddWall, validateRemoveNode, validateUpdateWall } from './mutation/validate-wall'

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

// Re-export isValidModelUrl for external callers
export { isValidModelUrl }

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
    case 'add_stair':
      return [validateAddStair(toolCall)]
    case 'update_stair':
      return [validateUpdateStair(toolCall)]
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
