import {
  type AnyNode,
  type AnyNodeId,
  BoxVentNode,
  BuildingNode,
  CeilingNode,
  ChimneyNode,
  cloneLevelSubtree,
  CupolaNode,
  DoorNode,
  DormerNode,
  DownspoutNode,
  DuctFittingNode,
  DuctSegmentNode,
  DuctTerminalNode,
  ElevatorNode,
  EyebrowVentNode,
  FenceNode,
  generateId,
  GuideNode,
  GutterNode,
  HvacEquipmentNode,
  ItemNode,
  LevelNode,
  LinesetNode,
  LiquidLineNode,
  PipeFittingNode,
  PipeSegmentNode,
  PipeTrapNode,
  RidgeVentNode,
  RoofNode,
  RoofSegmentNode,
  ScanNode,
  SkylightNode,
  SlabNode,
  SolarPanelNode,
  StairNode,
  TurbineVentNode,
  StairSegmentNode,
  WallNode as WallSchema,
  WindowNode,
  ZoneNode,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import { nanoid } from 'nanoid'
import {
  resolveCurrentBuildingId,
  resolveElevatorSupportY,
} from '../../../lib/elevator-support'
import { getSceneOperations } from '../scene-operations-adapter'
import type {
  AIOperationLog,
  ValidatedAddBuilding,
  ValidatedAddCeiling,
  ValidatedAddCutOut,
  ValidatedAddDuctFitting,
  ValidatedAddDuctSegment,
  ValidatedAddDuctTerminal,
  ValidatedAddFence,
  ValidatedAddGuide,
  ValidatedAddHvacEquipment,
  ValidatedAddLevel,
  ValidatedAddLineset,
  ValidatedAddLiquidLine,
  ValidatedAddPipeFitting,
  ValidatedAddPipeSegment,
  ValidatedAddPipeTrap,
  ValidatedAddRoof,
  ValidatedAddScan,
  ValidatedAddSlab,
  ValidatedAddElevator,
  ValidatedAddStair,
  ValidatedAddZone,
  ValidatedAlignOpeningToNearest,
  ValidatedOperation,
  ValidatedUpdateCeiling,
  ValidatedCloneLevel,
  ValidatedMoveBuilding,
  ValidatedUpdateFence,
  ValidatedUpdateItem,
  ValidatedUpdateRoof,
  ValidatedUpdateRoofMaterial,
  ValidatedUpdateSite,
  ValidatedUpdateSlab,
  ValidatedUpdateStair,
  ValidatedUpdateStairMaterial,
  ValidatedUpdateWallMaterial,
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
 * SceneOperations 抽象层 — 所有 createNode/deleteNode/setNode/applyPatch
 * 调用都通过 ops().* 走 SceneBridge，与远程 MCP（mcp-tool-router.ts）共享
 * 同一执行路径。
 *
 * 注：updateNode 暂保留 useScene.getState().updateNode，因 bridge.updateNode
 * 在 race condition（节点已被删除）会抛错，破坏 ghost 清理路径。后续可在
 * SceneBridge 中加入 silent variant 后再迁移。
 */
const ops = () => getSceneOperations()

/**
 * Build a partial scene node update that sets either a material catalog preset
 * or an inline color material on the requested fields. Returns null when no
 * source value is provided.
 *
 * Catalog preset takes precedence over inline color when both are present.
 *
 * NOTE: MaterialSchema is { id?, preset?, properties?, texture? } — `color`
 * lives under `properties.color`, NOT at the top level. resolveMaterial() reads
 * material.properties, so writing `{ color }` directly is silently dropped.
 */
/** Whitelist of node fields that surface material writes are allowed to touch. */
type SurfaceMaterialField =
  | 'material' | 'materialPreset'
  | 'interiorMaterial' | 'interiorMaterialPreset'
  | 'exteriorMaterial' | 'exteriorMaterialPreset'
  | 'topMaterial' | 'topMaterialPreset'
  | 'edgeMaterial' | 'edgeMaterialPreset'
  | 'wallMaterial' | 'wallMaterialPreset'
  | 'railingMaterial' | 'railingMaterialPreset'
  | 'treadMaterial' | 'treadMaterialPreset'
  | 'sideMaterial' | 'sideMaterialPreset'

function applySurfaceMaterialUpdate(input: {
  preset?: string
  color?: string
  presetField: SurfaceMaterialField
  materialField: SurfaceMaterialField
}): Record<string, unknown> | null {
  const { preset, color, presetField, materialField } = input
  if (preset) {
    return {
      [presetField]: preset,
      [materialField]: undefined,
    }
  }
  if (color) {
    return {
      [presetField]: undefined,
      [materialField]: { properties: { color } },
    }
  }
  return null
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

  // Pre-compute type counts once for all operations (avoid repeated O(N) scans)
  const typeCountCache = new Map<string, number>()
  function getCachedTypeCount(type: string): number {
    let count = typeCountCache.get(type)
    if (count === undefined) {
      count = countNodesByType(nodes, type)
      typeCountCache.set(type, count)
    }
    return count
  }

  // Capture previous snapshot for undo — deep copy nodes that will be modified/removed.
  // CRITICAL: strip transient metadata (isGhostPreview, isTransient, previewMaterial)
  // before storing. The snapshot is read at preview-application time, so the node
  // already carries those flags. Undo restores via setNode (full replace), which
  // would otherwise permanently embed transient flags into the post-undo state.
  const previousSnapshot: Record<AnyNodeId, AnyNode> = {}
  const removedNodesForUndo: { node: AnyNode; parentId: AnyNodeId }[] = []

  const cleanSnapshot = (node: AnyNode): AnyNode => {
    const cloned = structuredClone(node)
    // metadata is JSONType (recursive). The strip returns a plain object whose
    // values came from a JSONType, so the shape is JSON-compatible at runtime —
    // cast through unknown to satisfy the recursive type.
    ;(cloned as { metadata?: unknown }).metadata = stripTransientMetadata(
      (cloned as { metadata?: unknown }).metadata,
    ) as unknown as AnyNode['metadata']
    return cloned
  }

  for (const op of operations) {
    if (op.status === 'invalid') continue
    if ('nodeId' in op) {
      const nodeId = (op as { nodeId: AnyNodeId }).nodeId
      if (nodeId) {
        const existingNode = nodes[nodeId]
        if (existingNode) {
          previousSnapshot[nodeId] = cleanSnapshot(existingNode)
        }
      }
    }
    // Downspout ops mutate their host gutter (outlet drilling) through
    // gutterId without carrying a nodeId, so the generic capture above
    // misses the gutter entirely. Snapshot it here or undo leaves an
    // orphaned outlet hole in the gutter after the downspout is deleted.
    if ('gutterId' in op) {
      const gutterId = (op as { gutterId?: AnyNodeId }).gutterId
      if (gutterId && !previousSnapshot[gutterId]) {
        const gutterNode = nodes[gutterId]
        if (gutterNode) {
          previousSnapshot[gutterId] = cleanSnapshot(gutterNode)
        }
      }
    }
  }

  // Capture removed nodes with their parent info (for re-creation on undo).
  // Same metadata strip — the saved snapshot in markForGhostRemoval may contain
  // ghost flags from a prior partial preview.
  removedNodeStates.forEach(({ node, parentId }, _nodeId) => {
    removedNodesForUndo.push({
      node: cleanSnapshot(node),
      parentId: parentId as AnyNodeId,
    })
  })

  // Step 1: Delete ghost nodes while still paused
  for (const ghostId of ghostNodeIds) {
    ops().deleteNode(ghostId)
  }

  // Step 2: Resume Zundo — everything from here is tracked as a single undo batch
  useScene.temporal.getState().resume()

  // Step 3: Collect all node creations for batch execution (single undo record)
  const batchCreates: { node: import('@aedifex/core').AnyNode; parentId: AnyNodeId }[] = []

  // Wrap the entire operation loop in try/catch/finally so that:
  //   1. A single MEP Node.parse() ZodError does not abort the whole batch —
  //      each per-op parse is guarded individually via try/catch below.
  //   2. Any other unexpected throw (e.g. a race where a node was deleted
  //      between validator and executor) still hits the finally block, which
  //      guarantees resetPreviewState() runs — otherwise ghost nodes and
  //      transient metadata would leak into the persistent scene.
  try {
  for (const op of operations) {
    if (op.status === 'invalid') continue

    switch (op.type) {
      case 'add_item': {
        if (!op.asset) break
        const finalNode = ItemNode.parse({
          name: op.asset.name,
          asset: op.asset,
          position: op.position,
          rotation: op.rotation,
        })
        batchCreates.push({ node: finalNode, parentId: (op.levelId ?? levelId) as AnyNodeId })
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
          ...(op.curveOffset !== undefined ? { curveOffset: op.curveOffset } : {}),
        })
        batchCreates.push({ node: wall, parentId: (op.levelId ?? levelId) as AnyNodeId })
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
        batchCreates.push({ node: door, parentId: op.wallId })
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
        batchCreates.push({ node: window, parentId: op.wallId })
        affectedNodeIds.push(window.id as AnyNodeId)
        createdNodeIds.push(window.id as AnyNodeId)
        break
      }
      case 'remove_item':
      case 'remove_node': {
        // Skip silently if an earlier op in this batch already cascade-removed
        // the target. The AI often enumerates parents (walls) AND their
        // children (windows, doors) explicitly in a "clear" intent; with
        // cascade=true the parent delete sweeps the children out, and the
        // child-delete iterations below would otherwise throw "node not
        // found" and abort the whole batch. The user's intent is satisfied
        // either way, so no-op is correct.
        const liveNodes = useScene.getState().nodes
        if (!liveNodes[op.nodeId]) {
          break
        }
        // Restore the node first (it was hidden during preview), then delete it.
        // cascade=true because the AI's remove ops typically target a parent
        // (wall, level, building) that owns children (windows, slabs); without
        // cascade the scene bridge guard throws "node has N descendant(s);
        // pass cascade: true to delete recursively" and the whole confirm
        // batch fails. The AI flow is a considered batch — recursive removal
        // is the intended semantics, unlike the panel-level single-delete UX
        // where the user gets warned about children first.
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
        ops().deleteNode(op.nodeId, true)
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
        // Restore original, then apply material to the node's `material` field.
        // The `material` field is the legacy single-face slot present on every
        // structural/furniture node. For per-side/per-role materials use the
        // dedicated update_wall_material/update_roof_material/update_stair_material
        // tools instead.
        const original = originalNodeStates.get(op.nodeId)
        if (original) {
          useScene.getState().updateNode(op.nodeId, {
            metadata: original.metadata,
          })
        }
        // Decide preset vs inline color: catalog ids never start with '#' and are
        // resolvable by getCatalogMaterialById, hex colors always start with '#'.
        // Accept only canonical hex lengths (3/4/6/8) — bare 5/7-char hex isn't valid CSS.
        const isHexColor = typeof op.material === 'string'
          && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(op.material)
        const materialUpdate: Record<string, unknown> = isHexColor
          ? { materialPreset: undefined, material: { properties: { color: op.material } } }
          : { material: undefined, materialPreset: op.material }
        useScene.getState().updateNode(op.nodeId, {
          metadata: stripTransientMetadata(nodes[op.nodeId]?.metadata) as Record<string, never>,
          ...materialUpdate,
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
        if (op.curveOffset !== undefined) updates.curveOffset = op.curveOffset
        useScene.getState().updateNode(op.nodeId, updates)
        affectedNodeIds.push(op.nodeId)

        // Symmetric to validateAddCeiling's R3 rule ("ceiling height matches wall height"):
        // when a wall's height changes, propagate to every ceiling on the same level so
        // the room volume stays consistent. Caught by QA-AI 2026-05-01 v3 Issue-C.
        if (op.height !== undefined) {
          const wallNode = nodes[op.nodeId] as { parentId?: string } | undefined
          const levelId = wallNode?.parentId
          if (levelId) {
            for (const [id, n] of Object.entries(nodes)) {
              if (n && (n as { type?: string }).type === 'ceiling' && (n as { parentId?: string }).parentId === levelId) {
                const currentHeight = (n as { height?: number }).height
                if (currentHeight !== op.height) {
                  useScene.getState().updateNode(id as AnyNodeId, { height: op.height })
                  affectedNodeIds.push(id as AnyNodeId)
                }
              }
            }
          }
        }
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
        // Validate buildingId. AI tools occasionally pass a stale or
        // missing buildingId, which previously created a level with
        // parentId=null (an orphan) — invisible in the level selector
        // and a source of stacking bugs. Fall back to the first building.
        let targetBuildingId = levelOp.buildingId
        const target = nodes[targetBuildingId]
        if (!target || target.type !== 'building') {
          const fallback = Object.values(nodes).find(
            (n) => n.type === 'building',
          ) as BuildingNode | undefined
          if (!fallback) {
            console.warn(
              '[add_level] No building exists in scene; skipping operation',
            )
            break
          }
          console.warn(
            `[add_level] buildingId ${levelOp.buildingId} not found, falling back to ${fallback.id}`,
          )
          targetBuildingId = fallback.id
        }
        const levelNode = LevelNode.parse({
          name: levelOp.name ?? `Level ${levelOp.level}`,
          level: levelOp.level,
        })
        ops().createNode(levelNode, targetBuildingId)
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
        ops().createNode(slabNode, (slabOp.levelId ?? levelId) as AnyNodeId)
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
        ops().createNode(ceilNode, (ceilOp.levelId ?? levelId) as AnyNodeId)
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
          { node: roof, parentId: (roofOp.levelId ?? levelId) as AnyNodeId },
          { node: segment, parentId: roof.id as AnyNodeId },
        ])
        affectedNodeIds.push(roof.id as AnyNodeId, segment.id as AnyNodeId)
        createdNodeIds.push(roof.id as AnyNodeId, segment.id as AnyNodeId)
        break
      }
      case 'add_roof_accessory': {
        // biome-ignore lint/suspicious/noExplicitAny: type imported lazily
        const accOp = op as any
        const kindCount = getCachedTypeCount(accOp.kind)
        const name = `${accOp.kind.charAt(0).toUpperCase()}${accOp.kind.slice(1)} ${kindCount + 1}`
        let node: AnyNode
        switch (accOp.kind) {
          case 'chimney':
            node = ChimneyNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
              heightAboveRidge: accOp.heightAboveRidge ?? 1.0,
            })
            break
          case 'dormer':
            node = DormerNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
            })
            break
          case 'skylight':
            node = SkylightNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
            })
            break
          case 'solar-panel':
            node = SolarPanelNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
            })
            break
          case 'ridge-vent':
            node = RidgeVentNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
            })
            break
          case 'box-vent':
            node = BoxVentNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
            })
            break
          case 'turbine-vent':
            // Schema has no width/depth — the unified tool's `width` carries
            // the spinning head diameter (radially symmetric, depth ignored).
            node = TurbineVentNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              diameter: accOp.width,
            })
            break
          case 'eyebrow-vent':
            node = EyebrowVentNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
            })
            break
          case 'cupola':
            node = CupolaNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              width: accOp.width,
              depth: accOp.depth,
            })
            break
          case 'gutter':
            // position/rotation arrive eave-snapped from the validator (same
            // pose the manual tool in packages/nodes/src/gutter/tool.tsx stores).
            node = GutterNode.parse({
              name,
              roofSegmentId: accOp.roofSegmentId,
              position: accOp.position,
              rotation: accOp.rotation,
              length: accOp.length ?? 2.0,
            })
            break
          case 'downspout': {
            // Mirror packages/nodes/src/downspout/tool.tsx: drill a new outlet
            // into the host gutter at the requested offset, then drop a
            // downspout linked to it. Read the gutter LIVE (not the snapshot)
            // so several downspouts on one gutter in a single batch accumulate
            // outlets instead of overwriting each other.
            const state = useScene.getState()
            const gutter = state.nodes[accOp.gutterId as AnyNodeId]
            if (!gutter || gutter.type !== 'gutter') continue
            const outletId = generateId('outlet')
            const outlets = [
              ...(gutter.outlets ?? []),
              { id: outletId, offset: accOp.outletOffset ?? 0, diameter: 0.07 },
            ]
            state.updateNode(gutter.id as AnyNodeId, { outlets })
            state.dirtyNodes.add(gutter.id as AnyNodeId)
            affectedNodeIds.push(gutter.id as AnyNodeId)
            node = DownspoutNode.parse({
              name,
              gutterId: gutter.id,
              outletId,
              length: accOp.length ?? 2.5,
              diameter: 0.07,
            })
            break
          }
          default:
            // 防御性：validator 已挡住 unknown kind，理论不会到这
            continue
        }
        batchCreates.push({ node, parentId: accOp.roofSegmentId as AnyNodeId })
        affectedNodeIds.push(node.id as AnyNodeId)
        createdNodeIds.push(node.id as AnyNodeId)
        break
      }
      case 'add_elevator': {
        const elOp = op as ValidatedAddElevator
        // Resolve the target building from explicit op.buildingId, otherwise
        // from the active level. ElevatorNode lives under building (not level)
        // because the shaft crosses multiple levels.
        const targetBuildingId = resolveCurrentBuildingId({
          buildingId: (elOp.buildingId as BuildingNode['id'] | null | undefined) ?? null,
          levelId: (levelId ?? null) as LevelNode['id'] | null,
          nodes,
        })
        if (!targetBuildingId) {
          // No building to attach to — skip silently rather than crash. The
          // operation card will show this as a no-op; the LLM will see no
          // elevator appear in the next scene context and can retry.
          break
        }

        // Resolve service range. fromLevelId defaults to the currently selected
        // level; toLevelId defaults to the level above (sorted by level number).
        const building = nodes[targetBuildingId]
        const levels = (building && building.type === 'building' ? building.children : [])
          .map((id) => nodes[id as AnyNodeId])
          .filter((n): n is LevelNode => n?.type === 'level')
          .sort((a, b) => a.level - b.level)
        const explicitFrom = elOp.fromLevelId ?? null
        const fromIdx = explicitFrom
          ? levels.findIndex((l) => l.id === explicitFrom)
          : levels.findIndex((l) => l.id === levelId)
        const fromLevel = levels[fromIdx >= 0 ? fromIdx : 0]
        const toIdx = elOp.toLevelId
          ? levels.findIndex((l) => l.id === elOp.toLevelId)
          : Math.min((fromIdx >= 0 ? fromIdx : 0) + 1, levels.length - 1)
        const toLevel = levels[toIdx >= 0 ? toIdx : levels.length - 1] ?? fromLevel

        const supportY = resolveElevatorSupportY({
          buildingId: targetBuildingId,
          preferredLevelId: fromLevel?.id ?? null,
          x: elOp.position[0],
          z: elOp.position[2],
        })

        const elevatorCount = Object.values(nodes).filter((n) => n.type === 'elevator').length
        const elevator = ElevatorNode.parse({
          name: `Elevator ${elevatorCount + 1}`,
          parentId: targetBuildingId,
          position: [elOp.position[0], supportY, elOp.position[2]],
          rotation: elOp.rotation,
          width: elOp.width,
          depth: elOp.depth,
          cabHeight: elOp.cabHeight,
          fromLevelId: fromLevel?.id ?? null,
          toLevelId: toLevel?.id ?? fromLevel?.id ?? null,
          defaultLevelId: fromLevel?.id ?? null,
          ...(elOp.servedLevelIds ? { servedLevelIds: elOp.servedLevelIds } : {}),
          ...(elOp.shaftStyle ? { shaftStyle: elOp.shaftStyle } : {}),
          ...(elOp.doorStyle ? { doorStyle: elOp.doorStyle } : {}),
          ...(elOp.doorPanelStyle ? { doorPanelStyle: elOp.doorPanelStyle } : {}),
        })
        const { createNodes } = useScene.getState()
        createNodes([{ node: elevator, parentId: targetBuildingId }])
        affectedNodeIds.push(elevator.id as AnyNodeId)
        createdNodeIds.push(elevator.id as AnyNodeId)
        break
      }
      case 'add_stair': {
        const stairOp = op as ValidatedAddStair
        const stairCount = getCachedTypeCount('stair')
        // Curved/spiral stairs use container-level geometry only and ignore segments —
        // creating one would be dead state. Only straight stairs need a segment child.
        const isStraight = !stairOp.stairType || stairOp.stairType === 'straight'
        const segment = isStraight
          ? StairSegmentNode.parse({
              segmentType: 'stair',
              width: stairOp.width,
              length: stairOp.length,
              height: stairOp.height,
              stepCount: stairOp.stepCount,
              attachmentSide: 'front',
              fillToFloor: stairOp.fillToFloor ?? true,
              position: [0, 0, 0],
            })
          : null
        const stair = StairNode.parse({
          name: `Staircase ${stairCount + 1}`,
          position: stairOp.position,
          rotation: stairOp.rotation,
          width: stairOp.width,
          totalRise: stairOp.height,
          stepCount: stairOp.stepCount,
          children: segment ? [segment.id] : [],
          ...(stairOp.stairType ? { stairType: stairOp.stairType } : {}),
          ...(stairOp.slabOpeningMode ? { slabOpeningMode: stairOp.slabOpeningMode } : {}),
          ...(stairOp.openingOffset !== undefined ? { openingOffset: stairOp.openingOffset } : {}),
          ...(stairOp.fillToFloor !== undefined ? { fillToFloor: stairOp.fillToFloor } : {}),
          ...(stairOp.innerRadius !== undefined ? { innerRadius: stairOp.innerRadius } : {}),
          ...(stairOp.sweepAngle !== undefined ? { sweepAngle: stairOp.sweepAngle } : {}),
          ...(stairOp.topLandingMode ? { topLandingMode: stairOp.topLandingMode } : {}),
          ...(stairOp.topLandingDepth !== undefined ? { topLandingDepth: stairOp.topLandingDepth } : {}),
          ...(stairOp.showCenterColumn !== undefined ? { showCenterColumn: stairOp.showCenterColumn } : {}),
          ...(stairOp.showStepSupports !== undefined ? { showStepSupports: stairOp.showStepSupports } : {}),
          ...(stairOp.railingMode ? { railingMode: stairOp.railingMode } : {}),
          ...(stairOp.railingHeight !== undefined ? { railingHeight: stairOp.railingHeight } : {}),
          ...(stairOp.fromLevelId !== undefined ? { fromLevelId: stairOp.fromLevelId } : {}),
          ...(stairOp.toLevelId !== undefined ? { toLevelId: stairOp.toLevelId } : {}),
        })
        const { createNodes } = useScene.getState()
        if (segment) {
          createNodes([
            { node: stair, parentId: (stairOp.levelId ?? levelId) as AnyNodeId },
            { node: segment, parentId: stair.id as AnyNodeId },
          ])
          affectedNodeIds.push(stair.id as AnyNodeId, segment.id as AnyNodeId)
          createdNodeIds.push(stair.id as AnyNodeId, segment.id as AnyNodeId)
        } else {
          createNodes([
            { node: stair, parentId: (stairOp.levelId ?? levelId) as AnyNodeId },
          ])
          affectedNodeIds.push(stair.id as AnyNodeId)
          createdNodeIds.push(stair.id as AnyNodeId)
        }
        break
      }
      case 'update_stair': {
        const uStairOp = op as ValidatedUpdateStair
        // Update stair container (position, rotation, geometry-level fields)
        const stairUpdates: Record<string, unknown> = {}
        if (uStairOp.position) stairUpdates.position = uStairOp.position
        if (uStairOp.rotation !== undefined) stairUpdates.rotation = uStairOp.rotation
        if (uStairOp.width !== undefined) stairUpdates.width = uStairOp.width
        if (uStairOp.height !== undefined) stairUpdates.totalRise = uStairOp.height
        if (uStairOp.stepCount !== undefined) stairUpdates.stepCount = uStairOp.stepCount
        if (uStairOp.stairType) stairUpdates.stairType = uStairOp.stairType
        if (uStairOp.slabOpeningMode) stairUpdates.slabOpeningMode = uStairOp.slabOpeningMode
        if (uStairOp.openingOffset !== undefined) stairUpdates.openingOffset = uStairOp.openingOffset
        if (uStairOp.fillToFloor !== undefined) stairUpdates.fillToFloor = uStairOp.fillToFloor
        if (uStairOp.innerRadius !== undefined) stairUpdates.innerRadius = uStairOp.innerRadius
        if (uStairOp.sweepAngle !== undefined) stairUpdates.sweepAngle = uStairOp.sweepAngle
        if (uStairOp.topLandingMode) stairUpdates.topLandingMode = uStairOp.topLandingMode
        if (uStairOp.topLandingDepth !== undefined) stairUpdates.topLandingDepth = uStairOp.topLandingDepth
        if (uStairOp.showCenterColumn !== undefined) stairUpdates.showCenterColumn = uStairOp.showCenterColumn
        if (uStairOp.showStepSupports !== undefined) stairUpdates.showStepSupports = uStairOp.showStepSupports
        if (uStairOp.railingMode) stairUpdates.railingMode = uStairOp.railingMode
        if (uStairOp.railingHeight !== undefined) stairUpdates.railingHeight = uStairOp.railingHeight
        if (uStairOp.fromLevelId !== undefined) stairUpdates.fromLevelId = uStairOp.fromLevelId
        if (uStairOp.toLevelId !== undefined) stairUpdates.toLevelId = uStairOp.toLevelId
        if (Object.keys(stairUpdates).length > 0) {
          useScene.getState().updateNode(uStairOp.nodeId, stairUpdates)
        }
        // Mirror straight-stair segment fields when present
        const stairNode = nodes[uStairOp.nodeId]
        if (stairNode && 'children' in stairNode && Array.isArray(stairNode.children) && stairNode.children.length > 0) {
          const firstSegId = stairNode.children[0] as AnyNodeId
          const segUpdates: Record<string, unknown> = {}
          if (uStairOp.width !== undefined) segUpdates.width = uStairOp.width
          if (uStairOp.length !== undefined) segUpdates.length = uStairOp.length
          if (uStairOp.height !== undefined) segUpdates.height = uStairOp.height
          if (uStairOp.stepCount !== undefined) segUpdates.stepCount = uStairOp.stepCount
          if (uStairOp.fillToFloor !== undefined) segUpdates.fillToFloor = uStairOp.fillToFloor
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
        ops().createNode(zoneNode, (zoneOp.levelId ?? levelId) as AnyNodeId)
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
        // Reuse the first existing building when one is already present.
        // AI tools sometimes call add_building redundantly (e.g. when
        // applying a template on top of an existing scene), which produced
        // multi-building scenes whose levels stacked incorrectly. Treat
        // add_building as upsert: update name/position on the existing
        // building instead of creating a sibling.
        const existing = Object.values(nodes).find(
          (n) => n.type === 'building',
        ) as BuildingNode | undefined
        if (existing) {
          const updates: Record<string, unknown> = {}
          if (bldOp.name) updates.name = bldOp.name
          if (bldOp.position) updates.position = bldOp.position
          if (Object.keys(updates).length > 0) {
            useScene.getState().updateNode(existing.id as AnyNodeId, updates)
          }
          affectedNodeIds.push(existing.id as AnyNodeId)
          // Switch selection to the building's first level if available
          const firstChildId = existing.children[0]
          if (firstChildId && firstChildId.startsWith('level_')) {
            useViewer.getState().setSelection({ levelId: firstChildId as `level_${string}` })
          }
          break
        }

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
        ops().createNode(scanNode, levelId as AnyNodeId)
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
        ops().createNode(guideNode, levelId as AnyNodeId)
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
        if (mbOp.rotationY !== undefined) {
          // Preserve existing X/Z rotation, only update Y
          const existing = nodes[mbOp.nodeId]
          const currentRotation = (existing && 'rotation' in existing)
            ? (existing as { rotation: [number, number, number] }).rotation
            : [0, 0, 0]
          updates.rotation = [currentRotation[0], mbOp.rotationY, currentRotation[2]]
        }
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
          const newLevelNum = existingLevels.length > 0
            ? Math.max(...existingLevels.map(n => ('level' in n ? (n as { level: number }).level : 0))) + 1
            : 0
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
      case 'add_fence': {
        const fenceOp = op as ValidatedAddFence
        const fenceCount = getCachedTypeCount('fence')
        const fenceNode = FenceNode.parse({
          name: `Fence ${fenceCount + 1}`,
          start: fenceOp.start,
          end: fenceOp.end,
          height: fenceOp.height,
          thickness: fenceOp.thickness,
          style: fenceOp.style,
          baseStyle: fenceOp.baseStyle,
          color: fenceOp.color,
          postSpacing: fenceOp.postSpacing,
          ...(fenceOp.curveOffset !== undefined ? { curveOffset: fenceOp.curveOffset } : {}),
        })
        batchCreates.push({ node: fenceNode, parentId: (fenceOp.levelId ?? levelId) as AnyNodeId })
        affectedNodeIds.push(fenceNode.id as AnyNodeId)
        createdNodeIds.push(fenceNode.id as AnyNodeId)
        break
      }
      case 'update_fence': {
        const uFenceOp = op as ValidatedUpdateFence
        const updates: Record<string, unknown> = {}
        if (uFenceOp.start) updates.start = uFenceOp.start
        if (uFenceOp.end) updates.end = uFenceOp.end
        if (uFenceOp.height !== undefined) updates.height = uFenceOp.height
        if (uFenceOp.thickness !== undefined) updates.thickness = uFenceOp.thickness
        if (uFenceOp.style) updates.style = uFenceOp.style
        if (uFenceOp.baseStyle) updates.baseStyle = uFenceOp.baseStyle
        if (uFenceOp.color) updates.color = uFenceOp.color
        if (uFenceOp.postSpacing !== undefined) updates.postSpacing = uFenceOp.postSpacing
        if (uFenceOp.curveOffset !== undefined) updates.curveOffset = uFenceOp.curveOffset
        useScene.getState().updateNode(uFenceOp.nodeId, updates)
        affectedNodeIds.push(uFenceOp.nodeId)
        break
      }
      case 'add_cut_out': {
        const cutOp = op as ValidatedAddCutOut
        const targetNode = nodes[cutOp.nodeId]
        if (targetNode && (targetNode.type === 'slab' || targetNode.type === 'ceiling')) {
          const currentHoles = (targetNode as { holes?: [number, number][][] }).holes ?? []
          useScene.getState().updateNode(cutOp.nodeId, {
            holes: [...currentHoles, cutOp.hole],
          })
          affectedNodeIds.push(cutOp.nodeId)
        }
        break
      }
      case 'update_wall_material': {
        const uOp = op as ValidatedUpdateWallMaterial
        const updates = applySurfaceMaterialUpdate({
          preset: uOp.materialPreset,
          color: uOp.materialColor,
          presetField: uOp.side === 'interior'
            ? 'interiorMaterialPreset'
            : uOp.side === 'exterior'
              ? 'exteriorMaterialPreset'
              : 'materialPreset',
          materialField: uOp.side === 'interior'
            ? 'interiorMaterial'
            : uOp.side === 'exterior'
              ? 'exteriorMaterial'
              : 'material',
        })
        if (updates) {
          useScene.getState().updateNode(uOp.nodeId, updates)
          affectedNodeIds.push(uOp.nodeId)
        }
        break
      }
      case 'update_roof_material': {
        const uOp = op as ValidatedUpdateRoofMaterial
        const updates = applySurfaceMaterialUpdate({
          preset: uOp.materialPreset,
          color: uOp.materialColor,
          presetField: uOp.role === 'top'
            ? 'topMaterialPreset'
            : uOp.role === 'edge'
              ? 'edgeMaterialPreset'
              : 'wallMaterialPreset',
          materialField: uOp.role === 'top'
            ? 'topMaterial'
            : uOp.role === 'edge'
              ? 'edgeMaterial'
              : 'wallMaterial',
        })
        if (updates) {
          useScene.getState().updateNode(uOp.nodeId, updates)
          affectedNodeIds.push(uOp.nodeId)
        }
        break
      }
      case 'update_stair_material': {
        const uOp = op as ValidatedUpdateStairMaterial
        const updates = applySurfaceMaterialUpdate({
          preset: uOp.materialPreset,
          color: uOp.materialColor,
          presetField: uOp.role === 'railing'
            ? 'railingMaterialPreset'
            : uOp.role === 'tread'
              ? 'treadMaterialPreset'
              : 'sideMaterialPreset',
          materialField: uOp.role === 'railing'
            ? 'railingMaterial'
            : uOp.role === 'tread'
              ? 'treadMaterial'
              : 'sideMaterial',
        })
        if (updates) {
          useScene.getState().updateNode(uOp.nodeId, updates)
          affectedNodeIds.push(uOp.nodeId)
        }
        break
      }
      // --- MEP node creation (Phase 2 §6.2) ---
      // Each MEP case uses safeParse + explicit stale-parent guard: the
      // validator resolves levelId, but the parent level may be deleted between
      // validation and execution (undo/redo, cascade delete). A missing parent
      // or a ZodError here would previously throw and abort the whole batch;
      // now we skip the individual op and let the rest of the batch land.
      case 'add_duct_segment': {
        const mOp = op as ValidatedAddDuctSegment
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_duct_segment] parent level ${parentId} no longer exists; skipping`)
          break
        }
        const parsed = DuctSegmentNode.safeParse({
          path: mOp.points,
          shape: mOp.crossSection,
          ...(mOp.diameter !== undefined ? { diameter: mOp.diameter } : {}),
          ...(mOp.width !== undefined ? { width: mOp.width } : {}),
          ...(mOp.height !== undefined ? { height: mOp.height } : {}),
          system: mOp.system,
        })
        if (!parsed.success) {
          console.warn('[add_duct_segment] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_duct_fitting': {
        const mOp = op as ValidatedAddDuctFitting
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_duct_fitting] parent level ${parentId} no longer exists; skipping`)
          break
        }
        // Map "cap" (round end-cap) → a straight 0° elbow that closes the run.
        const schemaKind = mOp.fittingType === 'cap' ? 'elbow' : mOp.fittingType
        const parsed = DuctFittingNode.safeParse({
          position: mOp.position,
          rotation: mOp.rotation,
          fittingType: schemaKind,
          ...(mOp.fittingType === 'cap' ? { angle: 0 } : {}),
          ...(mOp.diameter !== undefined ? { diameter: mOp.diameter } : {}),
          ...(mOp.diameter2 !== undefined ? { diameter2: mOp.diameter2 } : {}),
        })
        if (!parsed.success) {
          console.warn('[add_duct_fitting] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_duct_terminal': {
        const mOp = op as ValidatedAddDuctTerminal
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_duct_terminal] parent level ${parentId} no longer exists; skipping`)
          break
        }
        // Map SaaS terminalType → schema enum + mount.
        const schemaKind =
          mOp.terminalType === 'supply' ? 'supply-register'
          : mOp.terminalType === 'return' ? 'return-grille'
          : 'diffuser'
        // Derive mount from host kind if present; diffusers default to ceiling.
        let mount: 'floor' | 'ceiling' | 'wall' = mOp.terminalType === 'diffuser' ? 'ceiling' : 'floor'
        if (mOp.hostId) {
          const host = nodes[mOp.hostId as AnyNodeId]
          if (host?.type === 'ceiling') mount = 'ceiling'
          else if (host?.type === 'wall') mount = 'wall'
        }
        const parsed = DuctTerminalNode.safeParse({
          position: mOp.position,
          rotation: mOp.rotation,
          terminalType: schemaKind,
          mount,
        })
        if (!parsed.success) {
          console.warn('[add_duct_terminal] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_pipe_segment': {
        const mOp = op as ValidatedAddPipeSegment
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_pipe_segment] parent level ${parentId} no longer exists; skipping`)
          break
        }
        // PipeSegment schema only exposes waste / vent; map supply / gas to
        // waste for now so the LLM's intent is preserved in the polyline
        // while the geometry system stays consistent.
        const system = mOp.pipeKind === 'dwv' ? 'waste' : 'waste'
        const parsed = PipeSegmentNode.safeParse({
          path: mOp.points,
          diameter: mOp.diameter,
          system,
        })
        if (!parsed.success) {
          console.warn('[add_pipe_segment] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_pipe_fitting': {
        const mOp = op as ValidatedAddPipeFitting
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_pipe_fitting] parent level ${parentId} no longer exists; skipping`)
          break
        }
        // Map alignment tool kinds → schema enum.
        //   tee     → sanitary-tee (square branch)
        //   reducer → 0° elbow that steps diameter
        //   elbow / wye pass through.
        const schemaKind: 'elbow' | 'wye' | 'sanitary-tee' | 'cross' =
          mOp.fittingType === 'tee' ? 'sanitary-tee'
          : mOp.fittingType === 'reducer' ? 'elbow'
          : mOp.fittingType
        const parsed = PipeFittingNode.safeParse({
          position: mOp.position,
          rotation: mOp.rotation,
          fittingType: schemaKind,
          diameter: mOp.diameter,
          ...(mOp.fittingType === 'reducer' ? { angle: 0 } : {}),
        })
        if (!parsed.success) {
          console.warn('[add_pipe_fitting] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_pipe_trap': {
        const mOp = op as ValidatedAddPipeTrap
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_pipe_trap] parent level ${parentId} no longer exists; skipping`)
          break
        }
        // Schema only exposes one trap kind; s-trap is stored as p-trap
        // geometry but the validator preserved the requested trapType for
        // downstream logging.
        const parsed = PipeTrapNode.safeParse({
          position: mOp.position,
          rotation: mOp.rotation,
          diameter: mOp.diameter,
        })
        if (!parsed.success) {
          console.warn('[add_pipe_trap] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_hvac_equipment': {
        const mOp = op as ValidatedAddHvacEquipment
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_hvac_equipment] parent level ${parentId} no longer exists; skipping`)
          break
        }
        // Map SaaS kind → schema enum:
        //   indoor-unit / ahu → air-handler
        //   outdoor-unit      → condenser
        const schemaKind: 'furnace' | 'air-handler' | 'condenser' =
          mOp.equipmentType === 'outdoor-unit' ? 'condenser' : 'air-handler'
        const parsed = HvacEquipmentNode.safeParse({
          position: mOp.position,
          rotation: mOp.rotation,
          equipmentType: schemaKind,
          width: mOp.width,
          depth: mOp.depth,
          height: mOp.height,
        })
        if (!parsed.success) {
          console.warn('[add_hvac_equipment] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_lineset': {
        const mOp = op as ValidatedAddLineset
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_lineset] parent level ${parentId} no longer exists; skipping`)
          break
        }
        const parsed = LinesetNode.safeParse({
          path: mOp.route,
        })
        if (!parsed.success) {
          console.warn('[add_lineset] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'add_liquid_line': {
        const mOp = op as ValidatedAddLiquidLine
        const parentId = (mOp.levelId ?? levelId) as AnyNodeId
        if (!useScene.getState().nodes[parentId]) {
          console.warn(`[add_liquid_line] parent level ${parentId} no longer exists; skipping`)
          break
        }
        const parsed = LiquidLineNode.safeParse({
          path: mOp.route,
        })
        if (!parsed.success) {
          console.warn('[add_liquid_line] parse failed, skipping op:', parsed.error.message)
          break
        }
        batchCreates.push({ node: parsed.data, parentId })
        affectedNodeIds.push(parsed.data.id as AnyNodeId)
        createdNodeIds.push(parsed.data.id as AnyNodeId)
        break
      }
      case 'align_opening_to_nearest': {
        const aOp = op as ValidatedAlignOpeningToNearest
        if (aOp.snappedPosition) {
          const original = originalNodeStates.get(aOp.nodeId)
          if (original) {
            useScene.getState().updateNode(aOp.nodeId, { metadata: original.metadata })
          }
          useScene.getState().updateNode(aOp.nodeId, {
            position: aOp.snappedPosition,
            metadata: stripTransientMetadata(nodes[aOp.nodeId]?.metadata) as Record<string, never>,
          })
          affectedNodeIds.push(aOp.nodeId)
        }
        break
      }
      // enter_walkthrough is handled in ai-agent-loop.ts before reaching confirm path
    }
  }

  // Execute batched node creations in a single call (single undo record)
  // SceneOperations exposes only single createNode; use applyPatch for batch
  // to keep all creations in one Zundo entry.
  if (batchCreates.length > 0) {
    ops().applyPatch(
      batchCreates.map(({ node, parentId }) => ({ op: 'create' as const, node, parentId })),
    )
  }
  } catch (err) {
    // A late throw here means one or more downstream mutations couldn't apply —
    // log for debugging but keep partial progress. The finally block still runs
    // resetPreviewState() so ghost/transient state doesn't leak.
    console.error('[confirmGhostPreview] operation batch failed:', err)
  } finally {
    // Clean up state — MUST run whether success or failure, otherwise ghost
    // nodes and transient metadata would remain in the scene indefinitely.
    resetPreviewState()
  }

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

  // Step 1: Delete nodes that were created by this operation.
  // cascade=true: when the confirmed op created a parent + children
  // (e.g. a wall with attached windows in a single AI batch), undoing must
  // remove the whole subtree. The existence guard above handles the
  // "already cascaded away by an earlier iteration" case.
  for (const nodeId of log.createdNodeIds) {
    const node = useScene.getState().nodes[nodeId]
    if (node) {
      ops().deleteNode(nodeId, true)
    }
  }

  // Step 2: Restore modified nodes to their previous snapshot.
  // We use setNode (full replace) instead of updateNode (spread merge) because
  // spread cannot clear keys the snapshot doesn't carry — a material write that
  // added `material: {…}` to a node previously without it would survive an undo.
  const snapshotEntries = Object.entries(log.previousSnapshot) as [AnyNodeId, AnyNode][]
  for (const [nodeId, snapshot] of snapshotEntries) {
    // Skip nodes that were removed (handled in step 3)
    if (log.removedNodes.some((r) => (r.node as AnyNode & { id: AnyNodeId }).id === nodeId)) continue

    const currentNode = useScene.getState().nodes[nodeId]
    if (currentNode) {
      useScene.getState().setNode(nodeId, snapshot)
    }
  }

  // Step 3: Re-create nodes that were removed.
  //
  // markForGhostRemoval saves the whole subtree (parent + descendants), so
  // log.removedNodes can contain unordered nodes whose parent might also be
  // pending re-creation. We must topologically sort so each node's parent
  // exists in the store before we create the node itself.
  const removedById = new Map<string, { node: AnyNode; parentId: AnyNodeId }>()
  for (const entry of log.removedNodes) {
    const id = (entry.node as AnyNode & { id: string }).id
    removedById.set(id, entry)
  }

  const sceneNodes = useScene.getState().nodes
  const created = new Set<string>()
  const visiting = new Set<string>()

  function recreate(id: string): void {
    if (created.has(id)) return
    if (visiting.has(id)) return // cycle guard
    visiting.add(id)
    const entry = removedById.get(id)
    if (!entry) return

    const parentId = entry.parentId
    // If parent is also pending re-creation, do it first.
    if (parentId && removedById.has(parentId) && !created.has(parentId)) {
      recreate(parentId)
    }

    // Skip if parent doesn't exist in the store and isn't being re-created
    // (parent may have been removed by something outside this operation).
    const parentInStore = parentId ? useScene.getState().nodes[parentId as AnyNodeId] : null
    if (parentId && !parentInStore && !created.has(parentId)) {
      visiting.delete(id)
      return
    }

    ops().createNode(entry.node, parentId as AnyNodeId)
    created.add(id)
    visiting.delete(id)
  }

  // Re-create roots first (those whose parents existed before this operation
  // and are still in the store), then descendants by recursion above.
  for (const [id, entry] of removedById) {
    const parentInStore = entry.parentId ? sceneNodes[entry.parentId as AnyNodeId] : null
    if (parentInStore || !removedById.has(entry.parentId)) {
      recreate(id)
    }
  }
  // Sweep any leftover nodes whose dependency chain wasn't reached above.
  for (const id of removedById.keys()) {
    recreate(id)
  }
}
