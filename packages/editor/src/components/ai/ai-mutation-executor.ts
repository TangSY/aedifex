import {
  type AnyNodeId,
  type AssetInput,
  spatialGridManager,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { resolveCatalogSlug } from './ai-catalog-resolver'
import type {
  AIToolCall,
  AddItemToolCall,
  MoveItemToolCall,
  RemoveItemToolCall,
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
  }
}

/**
 * Validate and resolve all tool calls from a message.
 */
export function validateAllToolCalls(toolCalls: AIToolCall[]): ValidatedOperation[] {
  return toolCalls.flatMap(validateToolCall)
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
