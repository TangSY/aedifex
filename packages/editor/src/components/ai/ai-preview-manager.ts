import {
  type AnyNode,
  type AnyNodeId,
  type JSONType,
  BuildingNode,
  CeilingNode,
  DoorNode,
  GuideNode,
  ItemNode,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  ScanNode,
  SlabNode,
  WallNode as WallSchema,
  WindowNode,
  ZoneNode,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { nanoid } from 'nanoid'
import type {
  AIOperationLog,
  ValidatedAddBuilding,
  ValidatedAddCeiling,
  ValidatedAddDoor,
  ValidatedAddGuide,
  ValidatedAddItem,
  ValidatedAddLevel,
  ValidatedAddRoof,
  ValidatedAddScan,
  ValidatedAddSlab,
  ValidatedAddWall,
  ValidatedAddWindow,
  ValidatedAddZone,
  ValidatedMoveItem,
  ValidatedOperation,
  ValidatedRemoveItem,
  ValidatedRemoveNode,
  ValidatedUpdateCeiling,
  ValidatedUpdateItem,
  ValidatedUpdateRoof,
  ValidatedUpdateSite,
  ValidatedUpdateSlab,
  ValidatedUpdateZone,
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
 * Confirm all ghost previews — make them permanent scene nodes.
 * Resumes Zundo tracking so the batch is a single undoable action.
 */
export function confirmGhostPreview(operations: ValidatedOperation[]): AIOperationLog {
  const logId = nanoid()
  const affectedNodeIds: AnyNodeId[] = []
  const createdNodeIds: AnyNodeId[] = []
  const { nodes } = useScene.getState()
  const levelId = useViewer.getState().selection.levelId

  // Pre-compute type counts once for all operations (A-P5: avoid repeated O(N) scans)
  const typeCountCache = new Map<string, number>()
  function getCachedTypeCount(type: string): number {
    let count = typeCountCache.get(type)
    if (count === undefined) {
      count = countNodesByType(nodes, type)
      typeCountCache.set(type, count)
    }
    return count
  }

  // Capture previous snapshot for undo — deep copy nodes that will be modified/removed
  const previousSnapshot: Record<AnyNodeId, AnyNode> = {}
  const removedNodesForUndo: { node: AnyNode; parentId: AnyNodeId }[] = []

  for (const op of operations) {
    if (op.status === 'invalid') continue
    if ('nodeId' in op) {
      const nodeId = (op as { nodeId: AnyNodeId }).nodeId
      if (nodeId) {
        const existingNode = nodes[nodeId]
        if (existingNode) {
          previousSnapshot[nodeId] = structuredClone(existingNode)
        }
      }
    }
  }

  // Capture removed nodes with their parent info (for re-creation on undo)
  removedNodeStates.forEach(({ node, parentId }, _nodeId) => {
    removedNodesForUndo.push({
      node: structuredClone(node),
      parentId: parentId as AnyNodeId,
    })
  })

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
        // op.asset is always set when status is 'valid' or 'adjusted'
        if (!op.asset) break
        const finalNode = ItemNode.parse({
          name: op.asset.name,
          asset: op.asset,
          position: op.position,
          rotation: op.rotation,
        })
        useScene.getState().createNode(finalNode, levelId as AnyNodeId)
        affectedNodeIds.push(finalNode.id as AnyNodeId)
        createdNodeIds.push(finalNode.id as AnyNodeId)
        break
      }
      case 'add_wall': {
        const wallCount = getCachedTypeCount('wall')
        const wall = WallSchema.parse({
          name: `Wall ${wallCount + 1}`,
          start: op.start,
          end: op.end,
          ...(op.thickness !== 0.2 ? { thickness: op.thickness } : {}),
          ...(op.height ? { height: op.height } : {}),
        })
        useScene.getState().createNode(wall, levelId as AnyNodeId)
        affectedNodeIds.push(wall.id as AnyNodeId)
        createdNodeIds.push(wall.id as AnyNodeId)
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
        createdNodeIds.push(door.id as AnyNodeId)
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
        createdNodeIds.push(window.id as AnyNodeId)
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
      case 'update_wall': {
        const original = originalNodeStates.get(op.nodeId)
        if (original) {
          useScene.getState().updateNode(op.nodeId, { metadata: original.metadata })
        }
        const updates: Record<string, unknown> = {
          metadata: stripTransientMetadata(nodes[op.nodeId]?.metadata) as Record<string, never>,
        }
        if (op.height !== undefined) updates.height = op.height
        if (op.thickness !== undefined) updates.thickness = op.thickness
        if (op.start) updates.start = op.start
        if (op.end) updates.end = op.end
        useScene.getState().updateNode(op.nodeId, updates)
        affectedNodeIds.push(op.nodeId)
        break
      }
      case 'update_door':
      case 'update_window': {
        const original = originalNodeStates.get(op.nodeId)
        if (original) {
          useScene.getState().updateNode(op.nodeId, { metadata: original.metadata })
        }
        const dwUpdates: Record<string, unknown> = {
          metadata: stripTransientMetadata(nodes[op.nodeId]?.metadata) as Record<string, never>,
        }
        if (op.width !== undefined) dwUpdates.width = op.width
        if (op.height !== undefined) dwUpdates.height = op.height
        if ('localX' in op && op.localX !== undefined) {
          const pos = (nodes[op.nodeId] as { position?: number[] })?.position ?? [0, 0, 0]
          dwUpdates.position = [op.localX, pos[1], 0]
        }
        if ('localY' in op && op.localY !== undefined) {
          const pos = (nodes[op.nodeId] as { position?: number[] })?.position ?? [0, 0, 0]
          dwUpdates.position = [pos[0], op.localY, 0]
        }
        if ('side' in op && op.side !== undefined) dwUpdates.side = op.side
        if ('hingesSide' in op && op.hingesSide !== undefined) dwUpdates.hingesSide = op.hingesSide
        if ('swingDirection' in op && op.swingDirection !== undefined) dwUpdates.swingDirection = op.swingDirection
        useScene.getState().updateNode(op.nodeId, dwUpdates)
        affectedNodeIds.push(op.nodeId)
        break
      }
      case 'add_level': {
        const levelOp = op as ValidatedAddLevel
        const levelNode = LevelNode.parse({
          name: levelOp.name ?? `Level ${levelOp.level}`,
          level: levelOp.level,
        })
        useScene.getState().createNode(levelNode, levelOp.buildingId)
        affectedNodeIds.push(levelNode.id as AnyNodeId)
        createdNodeIds.push(levelNode.id as AnyNodeId)
        // Auto-switch to the new level
        useViewer.getState().setSelection({ levelId: levelNode.id })
        break
      }
      case 'add_slab': {
        const slabOp = op as ValidatedAddSlab
        const slabNode = SlabNode.parse({
          name: `Slab ${getCachedTypeCount('slab') + 1}`,
          polygon: slabOp.polygon,
          elevation: slabOp.elevation,
          holes: slabOp.holes,
        })
        useScene.getState().createNode(slabNode, levelId as AnyNodeId)
        affectedNodeIds.push(slabNode.id as AnyNodeId)
        createdNodeIds.push(slabNode.id as AnyNodeId)
        break
      }
      case 'update_slab': {
        const uSlabOp = op as ValidatedUpdateSlab
        const updates: Record<string, unknown> = {}
        if (uSlabOp.elevation !== undefined) updates.elevation = uSlabOp.elevation
        if (uSlabOp.polygon) updates.polygon = uSlabOp.polygon
        useScene.getState().updateNode(uSlabOp.nodeId, updates)
        affectedNodeIds.push(uSlabOp.nodeId)
        break
      }
      case 'add_ceiling': {
        const ceilOp = op as ValidatedAddCeiling
        const ceilNode = CeilingNode.parse({
          name: `Ceiling ${getCachedTypeCount('ceiling') + 1}`,
          polygon: ceilOp.polygon,
          height: ceilOp.height,
          ...(ceilOp.material ? { material: ceilOp.material } : {}),
        })
        useScene.getState().createNode(ceilNode, levelId as AnyNodeId)
        affectedNodeIds.push(ceilNode.id as AnyNodeId)
        createdNodeIds.push(ceilNode.id as AnyNodeId)
        break
      }
      case 'update_ceiling': {
        const uCeilOp = op as ValidatedUpdateCeiling
        const updates: Record<string, unknown> = {}
        if (uCeilOp.height !== undefined) updates.height = uCeilOp.height
        if (uCeilOp.material) updates.material = uCeilOp.material
        useScene.getState().updateNode(uCeilOp.nodeId, updates)
        affectedNodeIds.push(uCeilOp.nodeId)
        break
      }
      case 'add_roof': {
        const roofOp = op as ValidatedAddRoof
        const roofCount = getCachedTypeCount('roof')
        const segment = RoofSegmentNode.parse({
          width: roofOp.width,
          depth: roofOp.depth,
          roofType: roofOp.roofType,
          roofHeight: roofOp.roofHeight,
          wallHeight: roofOp.wallHeight,
          overhang: roofOp.overhang,
          position: [0, 0, 0],
        })
        const roof = RoofNode.parse({
          name: `Roof ${roofCount + 1}`,
          position: roofOp.position,
          children: [segment.id],
        })
        const { createNodes } = useScene.getState()
        createNodes([
          { node: roof, parentId: levelId as AnyNodeId },
          { node: segment, parentId: roof.id as AnyNodeId },
        ])
        affectedNodeIds.push(roof.id as AnyNodeId, segment.id as AnyNodeId)
        createdNodeIds.push(roof.id as AnyNodeId, segment.id as AnyNodeId)
        break
      }
      case 'update_roof': {
        const uRoofOp = op as ValidatedUpdateRoof
        const updates: Record<string, unknown> = {}
        if (uRoofOp.roofType) updates.roofType = uRoofOp.roofType
        if (uRoofOp.roofHeight !== undefined) updates.roofHeight = uRoofOp.roofHeight
        if (uRoofOp.wallHeight !== undefined) updates.wallHeight = uRoofOp.wallHeight
        if (uRoofOp.width !== undefined) updates.width = uRoofOp.width
        if (uRoofOp.depth !== undefined) updates.depth = uRoofOp.depth
        useScene.getState().updateNode(uRoofOp.nodeId, updates)
        affectedNodeIds.push(uRoofOp.nodeId)
        break
      }
      case 'add_zone': {
        const zoneOp = op as ValidatedAddZone
        const zoneNode = ZoneNode.parse({
          name: zoneOp.name ?? `Zone ${getCachedTypeCount('zone') + 1}`,
          polygon: zoneOp.polygon,
        })
        useScene.getState().createNode(zoneNode, levelId as AnyNodeId)
        affectedNodeIds.push(zoneNode.id as AnyNodeId)
        createdNodeIds.push(zoneNode.id as AnyNodeId)
        break
      }
      case 'update_zone': {
        const uZoneOp = op as ValidatedUpdateZone
        const updates: Record<string, unknown> = {}
        if (uZoneOp.polygon) updates.polygon = uZoneOp.polygon
        if (uZoneOp.name) updates.name = uZoneOp.name
        useScene.getState().updateNode(uZoneOp.nodeId, updates)
        affectedNodeIds.push(uZoneOp.nodeId)
        break
      }
      case 'add_building': {
        const bldOp = op as ValidatedAddBuilding
        // Find site node
        const site = Object.values(nodes).find(n => n.type === 'site')
        const bldCount = getCachedTypeCount('building')
        // Create building with initial Level 0
        const initialLevel = LevelNode.parse({ level: 0, name: 'Level 0' })
        const building = BuildingNode.parse({
          name: bldOp.name ?? `Building ${bldCount + 1}`,
          position: bldOp.position,
          children: [initialLevel.id],
        })
        const parentId = site ? site.id as AnyNodeId : levelId as AnyNodeId
        const { createNodes } = useScene.getState()
        createNodes([
          { node: building, parentId },
          { node: initialLevel, parentId: building.id as AnyNodeId },
        ])
        affectedNodeIds.push(building.id as AnyNodeId, initialLevel.id as AnyNodeId)
        createdNodeIds.push(building.id as AnyNodeId, initialLevel.id as AnyNodeId)
        // Switch to the new building's Level 0
        useViewer.getState().setSelection({ levelId: initialLevel.id })
        break
      }
      case 'update_site': {
        const uSiteOp = op as ValidatedUpdateSite
        if (uSiteOp.polygon) {
          useScene.getState().updateNode(uSiteOp.nodeId, { polygon: uSiteOp.polygon })
          affectedNodeIds.push(uSiteOp.nodeId)
        }
        break
      }
      case 'add_scan': {
        const scanOp = op as ValidatedAddScan
        const scanNode = ScanNode.parse({
          name: `Scan ${getCachedTypeCount('scan') + 1}`,
          url: scanOp.url,
          position: scanOp.position,
          scale: [scanOp.scale, scanOp.scale, scanOp.scale],
          opacity: scanOp.opacity,
        })
        useScene.getState().createNode(scanNode, levelId as AnyNodeId)
        affectedNodeIds.push(scanNode.id as AnyNodeId)
        createdNodeIds.push(scanNode.id as AnyNodeId)
        break
      }
      case 'add_guide': {
        const guideOp = op as ValidatedAddGuide
        const guideNode = GuideNode.parse({
          name: `Guide ${getCachedTypeCount('guide') + 1}`,
          url: guideOp.url,
          position: guideOp.position,
          scale: [guideOp.scale, guideOp.scale, guideOp.scale],
          opacity: guideOp.opacity,
        })
        useScene.getState().createNode(guideNode, levelId as AnyNodeId)
        affectedNodeIds.push(guideNode.id as AnyNodeId)
        createdNodeIds.push(guideNode.id as AnyNodeId)
        break
      }
      case 'update_item': {
        const uItemOp = op as ValidatedUpdateItem
        const updates: Record<string, unknown> = {}
        if (uItemOp.scale) updates.scale = uItemOp.scale
        useScene.getState().updateNode(uItemOp.nodeId, updates)
        affectedNodeIds.push(uItemOp.nodeId)
        break
      }
    }
  }

  // Clean up state
  resetPreviewState()

  return {
    id: logId,
    messageId: '', // Caller will set this
    timestamp: Date.now(),
    operations,
    status: 'confirmed',
    affectedNodeIds,
    createdNodeIds,
    previousSnapshot,
    removedNodes: removedNodesForUndo,
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
  ghostNodeIds = []
  originalNodeStates = new Map()
  removedNodeStates = new Map()
  isPreviewActive = false
}

/**
 * Undo a previously confirmed operation by restoring the scene to its pre-operation state.
 *
 * Strategy:
 * 1. Delete all nodes that were created by this operation (createdNodeIds)
 * 2. Restore modified nodes to their previous state (previousSnapshot)
 * 3. Re-create nodes that were removed (removedNodes)
 */
export function undoConfirmedOperation(log: AIOperationLog): void {
  if (log.status !== 'confirmed') return

  // Step 1: Delete nodes that were created by this operation
  for (const nodeId of log.createdNodeIds) {
    const node = useScene.getState().nodes[nodeId]
    if (node) {
      useScene.getState().deleteNode(nodeId)
    }
  }

  // Step 2: Restore modified nodes to their previous snapshot
  const snapshotEntries = Object.entries(log.previousSnapshot) as [AnyNodeId, AnyNode][]
  for (const [nodeId, snapshot] of snapshotEntries) {
    // Skip nodes that were removed (handled in step 3)
    if (log.removedNodes.some((r) => (r.node as AnyNode & { id: AnyNodeId }).id === nodeId)) continue

    const currentNode = useScene.getState().nodes[nodeId]
    if (currentNode) {
      useScene.getState().updateNode(nodeId, snapshot as Partial<AnyNode>)
    }
  }

  // Step 3: Re-create nodes that were removed
  for (const { node, parentId } of log.removedNodes) {
    // Only re-create if the parent still exists
    const parent = useScene.getState().nodes[parentId]
    if (parent) {
      useScene.getState().createNode(node, parentId)
    }
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

function buildGhostMetadata(
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

function countNodesByType(nodes: Record<AnyNodeId, AnyNode>, type: string): number {
  return Object.values(nodes).filter((n) => n.type === type).length
}

function createGhostNode(op: ValidatedAddItem, levelId: string): AnyNodeId | null {
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

function createGhostWall(op: ValidatedAddWall, levelId: string): AnyNodeId | null {
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

function markForGhostRemoval(op: { nodeId: AnyNodeId }, nodes: Record<AnyNodeId, AnyNode>): void {
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

function applyMovePreview(op: ValidatedMoveItem, nodes: Record<AnyNodeId, AnyNode>) {
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
