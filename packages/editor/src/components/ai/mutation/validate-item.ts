import {
  type AnyNodeId,
  spatialGridManager,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { resolveCatalogSlug } from '../ai-catalog-resolver'
import type {
  AddItemToolCall,
  MoveItemToolCall,
  RemoveItemToolCall,
  UpdateItemToolCall,
  UpdateMaterialToolCall,
  ValidatedAddItem,
  ValidatedMoveItem,
  ValidatedRemoveItem,
  ValidatedUpdateItem,
  ValidatedUpdateMaterial,
} from '../types'
import { checkWallCollision, checkZoneBoundary, getItemAABB } from './collision-detection'
import { getCeilingAtPosition, getLevelHeightContext, getWallsForLevel } from './spatial-queries'

// ============================================================================
// Item Validators
// ============================================================================

export function validateAddItem(call: AddItemToolCall, _wallCache?: Map<string, import('@aedifex/core').WallNode[]>): ValidatedAddItem {
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

export function validateRemoveItem(call: RemoveItemToolCall): ValidatedRemoveItem {
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

export function validateMoveItem(call: MoveItemToolCall, _wallCache?: Map<string, import('@aedifex/core').WallNode[]>): ValidatedMoveItem {
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

export function validateUpdateMaterial(call: UpdateMaterialToolCall): ValidatedUpdateMaterial {
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

export function validateUpdateItem(call: UpdateItemToolCall): ValidatedUpdateItem {
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
// Helpers (item-specific)
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
export function findAlternativePositions(
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
export function tryAutoOffset(
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
export function guessToolType(op: Record<string, unknown>): string {
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

  // add_stair: requires stepCount or (width + length + height without roofType)
  if ('stepCount' in op && 'position' in op && Array.isArray(op.position)) {
    return 'add_stair'
  }

  // No confident match — return 'unknown' so caller marks it invalid
  return 'unknown'
}
