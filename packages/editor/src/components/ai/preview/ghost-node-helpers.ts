import {
  type AnyNode,
  type AnyNodeId,
  type JSONType,
  DoorNode,
  ItemNode,
  WallNode as WallSchema,
  WindowNode,
  useScene,
} from '@aedifex/core'
import type { ValidatedAddDoor, ValidatedAddItem, ValidatedAddWall, ValidatedAddWindow, ValidatedMoveItem } from '../types'

// ============================================================================
// Module-level Preview State
// ============================================================================

/** IDs of nodes created as ghost previews */
export let ghostNodeIds: AnyNodeId[] = []

/** Original state of nodes that will be modified (for restore on reject) */
export let originalNodeStates: Map<AnyNodeId, AnyNode> = new Map()

/** Original state of nodes that will be removed (for restore on reject) */
export let removedNodeStates: Map<AnyNodeId, { node: AnyNode; parentId: string }> = new Map()

/** Whether we are currently in preview mode */
export let isPreviewActive = false

// ============================================================================
// State Mutators
// ============================================================================

export function setIsPreviewActive(value: boolean): void {
  isPreviewActive = value
}

export function resetPreviewState(): void {
  ghostNodeIds = []
  originalNodeStates = new Map()
  removedNodeStates = new Map()
  isPreviewActive = false
}

// ============================================================================
// Internal Helpers
// ============================================================================

export function buildGhostMetadata(
  existing: unknown,
  flags: { isGhostPreview?: boolean; isGhostRemoval?: boolean },
): { [key: string]: JSONType } {
  const base =
    typeof existing === 'object' && existing !== null ? (existing as { [key: string]: JSONType }) : {}
  return {
    ...base,
    isTransient: true,
    ...flags,
  }
}

export function countNodesByType(nodes: Record<AnyNodeId, AnyNode>, type: string): number {
  return Object.values(nodes).filter((n) => n.type === type).length
}

export function createGhostNode(op: ValidatedAddItem, levelId: string): AnyNodeId | null {
  // asset is always set for valid/adjusted operations (callers must filter out invalid)
  if (!op.asset) return null
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

export function createGhostWall(op: ValidatedAddWall, levelId: string): AnyNodeId | null {
  const { nodes } = useScene.getState()
  const wallCount = countNodesByType(nodes, 'wall')
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

export function createGhostDoor(op: ValidatedAddDoor): AnyNodeId | null {
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

export function createGhostWindow(op: ValidatedAddWindow): AnyNodeId | null {
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

export function markForGhostRemoval(op: { nodeId: AnyNodeId }, nodes: Record<AnyNodeId, AnyNode>): void {
  const node = nodes[op.nodeId]
  if (!node) return

  removedNodeStates.set(op.nodeId, {
    node: { ...node },
    parentId: (node.parentId as string) ?? '',
  })

  // Hide the node (don't delete — we need to restore on reject)
  useScene.getState().updateNode(op.nodeId, {
    visible: false,
    metadata: buildGhostMetadata(node.metadata, { isGhostRemoval: true }),
  })
}

export function applyMovePreview(op: ValidatedMoveItem, nodes: Record<AnyNodeId, AnyNode>): void {
  const node = nodes[op.nodeId]
  if (!node || !('position' in node)) return

  // Save original state
  originalNodeStates.set(op.nodeId, { ...node })

  // Apply preview position
  useScene.getState().updateNode(op.nodeId, {
    position: op.position,
    rotation: op.rotation,
    metadata: buildGhostMetadata(node.metadata, { isGhostPreview: true }),
  })
}

export function stripTransientMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata !== 'object' || metadata === null) return {}
  const { isTransient, isGhostPreview, isGhostRemoval, previewMaterial, ...rest } =
    metadata as Record<string, unknown>
  return rest
}
