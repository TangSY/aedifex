import { type AnyNodeId, useScene } from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import type { ValidatedOperation } from './types'
import {
  applyMovePreview,
  buildGhostMetadata,
  createGhostDoor,
  createGhostNode,
  createGhostWall,
  createGhostWindow,
  ghostNodeIds,
  isPreviewActive,
  markForGhostRemoval,
  originalNodeStates,
  removedNodeStates,
  resetPreviewState,
  setIsPreviewActive,
} from './preview/ghost-node-helpers'

export { confirmGhostPreview, undoConfirmedOperation } from './preview/confirm-operations'

// ============================================================================
// Preview Manager
// Orchestrates ghost preview → confirm/reject → scene mutation.
// Reuses the draft node pattern from use-draft-node.ts:
//   - Creates transient nodes (metadata.isTransient = true)
//   - Uses Zundo pause/resume for undo isolation
// ============================================================================

// ============================================================================
// Public API
// ============================================================================

/**
 * Apply validated operations as ghost previews (transient nodes).
 * Scene changes are made while Zundo is paused (invisible to undo).
 * Returns the IDs of all affected nodes.
 */
export function applyGhostPreview(operations: ValidatedOperation[]): AnyNodeId[] {
  if (isPreviewActive) {
    clearGhostPreview()
  }

  const { nodes } = useScene.getState()
  const levelId = useViewer.getState().selection.levelId
  if (!levelId) return []

  // Pause undo tracking — ghost nodes are transient
  useScene.temporal.getState().pause()
  setIsPreviewActive(true)

  const affectedIds: AnyNodeId[] = []

  for (const op of operations) {
    if (op.status === 'invalid') continue

    switch (op.type) {
      case 'add_item': {
        const id = createGhostNode(op, levelId)
        if (id) affectedIds.push(id)
        break
      }
      case 'add_wall': {
        const id = createGhostWall(op, levelId)
        if (id) affectedIds.push(id)
        break
      }
      case 'add_door': {
        const id = createGhostDoor(op)
        if (id) affectedIds.push(id)
        break
      }
      case 'add_window': {
        const id = createGhostWindow(op)
        if (id) affectedIds.push(id)
        break
      }
      case 'remove_item': {
        markForGhostRemoval(op, nodes)
        affectedIds.push(op.nodeId)
        break
      }
      case 'remove_node': {
        markForGhostRemoval(op, nodes)
        affectedIds.push(op.nodeId)
        break
      }
      case 'move_item': {
        applyMovePreview(op, nodes)
        affectedIds.push(op.nodeId)
        break
      }
      case 'update_material': {
        // Material preview: save original, apply new material
        const node = nodes[op.nodeId]
        if (node) {
          originalNodeStates.set(op.nodeId, { ...node })
          useScene.getState().updateNode(op.nodeId, {
            metadata: {
              ...buildGhostMetadata(node.metadata, { isGhostPreview: true }),
              previewMaterial: op.material,
            },
          })
          affectedIds.push(op.nodeId)
        }
        break
      }
      case 'update_wall': {
        const wallNode = nodes[op.nodeId]
        if (wallNode) {
          originalNodeStates.set(op.nodeId, { ...wallNode })
          const updates: Record<string, unknown> = {
            metadata: buildGhostMetadata(wallNode.metadata, {}),
          }
          if (op.height !== undefined) updates.height = op.height
          if (op.thickness !== undefined) updates.thickness = op.thickness
          useScene.getState().updateNode(op.nodeId, updates)
          affectedIds.push(op.nodeId)
        }
        break
      }
      case 'update_door':
      case 'update_window': {
        const dwNode = nodes[op.nodeId]
        if (dwNode) {
          originalNodeStates.set(op.nodeId, { ...dwNode })
          const updates: Record<string, unknown> = {
            metadata: buildGhostMetadata(dwNode.metadata, {}),
          }
          if (op.width !== undefined) updates.width = op.width
          if (op.height !== undefined) updates.height = op.height
          if ('localX' in op && op.localX !== undefined) {
            updates.position = [op.localX, (dwNode as { position?: number[] }).position?.[1] ?? 0, 0]
          }
          if ('localY' in op && op.localY !== undefined) {
            const pos = (dwNode as { position?: number[] }).position ?? [0, 0, 0]
            updates.position = [pos[0], op.localY, 0]
          }
          if ('side' in op && op.side !== undefined) updates.side = op.side
          if ('hingesSide' in op && op.hingesSide !== undefined) updates.hingesSide = op.hingesSide
          if ('swingDirection' in op && op.swingDirection !== undefined) updates.swingDirection = op.swingDirection
          useScene.getState().updateNode(op.nodeId, updates)
          affectedIds.push(op.nodeId)
        }
        break
      }
      case 'add_level':
      case 'add_slab':
      case 'add_ceiling':
      case 'add_zone':
      case 'add_scan':
      case 'add_guide':
      case 'add_building': {
        // Structure creation tools — no visual ghost preview needed,
        // these create non-visual or flat geometry nodes
        break
      }
      case 'add_roof': {
        // Roof creates both container + segment — no ghost preview needed
        break
      }
      case 'update_slab':
      case 'update_ceiling':
      case 'update_roof':
      case 'update_zone':
      case 'update_site':
      case 'update_item': {
        // Update operations — handled at confirm time
        break
      }
    }
  }

  return affectedIds
}

/**
 * Reject all ghost previews — restore original scene state.
 */
export function clearGhostPreview(): void {
  if (!isPreviewActive) return

  // Delete ghost nodes
  for (const ghostId of ghostNodeIds) {
    useScene.getState().deleteNode(ghostId)
  }

  // Restore modified nodes to original state
  originalNodeStates.forEach((originalState, nodeId) => {
    if ('position' in originalState) {
      useScene.getState().updateNode(nodeId, {
        position: originalState.position as [number, number, number],
        rotation: originalState.rotation as [number, number, number],
        visible: originalState.visible,
        metadata: originalState.metadata,
      })
    }
  })

  // Restore removed nodes (make them visible again)
  removedNodeStates.forEach(({ node }, nodeId) => {
    useScene.getState().updateNode(nodeId, {
      visible: true,
      metadata: node.metadata,
    })
  })

  // Resume Zundo (we paused at the start of preview)
  useScene.temporal.getState().resume()

  resetPreviewState()
}

/**
 * Check if a ghost preview is currently active.
 */
export function isGhostPreviewActive(): boolean {
  return isPreviewActive
}

/**
 * Reset all module-level preview state.
 * Call this when the AI chat panel unmounts or the scene is fully reset.
 */
export function cleanupPreviewManager(): void {
  if (isPreviewActive) {
    clearGhostPreview()
  }
  resetPreviewState()
}
