import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  CeilingNode,
  cloneLevelSubtree,
  DoorNode,
  GuideNode,
  ItemNode,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  ScanNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
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
  ValidatedAddGuide,
  ValidatedAddLevel,
  ValidatedAddRoof,
  ValidatedAddScan,
  ValidatedAddSlab,
  ValidatedAddStair,
  ValidatedAddZone,
  ValidatedOperation,
  ValidatedUpdateCeiling,
  ValidatedCloneLevel,
  ValidatedEnterWalkthrough,
  ValidatedMoveBuilding,
  ValidatedUpdateItem,
  ValidatedUpdateRoof,
  ValidatedUpdateSite,
  ValidatedUpdateSlab,
  ValidatedUpdateStair,
  ValidatedUpdateZone,
} from '../types'
import {
  countNodesByType,
  ghostNodeIds,
  originalNodeStates,
  removedNodeStates,
  resetPreviewState,
  stripTransientMetadata,
} from './ghost-node-helpers'

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
      case 'add_stair': {
        const stairOp = op as ValidatedAddStair
        const stairCount = getCachedTypeCount('stair')
        const segment = StairSegmentNode.parse({
          segmentType: 'stair',
          width: stairOp.width,
          length: stairOp.length,
          height: stairOp.height,
          stepCount: stairOp.stepCount,
          attachmentSide: 'front',
          fillToFloor: true,
          position: [0, 0, 0],
        })
        const stair = StairNode.parse({
          name: `Staircase ${stairCount + 1}`,
          position: stairOp.position,
          rotation: stairOp.rotation,
          children: [segment.id],
        })
        const { createNodes } = useScene.getState()
        createNodes([
          { node: stair, parentId: levelId as AnyNodeId },
          { node: segment, parentId: stair.id as AnyNodeId },
        ])
        affectedNodeIds.push(stair.id as AnyNodeId, segment.id as AnyNodeId)
        createdNodeIds.push(stair.id as AnyNodeId, segment.id as AnyNodeId)
        break
      }
      case 'update_stair': {
        const uStairOp = op as ValidatedUpdateStair
        // Update stair container (position, rotation)
        const stairUpdates: Record<string, unknown> = {}
        if (uStairOp.position) stairUpdates.position = uStairOp.position
        if (uStairOp.rotation !== undefined) stairUpdates.rotation = uStairOp.rotation
        if (Object.keys(stairUpdates).length > 0) {
          useScene.getState().updateNode(uStairOp.nodeId, stairUpdates)
        }
        // Update first child segment (width, length, height, stepCount)
        const stairNode = nodes[uStairOp.nodeId]
        if (stairNode && 'children' in stairNode && Array.isArray(stairNode.children) && stairNode.children.length > 0) {
          const firstSegId = stairNode.children[0] as AnyNodeId
          const segUpdates: Record<string, unknown> = {}
          if (uStairOp.width !== undefined) segUpdates.width = uStairOp.width
          if (uStairOp.length !== undefined) segUpdates.length = uStairOp.length
          if (uStairOp.height !== undefined) segUpdates.height = uStairOp.height
          if (uStairOp.stepCount !== undefined) segUpdates.stepCount = uStairOp.stepCount
          if (Object.keys(segUpdates).length > 0) {
            useScene.getState().updateNode(firstSegId, segUpdates)
            affectedNodeIds.push(firstSegId)
          }
        }
        affectedNodeIds.push(uStairOp.nodeId)
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
      case 'move_building': {
        const mbOp = op as ValidatedMoveBuilding
        const updates: Record<string, unknown> = {}
        if (mbOp.position) updates.position = mbOp.position
        if (mbOp.rotationY !== undefined) updates.rotation = [0, mbOp.rotationY, 0]
        useScene.getState().updateNode(mbOp.nodeId, updates)
        affectedNodeIds.push(mbOp.nodeId)
        break
      }
      case 'clone_level': {
        const clOp = op as ValidatedCloneLevel
        const { clonedNodes, newLevelId } = cloneLevelSubtree(nodes, clOp.levelId)
        // Find the parent building of the source level
        const sourceLevel = nodes[clOp.levelId]
        const parentBuildingId = sourceLevel?.parentId as AnyNodeId | undefined
        if (parentBuildingId) {
          const { createNodes } = useScene.getState()
          // Set name and level number on the cloned level
          const existingLevels = Object.values(nodes).filter(n => n.type === 'level' && n.parentId === parentBuildingId)
          const newLevelNum = existingLevels.length
          const clonedLevelNode = clonedNodes.find(n => n.id === newLevelId)
          if (clonedLevelNode && 'level' in clonedLevelNode) {
            (clonedLevelNode as any).level = newLevelNum
            if (clOp.name) (clonedLevelNode as any).name = clOp.name
          }
          // Create all cloned nodes, first the level under the building, then children
          const levelNode = clonedNodes.find(n => n.id === newLevelId)!
          const childNodes = clonedNodes.filter(n => n.id !== newLevelId)
          createNodes([
            { node: levelNode, parentId: parentBuildingId },
            ...childNodes.map(n => ({ node: n, parentId: (n.parentId ?? newLevelId) as AnyNodeId })),
          ])
          affectedNodeIds.push(newLevelId as AnyNodeId)
          createdNodeIds.push(...clonedNodes.map(n => n.id as AnyNodeId))
          // Switch to the new level
          useViewer.getState().setSelection({ levelId: newLevelId as `level_${string}` })
        }
        break
      }
      case 'enter_walkthrough': {
        const _ewOp = op as ValidatedEnterWalkthrough
        useViewer.getState().setWalkthroughMode(true)
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
