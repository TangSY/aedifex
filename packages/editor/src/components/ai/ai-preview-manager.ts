import {
  type AnyNode,
  type AnyNodeId,
  DoorNode,
  ItemNode,
  WallNode as WallSchema,
  WindowNode,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { nanoid } from 'nanoid'
import type {
  AIOperationLog,
  ValidatedAddDoor,
  ValidatedAddItem,
  ValidatedAddWall,
  ValidatedAddWindow,
  ValidatedMoveItem,
  ValidatedOperation,
  ValidatedRemoveItem,
  ValidatedRemoveNode,
} from './types'

// ============================================================================
// Preview Manager
// Orchestrates ghost preview → confirm/reject → scene mutation.
// Reuses the draft node pattern from use-draft-node.ts:
//   - Creates transient nodes (metadata.isTransient = true)
//   - Uses Zundo pause/resume for undo isolation
// ============================================================================

/** IDs of nodes created as ghost previews */
let ghostNodeIds: AnyNodeId[] = []

/** Original state of nodes that will be modified (for restore on reject) */
let originalNodeStates: Map<AnyNodeId, AnyNode> = new Map()

/** Original state of nodes that will be removed (for restore on reject) */
let removedNodeStates: Map<AnyNodeId, { node: AnyNode; parentId: string }> = new Map()

/** Whether we are currently in preview mode */
let isPreviewActive = false

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
  isPreviewActive = true

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
        markForRemoval(op, nodes)
        affectedIds.push(op.nodeId)
        break
      }
      case 'remove_node': {
        markNodeForRemoval(op, nodes)
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
              ...(typeof node.metadata === 'object' ? node.metadata : {}),
              isTransient: true,
              previewMaterial: op.material,
            },
          })
          affectedIds.push(op.nodeId)
        }
        break
      }
    }
  }

  return affectedIds
}

/**
 * Confirm all ghost previews — make them permanent scene nodes.
 * Resumes Zundo tracking so the batch is a single undoable action.
 */
export function confirmGhostPreview(operations: ValidatedOperation[]): AIOperationLog {
  const logId = nanoid()
  const affectedNodeIds: AnyNodeId[] = []
  const { nodes } = useScene.getState()
  const levelId = useViewer.getState().selection.levelId

  // Step 1: Delete ghost nodes while still paused
  for (const ghostId of ghostNodeIds) {
    useScene.getState().deleteNode(ghostId)
  }

  // Step 2: Resume Zundo — everything from here is tracked
  useScene.temporal.getState().resume()

  // Step 3: Create final nodes for all operations
  for (const op of operations) {
    if (op.status === 'invalid') continue

    switch (op.type) {
      case 'add_item': {
        const finalNode = ItemNode.parse({
          name: op.asset.name,
          asset: op.asset,
          position: op.position,
          rotation: op.rotation,
        })
        useScene.getState().createNode(finalNode, levelId as AnyNodeId)
        affectedNodeIds.push(finalNode.id as AnyNodeId)
        break
      }
      case 'add_wall': {
        const wallCount = Object.values(nodes).filter((n) => n.type === 'wall').length
        const wall = WallSchema.parse({
          name: `Wall ${wallCount + 1}`,
          start: op.start,
          end: op.end,
          ...(op.thickness !== 0.2 ? { thickness: op.thickness } : {}),
          ...(op.height ? { height: op.height } : {}),
        })
        useScene.getState().createNode(wall, levelId as AnyNodeId)
        affectedNodeIds.push(wall.id as AnyNodeId)
        break
      }
      case 'add_door': {
        const door = DoorNode.parse({
          position: [op.localX, op.localY, 0],
          rotation: [0, 0, 0],
          side: op.side,
          wallId: op.wallId,
          parentId: op.wallId,
          width: op.width,
          height: op.height,
          hingesSide: op.hingesSide,
          swingDirection: op.swingDirection,
        })
        useScene.getState().createNode(door, op.wallId)
        affectedNodeIds.push(door.id as AnyNodeId)
        break
      }
      case 'add_window': {
        const window = WindowNode.parse({
          position: [op.localX, op.localY, 0],
          rotation: [0, 0, 0],
          side: op.side,
          wallId: op.wallId,
          parentId: op.wallId,
          width: op.width,
          height: op.height,
        })
        useScene.getState().createNode(window, op.wallId)
        affectedNodeIds.push(window.id as AnyNodeId)
        break
      }
      case 'remove_item':
      case 'remove_node': {
        // Restore the node first (it was hidden during preview), then delete it
        const saved = removedNodeStates.get(op.nodeId)
        if (saved) {
          const currentNode = nodes[op.nodeId]
          if (currentNode) {
            useScene.getState().updateNode(op.nodeId, {
              visible: true,
              metadata: saved.node.metadata,
            })
          }
        }
        useScene.getState().deleteNode(op.nodeId)
        affectedNodeIds.push(op.nodeId)
        break
      }
      case 'move_item': {
        // Restore original state first, then apply final move
        const original = originalNodeStates.get(op.nodeId)
        if (original && 'position' in original) {
          useScene.getState().updateNode(op.nodeId, {
            position: original.position as [number, number, number],
            rotation: original.rotation as [number, number, number],
            metadata: original.metadata,
          })
        }
        // Apply final position
        useScene.getState().updateNode(op.nodeId, {
          position: op.position,
          rotation: op.rotation,
          metadata: stripTransientMetadata(nodes[op.nodeId]?.metadata) as Record<string, never>,
        })
        affectedNodeIds.push(op.nodeId)
        break
      }
      case 'update_material': {
        // Restore original, then apply material
        const original = originalNodeStates.get(op.nodeId)
        if (original) {
          useScene.getState().updateNode(op.nodeId, {
            metadata: original.metadata,
          })
        }
        useScene.getState().updateNode(op.nodeId, {
          metadata: stripTransientMetadata(nodes[op.nodeId]?.metadata) as Record<string, never>,
          // material: op.material, // Material field depends on node schema
        })
        affectedNodeIds.push(op.nodeId)
        break
      }
    }
  }

  // Step 4: Re-pause for next preview cycle
  useScene.temporal.getState().pause()

  // Clean up state
  resetPreviewState()

  return {
    id: logId,
    messageId: '', // Caller will set this
    timestamp: Date.now(),
    operations,
    status: 'confirmed',
    affectedNodeIds,
  }
}

/**
 * Reject all ghost previews — restore original scene state.
 */
export function clearGhostPreview() {
  if (!isPreviewActive) return

  // Delete ghost nodes
  for (const ghostId of ghostNodeIds) {
    useScene.getState().deleteNode(ghostId)
  }

  // Restore modified nodes to original state
  for (const [nodeId, originalState] of originalNodeStates) {
    if ('position' in originalState) {
      useScene.getState().updateNode(nodeId, {
        position: originalState.position as [number, number, number],
        rotation: originalState.rotation as [number, number, number],
        visible: originalState.visible,
        metadata: originalState.metadata,
      })
    }
  }

  // Restore removed nodes (make them visible again)
  for (const [nodeId, { node }] of removedNodeStates) {
    useScene.getState().updateNode(nodeId, {
      visible: true,
      metadata: node.metadata,
    })
  }

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

// ============================================================================
// Internal Helpers
// ============================================================================

function createGhostNode(op: ValidatedAddItem, levelId: string): AnyNodeId | null {
  const node = ItemNode.parse({
    name: op.asset.name,
    asset: op.asset,
    position: op.position,
    rotation: op.rotation,
    metadata: { isTransient: true, isGhostPreview: true },
  })

  useScene.getState().createNode(node, levelId as AnyNodeId)
  ghostNodeIds.push(node.id as AnyNodeId)
  return node.id as AnyNodeId
}

function createGhostWall(op: ValidatedAddWall, levelId: string): AnyNodeId | null {
  const { nodes } = useScene.getState()
  const wallCount = Object.values(nodes).filter((n) => n.type === 'wall').length
  const wall = WallSchema.parse({
    name: `Wall ${wallCount + 1}`,
    start: op.start,
    end: op.end,
    ...(op.thickness !== 0.2 ? { thickness: op.thickness } : {}),
    ...(op.height ? { height: op.height } : {}),
    metadata: { isTransient: true, isGhostPreview: true },
  })
  useScene.getState().createNode(wall, levelId as AnyNodeId)
  ghostNodeIds.push(wall.id as AnyNodeId)
  return wall.id as AnyNodeId
}

function createGhostDoor(op: ValidatedAddDoor): AnyNodeId | null {
  const door = DoorNode.parse({
    position: [op.localX, op.localY, 0],
    rotation: [0, 0, 0],
    side: op.side,
    wallId: op.wallId,
    parentId: op.wallId,
    width: op.width,
    height: op.height,
    hingesSide: op.hingesSide,
    swingDirection: op.swingDirection,
    metadata: { isTransient: true, isGhostPreview: true },
  })
  useScene.getState().createNode(door, op.wallId)
  ghostNodeIds.push(door.id as AnyNodeId)
  return door.id as AnyNodeId
}

function createGhostWindow(op: ValidatedAddWindow): AnyNodeId | null {
  const window = WindowNode.parse({
    position: [op.localX, op.localY, 0],
    rotation: [0, 0, 0],
    side: op.side,
    wallId: op.wallId,
    parentId: op.wallId,
    width: op.width,
    height: op.height,
    metadata: { isTransient: true, isGhostPreview: true },
  })
  useScene.getState().createNode(window, op.wallId)
  ghostNodeIds.push(window.id as AnyNodeId)
  return window.id as AnyNodeId
}

function markNodeForRemoval(op: ValidatedRemoveNode, nodes: Record<AnyNodeId, AnyNode>) {
  const node = nodes[op.nodeId]
  if (!node) return

  removedNodeStates.set(op.nodeId, {
    node: { ...node },
    parentId: (node.parentId as string) ?? '',
  })

  useScene.getState().updateNode(op.nodeId, {
    visible: false,
    metadata: {
      ...(typeof node.metadata === 'object' ? node.metadata : {}),
      isTransient: true,
      isGhostRemoval: true,
    },
  })
}

function markForRemoval(op: ValidatedRemoveItem, nodes: Record<AnyNodeId, AnyNode>) {
  const node = nodes[op.nodeId]
  if (!node) return

  removedNodeStates.set(op.nodeId, {
    node: { ...node },
    parentId: (node.parentId as string) ?? '',
  })

  // Hide the node (don't delete — we need to restore on reject)
  useScene.getState().updateNode(op.nodeId, {
    visible: false,
    metadata: {
      ...(typeof node.metadata === 'object' ? node.metadata : {}),
      isTransient: true,
      isGhostRemoval: true,
    },
  })
}

function applyMovePreview(op: ValidatedMoveItem, nodes: Record<AnyNodeId, AnyNode>) {
  const node = nodes[op.nodeId]
  if (!node || !('position' in node)) return

  // Save original state
  originalNodeStates.set(op.nodeId, { ...node })

  // Apply preview position
  useScene.getState().updateNode(op.nodeId, {
    position: op.position,
    rotation: op.rotation,
    metadata: {
      ...(typeof node.metadata === 'object' ? node.metadata : {}),
      isTransient: true,
      isGhostPreview: true,
    },
  })
}

function stripTransientMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata !== 'object' || metadata === null) return {}
  const { isTransient, isGhostPreview, isGhostRemoval, previewMaterial, ...rest } =
    metadata as Record<string, unknown>
  return rest
}

function resetPreviewState() {
  ghostNodeIds = []
  originalNodeStates = new Map()
  removedNodeStates = new Map()
  isPreviewActive = false
}
