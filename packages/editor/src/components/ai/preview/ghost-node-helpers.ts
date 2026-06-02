import {
  type AnyNode,
  type AnyNodeId,
  DoorNode,
  ItemNode,
  type JSONType,
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

/**
 * IDs of nodes that the AI has marked as pending removal (in ghost preview).
 * Interactive tools (door/window placement, move) consult this so a user
 * dragging into a previously-occupied slot is not blocked by a node that is
 * about to be deleted on confirm.
 *
 * Returns an empty set when no preview is active — cheap to call on every
 * pointer move.
 */
export function getPendingGhostRemovalIds(): ReadonlySet<string> {
  if (!isPreviewActive || removedNodeStates.size === 0) return EMPTY_REMOVAL_SET
  return new Set(removedNodeStates.keys())
}

const EMPTY_REMOVAL_SET: ReadonlySet<string> = new Set()

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
): JSONType {
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
    ...(op.curveOffset !== undefined ? { curveOffset: op.curveOffset } : {}),
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

  // Recursively save the requested node and ALL descendants so undo can fully
  // restore the subtree. Without this, cascade-deleted children (doors/windows
  // on a removed wall, items in a removed level, etc.) are gone forever after
  // the user accepts and then undoes the removal.
  const savedIds = new Set<string>()
  const stack: AnyNodeId[] = [op.nodeId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (savedIds.has(id)) continue
    savedIds.add(id)
    const target = nodes[id]
    if (!target) continue

    removedNodeStates.set(id, {
      node: { ...target },
      parentId: (target.parentId as string) ?? '',
    })

    if ('children' in target && Array.isArray(target.children)) {
      for (const childId of target.children) {
        stack.push(childId as AnyNodeId)
      }
    }
  }

  // Hide every saved node (root + descendants). If we only hid the root, a user
  // previewing "delete this wall" would see the wall vanish but its doors and
  // windows still floating in mid-air, which is confusing. Reject restores
  // visibility from the snapshot, so this stays in sync.
  for (const id of savedIds) {
    const target = nodes[id as AnyNodeId]
    if (!target) continue
    useScene.getState().updateNode(id as AnyNodeId, {
      visible: false,
      metadata: buildGhostMetadata(target.metadata, { isGhostRemoval: true }),
    })
  }
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
