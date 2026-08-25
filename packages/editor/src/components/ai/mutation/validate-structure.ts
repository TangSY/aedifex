import {
  type AnyNode,
  type AnyNodeId,
  computeGutterEaveY as computeCoreGutterEaveY,
  computeOpeningGuides,
  getCatalogMaterialById,
  getRoofShapeEaveSides,
  GUTTER_EAVE_TUCK_INWARD,
  nodeRegistry,
  type RoofType,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import useAlignmentGuides from '../../../store/use-alignment-guides'
import { checkWallCollision } from './collision-detection'
import type {
  AddBuildingToolCall,
  AddCeilingToolCall,
  AddDuctFittingToolCall,
  AddDuctSegmentToolCall,
  AddDuctTerminalToolCall,
  AddGuideToolCall,
  AddHvacEquipmentToolCall,
  AddLevelToolCall,
  AddLinesetToolCall,
  AddLiquidLineToolCall,
  AddPipeFittingToolCall,
  AddPipeSegmentToolCall,
  AddPipeTrapToolCall,
  AddRoofToolCall,
  AddScanToolCall,
  AddSlabToolCall,
  AddElevatorToolCall,
  AddStairToolCall,
  AddZoneToolCall,
  AlignOpeningToNearestToolCall,
  CloneLevelToolCall,
  MoveBuildingToolCall,
  UpdateCeilingToolCall,
  UpdateRoofMaterialToolCall,
  UpdateRoofToolCall,
  UpdateSiteToolCall,
  UpdateSlabToolCall,
  PaintSlotToolCall,
  UpdateStairMaterialToolCall,
  UpdateStairToolCall,
  UpdateZoneToolCall,
  ValidatedAddBuilding,
  ValidatedAddCeiling,
  ValidatedAddDuctFitting,
  ValidatedAddDuctSegment,
  ValidatedAddDuctTerminal,
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
  ValidatedCloneLevel,
  ValidatedMoveBuilding,
  ValidatedUpdateCeiling,
  ValidatedUpdateRoof,
  ValidatedUpdateRoofMaterial,
  ValidatedUpdateSite,
  ValidatedUpdateSlab,
  ValidatedUpdateStair,
  ValidatedPaintSlot,
  ValidatedUpdateStairMaterial,
  ValidatedUpdateZone,
} from '../types'
import { getLevelHeightContext, getZonesForLevel, resolveEffectiveLevelId } from './spatial-queries'

// ============================================================================
// Building Structure Validators
// ============================================================================

/** Helper: compute polygon area using shoelace formula */
export function polygonArea(polygon: [number, number][]): number {
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i]![0] * polygon[j]![1]
    area -= polygon[j]![0] * polygon[i]![1]
  }
  return Math.abs(area) / 2
}

/** Helper: find the current building and its levels */
export function findBuildingAndLevels(): {
  buildingId: AnyNodeId | null
  levels: { id: string; level: number }[]
} {
  const { nodes } = useScene.getState()
  const levelId = useViewer.getState().selection.levelId
  if (!levelId) return { buildingId: null, levels: [] }

  const currentLevel = nodes[levelId as AnyNodeId]
  if (!currentLevel) return { buildingId: null, levels: [] }

  const buildingId = currentLevel.parentId as AnyNodeId | null
  if (!buildingId) return { buildingId: null, levels: [] }

  const building = nodes[buildingId]
  if (!building || building.type !== 'building') return { buildingId: null, levels: [] }

  const levels = (building.children as string[])
    .map((id) => nodes[id as AnyNodeId])
    .filter((n): n is AnyNode => !!n && n.type === 'level')
    .map((n) => ({ id: n.id, level: (n as { level: number }).level ?? 0 }))

  return { buildingId, levels }
}

export function validateAddLevel(call: AddLevelToolCall): ValidatedAddLevel {
  let { buildingId, levels } = findBuildingAndLevels()

  // Fallback: when no level is currently selected (or selection has no parent
  // building), pick the first building in the scene. Mirrors the runtime
  // fallback in confirm-operations.ts (Bug 3) so add_level succeeds even when
  // viewer selection is empty.
  if (!buildingId) {
    const { nodes } = useScene.getState()
    const firstBuilding = Object.values(nodes).find(
      (n): n is AnyNode => !!n && n.type === 'building',
    )
    if (firstBuilding && firstBuilding.type === 'building') {
      buildingId = firstBuilding.id as AnyNodeId
      const buildingChildren = (firstBuilding as { children: string[] }).children ?? []
      levels = buildingChildren
        .map((id) => nodes[id as AnyNodeId])
        .filter((n): n is AnyNode => !!n && n.type === 'level')
        .map((n) => ({ id: n.id, level: (n as { level: number }).level ?? 0 }))
    }
  }

  if (!buildingId) {
    return {
      type: 'add_level',
      status: 'invalid',
      level: 0,
      buildingId: '' as AnyNodeId,
      errorReason: 'No building found in current scene. Use add_building first.',
    }
  }

  const nextLevel = levels.length > 0
    ? Math.max(...levels.map((l) => l.level)) + 1
    : 0

  return {
    type: 'add_level',
    status: 'valid',
    level: nextLevel,
    name: call.name,
    buildingId,
  }
}

export function validateAddSlab(call: AddSlabToolCall): ValidatedAddSlab {
  // Resolve effective level ID: explicit from tool call (validated), fallback to viewer selection.
  const effectiveSlabLevel = resolveEffectiveLevelId(call.levelId)

  const polygon = call.polygon as [number, number][]

  if (!polygon || polygon.length < 3) {
    return {
      type: 'add_slab',
      status: 'invalid',
      polygon: polygon ?? [],
      elevation: call.elevation ?? 0.05,
      holes: (call.holes ?? []) as [number, number][][],
      errorReason: 'Slab polygon must have at least 3 points.',
    }
  }

  const area = polygonArea(polygon)
  if (area < 1) {
    return {
      type: 'add_slab',
      status: 'invalid',
      polygon,
      elevation: call.elevation ?? 0.05,
      holes: (call.holes ?? []) as [number, number][][],
      errorReason: `Slab polygon area too small (${area.toFixed(1)}m²). Minimum is 1m².`,
    }
  }

  return {
    type: 'add_slab',
    status: 'valid',
    polygon,
    elevation: call.elevation ?? 0.05,
    holes: (call.holes ?? []) as [number, number][][],
    levelId: effectiveSlabLevel ?? undefined,
  }
}

export function validateUpdateSlab(call: UpdateSlabToolCall): ValidatedUpdateSlab {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_slab', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Slab "${call.nodeId}" not found.` }
  }
  if (node.type !== 'slab') {
    return { type: 'update_slab', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a slab.` }
  }

  if (call.polygon && call.polygon.length < 3) {
    return { type: 'update_slab', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'Polygon must have at least 3 points.' }
  }

  return {
    type: 'update_slab',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    elevation: call.elevation,
    polygon: call.polygon as [number, number][] | undefined,
  }
}

export function validateAddCeiling(call: AddCeilingToolCall, _wallCache?: Map<string, import('@aedifex/core').WallNode[]>): ValidatedAddCeiling {
  // Resolve effective level ID: explicit from tool call (validated), fallback to viewer selection.
  const effectiveCeilLevel = resolveEffectiveLevelId(call.levelId)

  let polygon = call.polygon as [number, number][]
  let polygonAutoDetected = false

  // Fallback: auto-detect polygon from the largest zone when polygon is missing or invalid
  if (!polygon || polygon.length < 3) {
    const levelId = effectiveCeilLevel
    if (!levelId) {
      return {
        type: 'add_ceiling',
        status: 'invalid',
        polygon: polygon ?? [],
        height: call.height ?? 2.5,
        errorReason: 'Ceiling polygon must have at least 3 points, and no active level was found to auto-detect a zone boundary.',
      }
    }

    const zones = getZonesForLevel(levelId)
    if (zones.length === 0) {
      return {
        type: 'add_ceiling',
        status: 'invalid',
        polygon: polygon ?? [],
        height: call.height ?? 2.5,
        errorReason: 'Ceiling polygon must have at least 3 points, and no zones were found on the current level to auto-detect a boundary.',
      }
    }

    // Pick the zone with the largest area
    const largestZone = zones.reduce((best, zone) => {
      return polygonArea(zone.polygon as [number, number][]) > polygonArea(best.polygon as [number, number][]) ? zone : best
    })

    polygon = largestZone.polygon as [number, number][]
    polygonAutoDetected = true
  }

  if (!polygon || polygon.length < 3) {
    return {
      type: 'add_ceiling',
      status: 'invalid',
      polygon: polygon ?? [],
      height: call.height ?? 2.5,
      errorReason: 'Ceiling polygon must have at least 3 points.',
    }
  }

  const area = polygonArea(polygon)
  if (area < 1) {
    return {
      type: 'add_ceiling',
      status: 'invalid',
      polygon,
      height: call.height ?? 2.5,
      errorReason: `Ceiling polygon area too small (${area.toFixed(1)}m²). Minimum is 1m².`,
    }
  }

  // R3: Ceiling height must match wall height
  const ceilLevelId = effectiveCeilLevel
  let ceilingHeight = call.height ?? 2.5
  let ceilAdjustReason: string | undefined

  if (ceilLevelId) {
    const heightCtx = getLevelHeightContext(ceilLevelId)

    // Auto-adjust ceiling height to match wall height
    if (Math.abs(ceilingHeight - heightCtx.wallHeight) > 0.1) {
      ceilAdjustReason = `Ceiling height adjusted from ${ceilingHeight}m to ${heightCtx.wallHeight}m to match wall height.`
      ceilingHeight = heightCtx.wallHeight
    }

    // R4: Check if existing items exceed wall height (can't add ceiling)
    if (heightCtx.tallestItemHeight > heightCtx.wallHeight) {
      return {
        type: 'add_ceiling',
        status: 'invalid',
        polygon,
        height: ceilingHeight,
        errorReason: `Cannot add ceiling: existing items reach ${heightCtx.tallestItemHeight.toFixed(1)}m, which exceeds wall height ${heightCtx.wallHeight.toFixed(1)}m. Remove or shorten tall items first.`,
      }
    }
  }

  const autoDetectReason = polygonAutoDetected
    ? 'Ceiling polygon was auto-detected from the largest zone boundary (no polygon provided by AI).'
    : undefined
  const combinedAdjustReason = [autoDetectReason, ceilAdjustReason].filter(Boolean).join(' ') || undefined

  return {
    type: 'add_ceiling',
    status: combinedAdjustReason ? 'adjusted' : 'valid',
    polygon,
    height: ceilingHeight,
    material: call.material,
    levelId: effectiveCeilLevel ?? undefined,
    adjustmentReason: combinedAdjustReason,
  }
}

export function validateUpdateCeiling(call: UpdateCeilingToolCall, _wallCache?: Map<string, import('@aedifex/core').WallNode[]>): ValidatedUpdateCeiling {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_ceiling', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Ceiling "${call.nodeId}" not found.` }
  }
  if (node.type !== 'ceiling') {
    return { type: 'update_ceiling', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a ceiling.` }
  }

  if (!call.height && !call.material) {
    return { type: 'update_ceiling', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'No properties to update. Provide height and/or material.' }
  }

  // R3: If height is being changed, auto-adjust to match wall height
  let adjustedHeight = call.height
  let uCeilAdjust: string | undefined
  if (call.height) {
    const uCeilLevelId = useViewer.getState().selection.levelId
    if (uCeilLevelId) {
      const hCtx = getLevelHeightContext(uCeilLevelId)
      if (Math.abs(call.height - hCtx.wallHeight) > 0.1) {
        adjustedHeight = hCtx.wallHeight
        uCeilAdjust = `Ceiling height adjusted from ${call.height}m to ${hCtx.wallHeight}m to match wall height.`
      }
    }
  }

  return {
    type: 'update_ceiling',
    status: uCeilAdjust ? 'adjusted' as const : 'valid' as const,
    nodeId: call.nodeId as AnyNodeId,
    height: adjustedHeight,
    material: call.material,
  }
}

const VALID_ROOF_TYPES = new Set(['hip', 'gable', 'shed', 'gambrel', 'dutch', 'mansard', 'flat'])

export function validateAddRoof(call: AddRoofToolCall): ValidatedAddRoof {
  // Resolve effective level ID: explicit from tool call (validated), fallback to viewer selection.
  const effectiveRoofLevel = resolveEffectiveLevelId(call.levelId)

  if (!call.width || call.width <= 0) {
    return {
      type: 'add_roof',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      width: call.width ?? 0,
      depth: call.depth ?? 0,
      roofType: call.roofType ?? 'gable',
      roofHeight: call.roofHeight ?? 2.5,
      wallHeight: call.wallHeight ?? 0.5,
      overhang: call.overhang ?? 0.3,
      errorReason: 'Roof width must be > 0.',
    }
  }

  if (!call.depth || call.depth <= 0) {
    return {
      type: 'add_roof',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      width: call.width,
      depth: call.depth ?? 0,
      roofType: call.roofType ?? 'gable',
      roofHeight: call.roofHeight ?? 2.5,
      wallHeight: call.wallHeight ?? 0.5,
      overhang: call.overhang ?? 0.3,
      errorReason: 'Roof depth must be > 0.',
    }
  }

  if (!VALID_ROOF_TYPES.has(call.roofType)) {
    return {
      type: 'add_roof',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      width: call.width,
      depth: call.depth,
      roofType: 'gable',
      roofHeight: call.roofHeight ?? 2.5,
      wallHeight: call.wallHeight ?? 0.5,
      overhang: call.overhang ?? 0.3,
      errorReason: `Invalid roofType "${call.roofType}". Must be one of: ${[...VALID_ROOF_TYPES].join(', ')}.`,
    }
  }

  return {
    type: 'add_roof',
    status: 'valid',
    position: call.position ?? [0, 0, 0],
    width: call.width,
    depth: call.depth,
    roofType: call.roofType,
    roofHeight: call.roofHeight ?? 2.5,
    wallHeight: call.wallHeight ?? 0.5,
    overhang: call.overhang ?? 0.3,
    levelId: effectiveRoofLevel ?? undefined,
  }
}

export function validateUpdateRoof(call: UpdateRoofToolCall): ValidatedUpdateRoof {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_roof', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Roof segment "${call.nodeId}" not found.` }
  }
  if (node.type !== 'roof-segment') {
    return { type: 'update_roof', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a roof-segment.` }
  }

  if (call.roofType && !VALID_ROOF_TYPES.has(call.roofType)) {
    return { type: 'update_roof', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Invalid roofType "${call.roofType}".` }
  }

  return {
    type: 'update_roof',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    roofType: call.roofType,
    roofHeight: call.roofHeight,
    wallHeight: call.wallHeight,
    width: call.width,
    depth: call.depth,
  }
}

export function validateAddElevator(call: AddElevatorToolCall): ValidatedAddElevator {
  const width = call.width ?? 1.6
  const depth = call.depth ?? 1.6
  const cabHeight = call.cabHeight ?? 2.35
  const rotation = call.rotationY ?? 0
  const position = call.position ?? [0, 0, 0]

  if (width < 0.6 || width > 4.0) {
    return {
      type: 'add_elevator',
      status: 'invalid',
      position, rotation,
      width, depth, cabHeight,
      fromLevelId: call.fromLevelId ?? null,
      toLevelId: call.toLevelId ?? null,
      errorReason: `Elevator width ${width}m is out of range. Must be 0.6-4.0m.`,
    }
  }
  if (depth < 0.6 || depth > 4.0) {
    return {
      type: 'add_elevator',
      status: 'invalid',
      position, rotation,
      width, depth, cabHeight,
      fromLevelId: call.fromLevelId ?? null,
      toLevelId: call.toLevelId ?? null,
      errorReason: `Elevator depth ${depth}m is out of range. Must be 0.6-4.0m.`,
    }
  }
  if (cabHeight < 2.0 || cabHeight > 4.0) {
    return {
      type: 'add_elevator',
      status: 'invalid',
      position, rotation,
      width, depth, cabHeight,
      fromLevelId: call.fromLevelId ?? null,
      toLevelId: call.toLevelId ?? null,
      errorReason: `Elevator cabHeight ${cabHeight}m is out of range. Must be 2.0-4.0m.`,
    }
  }

  // Wall collision: same guard as stairs — an elevator shaft must not cut
  // through walls on its boarding level.
  let elevatorPosition: [number, number, number] = position
  let elevatorAdjustment: string | undefined
  const elevatorLevel = resolveEffectiveLevelId(call.fromLevelId ?? undefined)
  const elevatorHit = checkStructureWallCollision(
    elevatorPosition,
    [width, cabHeight, depth],
    rotation,
    elevatorLevel,
  )
  if (elevatorHit === 'no-space') {
    return {
      type: 'add_elevator',
      status: 'invalid',
      position, rotation,
      width, depth, cabHeight,
      fromLevelId: call.fromLevelId ?? null,
      toLevelId: call.toLevelId ?? null,
      errorReason:
        'Elevator placement collides with walls and there is no nearby free spot. Pick a position clear of walls.',
    }
  }
  if (elevatorHit) {
    elevatorPosition = elevatorHit.position
    elevatorAdjustment = elevatorHit.reason
  }

  return {
    type: 'add_elevator',
    status: elevatorAdjustment ? 'adjusted' : 'valid',
    position: elevatorPosition,
    rotation,
    width, depth, cabHeight,
    ...(elevatorAdjustment ? { adjustmentReason: elevatorAdjustment } : {}),
    fromLevelId: call.fromLevelId ?? null,
    toLevelId: call.toLevelId ?? null,
    ...(call.servedLevelIds ? { servedLevelIds: call.servedLevelIds } : {}),
    ...(call.shaftStyle ? { shaftStyle: call.shaftStyle } : {}),
    ...(call.doorStyle ? { doorStyle: call.doorStyle } : {}),
    ...(call.doorPanelStyle ? { doorPanelStyle: call.doorPanelStyle } : {}),
    ...(call.buildingId ? { buildingId: call.buildingId } : {}),
  }
}

/**
 * Wall-collision guard for footprint-based structure nodes (stair/elevator).
 * Items already run checkWallCollision in validate-item; stairs and elevators
 * skipped it entirely, which let the LLM place a staircase straight through a
 * wall (QA-AI 2026-06-12 finding). Returns the pushed-out position, 'no-space'
 * when both sides are blocked, or null when there is no collision / no level.
 */
function checkStructureWallCollision(
  position: [number, number, number],
  footprint: [number, number, number],
  rotationY: number,
  levelId: string | null | undefined,
): { position: [number, number, number]; reason: string } | 'no-space' | null {
  if (!levelId) return null
  return checkWallCollision(position, footprint, [0, rotationY, 0], levelId)
}

export function validateAddStair(call: AddStairToolCall): ValidatedAddStair {
  // Resolve effective level ID: explicit from tool call (validated), fallback to viewer selection.
  const effectiveStairLevel = resolveEffectiveLevelId(call.levelId)

  const width = call.width ?? 1.0
  const length = call.length ?? 3.0
  const height = call.height ?? 2.5
  // OpenAI may send stepCount as a float (schema uses 'number' for compatibility);
  // round to nearest integer to ensure valid step count.
  const stepCount = Math.round(call.stepCount ?? 10)
  const rotation = call.rotationY ?? 0

  if (width < 0.5 || width > 5.0) {
    return {
      type: 'add_stair',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      rotation,
      width, length, height, stepCount,
      errorReason: `Stair width ${width}m is out of range. Must be 0.5-5.0m.`,
    }
  }

  if (length < 0.5 || length > 10.0) {
    return {
      type: 'add_stair',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      rotation,
      width, length, height, stepCount,
      errorReason: `Stair length ${length}m is out of range. Must be 0.5-10.0m.`,
    }
  }

  if (height < 0.5 || height > 10.0) {
    return {
      type: 'add_stair',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      rotation,
      width, length, height, stepCount,
      errorReason: `Stair height ${height}m is out of range. Must be 0.5-10.0m.`,
    }
  }

  if (stepCount < 2 || stepCount > 30) {
    return {
      type: 'add_stair',
      status: 'invalid',
      position: call.position ?? [0, 0, 0],
      rotation,
      width, length, height, stepCount,
      errorReason: `Step count ${stepCount} is out of range. Must be 2-30.`,
    }
  }

  // Field-mode mismatch warnings: certain fields are only meaningful for specific
  // stairType values. Don't reject — the renderer ignores irrelevant fields, but
  // surface a hint so the LLM doesn't think it set a property that took effect.
  const stairKind = call.stairType ?? 'straight'
  const irrelevantWarnings: string[] = []
  if (stairKind === 'straight') {
    if (call.innerRadius !== undefined) irrelevantWarnings.push('innerRadius')
    if (call.sweepAngle !== undefined) irrelevantWarnings.push('sweepAngle')
    if (call.topLandingMode && call.topLandingMode !== 'none') irrelevantWarnings.push('topLandingMode')
    if (call.topLandingDepth !== undefined) irrelevantWarnings.push('topLandingDepth')
    if (call.showCenterColumn !== undefined) irrelevantWarnings.push('showCenterColumn')
    if (call.showStepSupports !== undefined) irrelevantWarnings.push('showStepSupports')
  } else {
    // curved/spiral
    if (call.length !== undefined && call.length !== 3.0) irrelevantWarnings.push('length')
  }
  const warningReason = irrelevantWarnings.length > 0
    ? `${irrelevantWarnings.join(', ')} ignored for stairType=${stairKind} (only applies to ${stairKind === 'straight' ? 'curved/spiral' : 'straight'} stairs).`
    : undefined

  // Wall collision: a stair must not cut through walls. Straight stairs use
  // their width × length footprint; curved/spiral stairs are approximated by
  // the bounding square of their outer radius (innerRadius + tread width).
  let position: [number, number, number] = call.position ?? [0, 0, 0]
  let collisionReason: string | undefined
  const footprint: [number, number, number] =
    stairKind === 'straight'
      ? [width, height, length]
      : (() => {
          const outer = 2 * ((call.innerRadius ?? 0.6) + width)
          return [outer, height, outer]
        })()
  const wallHit = checkStructureWallCollision(position, footprint, rotation, effectiveStairLevel)
  if (wallHit === 'no-space') {
    return {
      type: 'add_stair',
      status: 'invalid',
      position,
      rotation,
      width, length, height, stepCount,
      errorReason:
        'Stair placement collides with walls and there is no nearby free spot. Pick a position clear of walls (the stair footprint must not cut through any wall).',
    }
  }
  if (wallHit) {
    position = wallHit.position
    collisionReason = wallHit.reason
  }

  const adjustmentReason =
    [warningReason, collisionReason].filter(Boolean).join(' ') || undefined

  return {
    type: 'add_stair',
    status: adjustmentReason ? 'adjusted' : 'valid',
    position,
    rotation,
    width,
    length,
    height,
    stepCount,
    stairType: call.stairType,
    slabOpeningMode: call.slabOpeningMode,
    openingOffset: call.openingOffset,
    fillToFloor: call.fillToFloor,
    innerRadius: call.innerRadius,
    sweepAngle: call.sweepAngle,
    topLandingMode: call.topLandingMode,
    topLandingDepth: call.topLandingDepth,
    showCenterColumn: call.showCenterColumn,
    showStepSupports: call.showStepSupports,
    railingMode: call.railingMode,
    railingHeight: call.railingHeight,
    fromLevelId: call.fromLevelId,
    toLevelId: call.toLevelId,
    levelId: effectiveStairLevel ?? undefined,
    adjustmentReason,
  }
}

export function validateUpdateStair(call: UpdateStairToolCall): ValidatedUpdateStair {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node || node.type !== 'stair') {
    return {
      type: 'update_stair',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      errorReason: `Stair "${call.nodeId}" not found.`,
    }
  }

  // Validate ranges if provided
  if (call.width !== undefined && (call.width < 0.5 || call.width > 5.0)) {
    return {
      type: 'update_stair', status: 'invalid', nodeId: call.nodeId as AnyNodeId,
      errorReason: `Stair width ${call.width}m is out of range. Must be 0.5-5.0m.`,
    }
  }
  if (call.length !== undefined && (call.length < 0.5 || call.length > 10.0)) {
    return {
      type: 'update_stair', status: 'invalid', nodeId: call.nodeId as AnyNodeId,
      errorReason: `Stair length ${call.length}m is out of range. Must be 0.5-10.0m.`,
    }
  }
  if (call.height !== undefined && (call.height < 0.5 || call.height > 10.0)) {
    return {
      type: 'update_stair', status: 'invalid', nodeId: call.nodeId as AnyNodeId,
      errorReason: `Stair height ${call.height}m is out of range. Must be 0.5-10.0m.`,
    }
  }
  // Round stepCount to integer (OpenAI schema uses 'number' for compatibility)
  const roundedStepCount = call.stepCount !== undefined ? Math.round(call.stepCount) : undefined
  if (roundedStepCount !== undefined && (roundedStepCount < 2 || roundedStepCount > 30)) {
    return {
      type: 'update_stair', status: 'invalid', nodeId: call.nodeId as AnyNodeId,
      errorReason: `Step count ${roundedStepCount} is out of range. Must be 2-30.`,
    }
  }

  // Field-mode mismatch warnings: same as validateAddStair but resolves
  // effective stairType from `call.stairType ?? existing.stairType` so updates
  // that don't change kind still get checked against current state.
  const existingStair = node as { stairType?: string }
  const effectiveKind = call.stairType ?? existingStair.stairType ?? 'straight'
  const irrelevantWarnings: string[] = []
  if (effectiveKind === 'straight') {
    if (call.innerRadius !== undefined) irrelevantWarnings.push('innerRadius')
    if (call.sweepAngle !== undefined) irrelevantWarnings.push('sweepAngle')
    if (call.topLandingMode && call.topLandingMode !== 'none') irrelevantWarnings.push('topLandingMode')
    if (call.topLandingDepth !== undefined) irrelevantWarnings.push('topLandingDepth')
    if (call.showCenterColumn !== undefined) irrelevantWarnings.push('showCenterColumn')
    if (call.showStepSupports !== undefined) irrelevantWarnings.push('showStepSupports')
  } else {
    if (call.length !== undefined) irrelevantWarnings.push('length')
  }
  const adjustmentReason = irrelevantWarnings.length > 0
    ? `${irrelevantWarnings.join(', ')} ignored for stairType=${effectiveKind} (only applies to ${effectiveKind === 'straight' ? 'curved/spiral' : 'straight'} stairs).`
    : undefined

  return {
    type: 'update_stair',
    status: adjustmentReason ? 'adjusted' : 'valid',
    nodeId: call.nodeId as AnyNodeId,
    position: call.position,
    rotation: call.rotationY,
    width: call.width,
    length: call.length,
    height: call.height,
    stepCount: roundedStepCount,
    stairType: call.stairType,
    slabOpeningMode: call.slabOpeningMode,
    openingOffset: call.openingOffset,
    fillToFloor: call.fillToFloor,
    innerRadius: call.innerRadius,
    sweepAngle: call.sweepAngle,
    topLandingMode: call.topLandingMode,
    topLandingDepth: call.topLandingDepth,
    showCenterColumn: call.showCenterColumn,
    showStepSupports: call.showStepSupports,
    railingMode: call.railingMode,
    railingHeight: call.railingHeight,
    fromLevelId: call.fromLevelId,
    toLevelId: call.toLevelId,
    adjustmentReason,
  }
}

const VALID_ROOF_ROLES = new Set(['top', 'edge', 'wall'])
const VALID_STAIR_ROLES = new Set(['railing', 'tread', 'side'])

export function validateUpdateRoofMaterial(call: UpdateRoofMaterialToolCall): ValidatedUpdateRoofMaterial {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_roof_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Roof "${call.nodeId}" not found.` }
  }
  if (node.type !== 'roof') {
    return { type: 'update_roof_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a roof.` }
  }
  if (!VALID_ROOF_ROLES.has(call.role)) {
    return { type: 'update_roof_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Invalid role "${call.role}". Must be one of: top, edge, wall.` }
  }
  if (!call.materialPreset && !call.materialColor) {
    return { type: 'update_roof_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: 'Provide either materialPreset (catalog ID) or materialColor (hex).' }
  }
  if (call.materialPreset && !getCatalogMaterialById(call.materialPreset)) {
    return { type: 'update_roof_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Catalog preset "${call.materialPreset}" not found. Use materialColor with a hex value, or pick an existing roof preset id (e.g. "roof-tile1").` }
  }

  return {
    type: 'update_roof_material',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    role: call.role,
    materialPreset: call.materialPreset,
    materialColor: call.materialColor,
  }
}

/**
 * Validate the unified `paint_slot` tool. Looks up the target node and asks
 * the node registry which slots that kind declares. Rejects unknown slot ids
 * with a helpful list so the model can self-correct on the next turn.
 *
 * For nodes whose registry definition has no `slots` declaration (item kinds
 * whose slots come from GLB mesh names, or kinds not yet migrated), we accept
 * any non-empty string — the executor downstream resolves the GLB-scan slots
 * at paint time and will surface a real error if the slot can't be found.
 */
export function validatePaintSlot(call: PaintSlotToolCall): ValidatedPaintSlot {
  const trimmedSlot = call.slotId?.trim() ?? ''
  if (!trimmedSlot) {
    return {
      type: 'paint_slot',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      slotId: call.slotId,
      materialRef: call.materialRef,
      errorReason: 'slotId is required and cannot be empty.',
    }
  }

  if (typeof call.materialRef !== 'string') {
    return {
      type: 'paint_slot',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      slotId: trimmedSlot,
      materialRef: '',
      errorReason: 'materialRef must be a string (e.g. "library:<preset-id>" or "scene:<id>"; "" clears to default).',
    }
  }

  // Empty materialRef is a deliberate "clear to default" sentinel — accept.
  // Non-empty refs must use the canonical prefix scheme.
  if (call.materialRef && !call.materialRef.startsWith('library:') && !call.materialRef.startsWith('scene:')) {
    return {
      type: 'paint_slot',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      slotId: trimmedSlot,
      materialRef: call.materialRef,
      errorReason: `materialRef "${call.materialRef}" must start with "library:" (catalog preset) or "scene:" (minted scene material).`,
    }
  }

  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]
  if (!node) {
    return {
      type: 'paint_slot',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      slotId: trimmedSlot,
      materialRef: call.materialRef,
      errorReason: `Node "${call.nodeId}" not found.`,
    }
  }

  const def = nodeRegistry.get(node.type)
  // No registry def → reject; AI shouldn't be painting unregistered kinds.
  if (!def) {
    return {
      type: 'paint_slot',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      slotId: trimmedSlot,
      materialRef: call.materialRef,
      kind: node.type,
      errorReason: `Node kind "${node.type}" is not registered.`,
    }
  }

  // Registry-declared slots: enforce slotId is in the declared set.
  const slotsDecl = def.capabilities.slots
  if (slotsDecl) {
    const declared = slotsDecl(node).map((s: { slotId: string }) => s.slotId)
    if (!declared.includes(trimmedSlot)) {
      return {
        type: 'paint_slot',
        status: 'invalid',
        nodeId: call.nodeId as AnyNodeId,
        slotId: trimmedSlot,
        materialRef: call.materialRef,
        kind: node.type,
        errorReason: `Slot "${trimmedSlot}" is not declared for ${node.type}. Valid slots: ${declared.join(', ')}.`,
      }
    }
  }
  // No `def.slots` (e.g. item kinds whose slots come from GLB mesh names):
  // pass through — the executor's paint capability resolves the slot at
  // mutation time and will fail with a specific reason if it can't.

  // Library refs: optionally cross-check the catalog so the model gets a
  // fast "preset not found" instead of a silent render fallback.
  if (call.materialRef.startsWith('library:')) {
    const presetId = call.materialRef.slice('library:'.length)
    if (presetId && !getCatalogMaterialById(presetId)) {
      return {
        type: 'paint_slot',
        status: 'invalid',
        nodeId: call.nodeId as AnyNodeId,
        slotId: trimmedSlot,
        materialRef: call.materialRef,
        kind: node.type,
        errorReason: `Catalog preset "${presetId}" not found.`,
      }
    }
  }

  return {
    type: 'paint_slot',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    slotId: trimmedSlot,
    materialRef: call.materialRef,
    kind: node.type,
  }
}

export function validateUpdateStairMaterial(call: UpdateStairMaterialToolCall): ValidatedUpdateStairMaterial {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_stair_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Stair "${call.nodeId}" not found.` }
  }
  if (node.type !== 'stair') {
    return { type: 'update_stair_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a stair.` }
  }
  if (!VALID_STAIR_ROLES.has(call.role)) {
    return { type: 'update_stair_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Invalid role "${call.role}". Must be one of: railing, tread, side.` }
  }
  if (!call.materialPreset && !call.materialColor) {
    return { type: 'update_stair_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: 'Provide either materialPreset (catalog ID) or materialColor (hex).' }
  }
  if (call.materialPreset && !getCatalogMaterialById(call.materialPreset)) {
    return { type: 'update_stair_material', status: 'invalid', nodeId: call.nodeId as AnyNodeId, role: call.role, errorReason: `Catalog preset "${call.materialPreset}" not found. Use materialColor with a hex value, or pick an existing stair preset id (e.g. "stair-wood1").` }
  }

  return {
    type: 'update_stair_material',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    role: call.role,
    materialPreset: call.materialPreset,
    materialColor: call.materialColor,
  }
}

export function validateAddZone(call: AddZoneToolCall): ValidatedAddZone {
  // Resolve effective level ID: explicit from tool call (validated), fallback to viewer selection.
  const effectiveZoneLevel = resolveEffectiveLevelId(call.levelId)

  const polygon = call.polygon as [number, number][]

  if (!polygon || polygon.length < 3) {
    return {
      type: 'add_zone',
      status: 'invalid',
      polygon: polygon ?? [],
      errorReason: 'Zone polygon must have at least 3 points.',
    }
  }

  return {
    type: 'add_zone',
    status: 'valid',
    polygon,
    name: call.name,
    levelId: effectiveZoneLevel ?? undefined,
  }
}

export function validateUpdateZone(call: UpdateZoneToolCall): ValidatedUpdateZone {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'update_zone', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Zone "${call.nodeId}" not found.` }
  }
  if (node.type !== 'zone') {
    return { type: 'update_zone', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a zone.` }
  }

  if (call.polygon && call.polygon.length < 3) {
    return { type: 'update_zone', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'Polygon must have at least 3 points.' }
  }

  return {
    type: 'update_zone',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    polygon: call.polygon as [number, number][] | undefined,
    name: call.name,
  }
}

export function validateAddBuilding(call: AddBuildingToolCall): ValidatedAddBuilding {
  return {
    type: 'add_building',
    status: 'valid',
    position: call.position ?? [0, 0, 0],
    name: call.name,
  }
}

export function validateUpdateSite(call: UpdateSiteToolCall): ValidatedUpdateSite {
  const { nodes } = useScene.getState()
  // Find site node
  const site = Object.values(nodes).find((n) => n.type === 'site')

  if (!site) {
    return { type: 'update_site', status: 'invalid', nodeId: '' as AnyNodeId, errorReason: 'No site node found in scene.' }
  }

  if (call.polygon && call.polygon.length < 3) {
    return { type: 'update_site', status: 'invalid', nodeId: site.id as AnyNodeId, errorReason: 'Site polygon must have at least 3 points.' }
  }

  return {
    type: 'update_site',
    status: 'valid',
    nodeId: site.id as AnyNodeId,
    polygon: call.polygon as [number, number][] | undefined,
  }
}

// isValidModelUrl is defined in ai-mutation-executor.ts (the main file) and
// passed in as a reference to avoid circular imports.
// For scan/guide validators we re-declare a local copy.
function isValidModelUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function validateAddScan(call: AddScanToolCall): ValidatedAddScan {
  if (!call.url) {
    return {
      type: 'add_scan',
      status: 'invalid',
      url: '',
      position: [0, 0, 0],
      scale: 1,
      opacity: 0.5,
      errorReason: 'URL is required for scan.',
    }
  }

  if (!isValidModelUrl(call.url)) {
    return {
      type: 'add_scan',
      status: 'invalid',
      url: call.url,
      position: call.position ?? [0, 0, 0],
      scale: call.scale ?? 1,
      opacity: call.opacity ?? 0.5,
      errorReason: 'URL must be a valid http/https URL.',
    }
  }

  return {
    type: 'add_scan',
    status: 'valid',
    url: call.url,
    position: call.position ?? [0, 0, 0],
    scale: call.scale ?? 1,
    opacity: call.opacity ?? 0.5,
  }
}

export function validateAddGuide(call: AddGuideToolCall): ValidatedAddGuide {
  if (!call.url) {
    return {
      type: 'add_guide',
      status: 'invalid',
      url: '',
      position: [0, 0, 0],
      scale: 1,
      opacity: 0.5,
      errorReason: 'URL is required for guide.',
    }
  }

  if (!isValidModelUrl(call.url)) {
    return {
      type: 'add_guide',
      status: 'invalid',
      url: call.url,
      position: call.position ?? [0, 0, 0],
      scale: call.scale ?? 1,
      opacity: call.opacity ?? 0.5,
      errorReason: 'URL must be a valid http/https URL.',
    }
  }

  return {
    type: 'add_guide',
    status: 'valid',
    url: call.url,
    position: call.position ?? [0, 0, 0],
    scale: call.scale ?? 1,
    opacity: call.opacity ?? 0.5,
  }
}

// ============================================================================
// Building Move/Rotate Validator
// ============================================================================

export function validateMoveBuilding(call: MoveBuildingToolCall): ValidatedMoveBuilding {
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId]

  if (!node) {
    return { type: 'move_building', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Building node "${call.nodeId}" not found.` }
  }

  if (node.type !== 'building') {
    return { type: 'move_building', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: `Node "${call.nodeId}" is a ${node.type}, not a building.` }
  }

  if (!call.position && call.rotationY === undefined) {
    return { type: 'move_building', status: 'invalid', nodeId: call.nodeId as AnyNodeId, errorReason: 'Must specify position and/or rotationY.' }
  }

  return {
    type: 'move_building',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    position: call.position,
    rotationY: call.rotationY,
  }
}

// ============================================================================
// Clone Level Validator
// ============================================================================

export function validateCloneLevel(call: CloneLevelToolCall): ValidatedCloneLevel {
  const { nodes } = useScene.getState()
  const levelNode = nodes[call.levelId as AnyNodeId]

  if (!levelNode) {
    return { type: 'clone_level', status: 'invalid', levelId: call.levelId as AnyNodeId, errorReason: `Level node "${call.levelId}" not found.` }
  }

  if (levelNode.type !== 'level') {
    return { type: 'clone_level', status: 'invalid', levelId: call.levelId as AnyNodeId, errorReason: `Node "${call.levelId}" is a ${levelNode.type}, not a level.` }
  }

  if (!levelNode.parentId) {
    return { type: 'clone_level', status: 'invalid', levelId: call.levelId as AnyNodeId, errorReason: `Level "${call.levelId}" has no parent building. Cannot clone an orphaned level.` }
  }

  // Validation only — actual cloning happens in confirm-operations.ts
  return {
    type: 'clone_level',
    status: 'valid',
    levelId: call.levelId as AnyNodeId,
    name: call.name,
  }
}

// enter_walkthrough is handled as a special tool in ai-agent-loop.ts
// No validator needed here.

// ============================================================================
// Roof accessory validator — shared by chimney/dormer/skylight/solar-panel/
// ridge-vent/box-vent/turbine-vent/eyebrow-vent/cupola/gutter/downspout
// ============================================================================

const ROOF_ACCESSORY_KINDS = new Set([
  'chimney',
  'dormer',
  'skylight',
  'solar-panel',
  'ridge-vent',
  'box-vent',
  'turbine-vent',
  'eyebrow-vent',
  'cupola',
  'gutter',
  'downspout',
])

const ACCESSORY_DEFAULT_DIMENSIONS: Record<string, { width: number; depth: number }> = {
  chimney: { width: 0.6, depth: 0.6 },
  dormer: { width: 2.0, depth: 1.5 },
  skylight: { width: 1.0, depth: 1.0 },
  'solar-panel': { width: 1.0, depth: 1.6 },
  'ridge-vent': { width: 2.0, depth: 0.3 },
  'box-vent': { width: 0.6, depth: 0.6 },
  // turbine-vent has no width/depth in its schema — `width` carries the head
  // diameter (TurbineVentNode.diameter default 0.32); depth mirrors it.
  'turbine-vent': { width: 0.32, depth: 0.32 },
  'eyebrow-vent': { width: 0.5, depth: 0.6 },
  cupola: { width: 0.8, depth: 0.8 },
  // gutter is sized by `length` along the eave, not width/depth — these
  // mirror the U-channel profile size (GutterNode.size default 0.13).
  gutter: { width: 0.13, depth: 0.13 },
  // downspout is sized by bore diameter (DownspoutNode.diameter default 0.07).
  downspout: { width: 0.07, depth: 0.07 },
}

const GUTTER_DEFAULT_LENGTH = 2.0
const GUTTER_DEFAULT_SIZE = 0.13
const MIN_DOWNSPOUT_LENGTH = 0.1

// ---------------------------------------------------------------------------
// Gutter eave snap — shares its primitives with packages/nodes/src/gutter/eave-snap.ts.
// @aedifex/nodes peer-depends on @aedifex/editor, so the editor AI module
// cannot import the original resolver without a package cycle. Core owns the
// constants, eave-height formula, and roof-shape classification so the manual
// placement tool and this validator stay aligned.
// ---------------------------------------------------------------------------

type EaveSnapSegment = {
  roofType?: RoofType
  width?: number
  depth?: number
  wallHeight?: number
  overhang?: number
  pitch?: number
}

/** Live eave Y from a segment's wallHeight + overhang + pitch (see eave-snap.ts). */
export function computeGutterEaveY(segment: EaveSnapSegment): number {
  return computeCoreGutterEaveY({
    roofType: segment.roofType ?? 'gable',
    wallHeight: segment.wallHeight ?? 0,
    overhang: segment.overhang ?? 0,
    pitch: segment.pitch ?? 0,
  })
}

/**
 * Snap a segment-local hit to the nearest eave (drip edge) of the segment.
 * Side picking is roof-type aware: shed has a single low (+Z) eave;
 * hip/flat/dutch get a 4-way snap; everything else is ±Z.
 */
export function resolveGutterEaveSnap(
  segment: EaveSnapSegment,
  localX: number,
  localZ: number,
): { eaveX: number; eaveY: number; eaveZ: number; rotation: number } {
  const halfW = (segment.width ?? 0) / 2
  const halfD = (segment.depth ?? 0) / 2
  const overhang = segment.overhang ?? 0
  const eaveY = computeGutterEaveY(segment)
  const eaveSides = getRoofShapeEaveSides(segment.roofType ?? 'gable')

  let side: '+X' | '-X' | '+Z' | '-Z'
  if (eaveSides.length === 1) {
    side = eaveSides[0]!
  } else if (eaveSides.includes('+X')) {
    const fx = halfW > 0 ? Math.abs(localX) / halfW : 0
    const fz = halfD > 0 ? Math.abs(localZ) / halfD : 0
    if (fx > fz) side = localX < 0 ? '-X' : '+X'
    else side = localZ < 0 ? '-Z' : '+Z'
  } else {
    side = localZ < 0 ? '-Z' : '+Z'
  }

  const pinZ = Math.max(halfD, halfD + overhang - GUTTER_EAVE_TUCK_INWARD)
  const pinX = Math.max(halfW, halfW + overhang - GUTTER_EAVE_TUCK_INWARD)
  switch (side) {
    case '+Z':
      return { eaveX: localX, eaveY, eaveZ: pinZ, rotation: 0 }
    case '-Z':
      return { eaveX: localX, eaveY, eaveZ: -pinZ, rotation: Math.PI }
    case '+X':
      return { eaveX: pinX, eaveY, eaveZ: localZ, rotation: Math.PI / 2 }
    case '-X':
      return { eaveX: -pinX, eaveY, eaveZ: localZ, rotation: -Math.PI / 2 }
  }
}

export function validateAddRoofAccessory(
  // biome-ignore lint/suspicious/noExplicitAny: imported lazily to avoid circular dep
  call: any,
): import('../types/validated-types').ValidatedAddRoofAccessory {
  const kind = call.kind
  if (!ROOF_ACCESSORY_KINDS.has(kind)) {
    return {
      type: 'add_roof_accessory',
      status: 'invalid',
      kind: kind ?? 'chimney',
      roofSegmentId: call.roofSegmentId ?? '',
      position: call.position ?? [0, 0, 0],
      rotation: call.rotation ?? 0,
      width: call.width ?? 0,
      depth: call.depth ?? 0,
      errorReason: `Unknown roof accessory kind "${kind}". Allowed: ${[...ROOF_ACCESSORY_KINDS].join(', ')}.`,
    }
  }

  const defaults = ACCESSORY_DEFAULT_DIMENSIONS[kind] ?? { width: 0.5, depth: 0.5 }
  const width = call.width && call.width > 0 ? call.width : defaults.width
  const depth = call.depth && call.depth > 0 ? call.depth : defaults.depth
  const rotation = typeof call.rotation === 'number' ? call.rotation : 0
  const position: [number, number, number] = Array.isArray(call.position) && call.position.length === 3
    ? [call.position[0], call.position[1], call.position[2]]
    : [0, 0, 0]

  const { nodes } = useScene.getState()

  // Downspout anchors to a GUTTER, not directly to a segment — the manual
  // tool (packages/nodes/src/downspout/tool.tsx) drills a new outlet into the
  // host gutter and derives the scene-graph parent from gutter.roofSegmentId.
  if (kind === 'downspout') {
    const invalid = (errorReason: string): import('../types/validated-types').ValidatedAddRoofAccessory => ({
      type: 'add_roof_accessory',
      status: 'invalid',
      kind,
      roofSegmentId: call.roofSegmentId ?? '',
      position,
      rotation,
      width,
      depth,
      gutterId: call.gutterId ?? '',
      errorReason,
    })

    if (!call.gutterId) {
      return invalid(
        'Downspout requires "gutterId" — the gutter it drains. Create a gutter first (add_roof_accessory kind="gutter"), then pass its node ID.',
      )
    }
    const gutter = nodes[call.gutterId as AnyNodeId]
    if (!gutter) {
      return invalid(`Gutter "${call.gutterId}" not found. Pass a valid gutter node ID.`)
    }
    if (gutter.type !== 'gutter') {
      return invalid(
        `Node "${call.gutterId}" is a ${gutter.type}, not a gutter. A downspout drains a gutter — create one first (add_roof_accessory kind="gutter").`,
      )
    }
    const hostSegmentId = gutter.roofSegmentId
    const hostSegment = hostSegmentId ? nodes[hostSegmentId as AnyNodeId] : undefined
    if (!hostSegment || hostSegment.type !== 'roof-segment') {
      return invalid(
        `Gutter "${call.gutterId}" has no valid host roof-segment (roofSegmentId="${hostSegmentId ?? ''}"). Cannot mount a downspout on it.`,
      )
    }

    // Drop from the gutter outlet (eaveY − gutter size) down to segment Y = 0
    // — same formula as the manual tool's dropLength. The 0.04 floor mirrors
    // gutterDims() in packages/nodes/src/gutter/outlet-lookup.ts (the manual
    // path clamps size before deriving the outlet Y).
    const gutterSize = Math.max(
      0.04,
      typeof gutter.size === 'number' ? gutter.size : GUTTER_DEFAULT_SIZE,
    )
    const autoLength = Math.max(MIN_DOWNSPOUT_LENGTH, computeGutterEaveY(hostSegment) - gutterSize)
    const length = call.length && call.length > 0 ? call.length : autoLength
    const outletOffset = typeof call.offsetAlongGutter === 'number' ? call.offsetAlongGutter : 0

    return {
      type: 'add_roof_accessory',
      status: 'valid',
      kind,
      roofSegmentId: hostSegmentId as string,
      position,
      rotation,
      width,
      depth,
      length,
      gutterId: call.gutterId,
      outletOffset,
    }
  }

  // Resolve parent roof segment from scene
  const segment = call.roofSegmentId ? nodes[call.roofSegmentId as AnyNodeId] : undefined

  if (!segment) {
    return {
      type: 'add_roof_accessory',
      status: 'invalid',
      kind,
      roofSegmentId: call.roofSegmentId ?? '',
      position,
      rotation,
      width,
      depth,
      heightAboveRidge: call.heightAboveRidge,
      errorReason: `Roof segment "${call.roofSegmentId}" not found. Pass a valid roof-segment node ID.`,
    }
  }

  if (segment.type !== 'roof-segment') {
    return {
      type: 'add_roof_accessory',
      status: 'invalid',
      kind,
      roofSegmentId: call.roofSegmentId,
      position,
      rotation,
      width,
      depth,
      heightAboveRidge: call.heightAboveRidge,
      errorReason: `Node "${call.roofSegmentId}" is a ${segment.type}, not a roof-segment. Use add_roof first to create a roof, then attach accessories to its segment.`,
    }
  }

  // Gutter mounts on the eave (drip edge), not the slope surface. Treat the
  // LLM's position as the cursor hit and snap it like the manual tool does;
  // rotation comes from the snap (outward axis away from the building).
  if (kind === 'gutter') {
    const snap = resolveGutterEaveSnap(segment, position[0], position[2])
    const length = call.length && call.length > 0 ? call.length : GUTTER_DEFAULT_LENGTH
    return {
      type: 'add_roof_accessory',
      status: 'valid',
      kind,
      roofSegmentId: call.roofSegmentId,
      position: [snap.eaveX, snap.eaveY, snap.eaveZ],
      rotation: snap.rotation,
      width,
      depth,
      length,
    }
  }

  return {
    type: 'add_roof_accessory',
    status: 'valid',
    kind,
    roofSegmentId: call.roofSegmentId,
    position,
    rotation,
    width,
    depth,
    ...(kind === 'chimney' ? { heightAboveRidge: call.heightAboveRidge ?? 1.0 } : {}),
  }
}

// ============================================================================
// MEP validators — Phase 2 §6.2
// Each add_* tool constructs one MEP node under the target level. All share a
// helper that resolves the effective level id from the tool call or viewer
// selection; every non-node field is range-checked against the underlying zod
// schema so downstream ZodError parses do not leak into the LLM tool result.
// ============================================================================

/** Validate that a polyline path has ≥2 points and every point is a length-3
 * numeric tuple. Returns a normalized tuple array or an errorReason string. */
function normalizePolylinePath(
  input: unknown,
  fieldName: string,
): { points: [number, number, number][] } | { errorReason: string } {
  if (!Array.isArray(input) || input.length < 2) {
    return { errorReason: `${fieldName} must be an array of at least 2 [x, y, z] points.` }
  }
  const points: [number, number, number][] = []
  for (let i = 0; i < input.length; i++) {
    const p = input[i]
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      typeof p[0] !== 'number' ||
      typeof p[1] !== 'number' ||
      typeof p[2] !== 'number'
    ) {
      return { errorReason: `${fieldName}[${i}] must be a numeric [x, y, z] triple.` }
    }
    points.push([p[0], p[1], p[2]])
  }
  return { points }
}

const DUCT_SEGMENT_CROSS_SECTIONS = new Set(['round', 'rect'])
const DUCT_SEGMENT_SYSTEMS = new Set(['supply', 'return'])

export function validateAddDuctSegment(call: AddDuctSegmentToolCall): ValidatedAddDuctSegment {
  const levelId = resolveEffectiveLevelId(call.levelId) ?? undefined
  const crossSection = call.crossSection ?? 'round'
  const system = call.system ?? 'supply'
  // Runtime enum guard — validator must reject invalid enums BEFORE the
  // executor calls DuctSegmentNode.parse() (which throws ZodError and would
  // otherwise abort the whole batch). Schema only accepts round/rect and
  // supply/return; upstream tool-call JSON is user-provided so we can't trust
  // it to obey the schema.
  if (!DUCT_SEGMENT_CROSS_SECTIONS.has(crossSection)) {
    return {
      type: 'add_duct_segment',
      status: 'invalid',
      points: [],
      crossSection,
      system,
      levelId,
      errorReason: `crossSection "${crossSection}" is not one of: round, rect.`,
    }
  }
  if (!DUCT_SEGMENT_SYSTEMS.has(system)) {
    return {
      type: 'add_duct_segment',
      status: 'invalid',
      points: [],
      crossSection,
      system,
      levelId,
      errorReason: `system "${system}" is not one of: supply, return.`,
    }
  }
  const parsed = normalizePolylinePath(call.points, 'points')
  if ('errorReason' in parsed) {
    return {
      type: 'add_duct_segment',
      status: 'invalid',
      points: [],
      crossSection,
      system,
      levelId,
      errorReason: parsed.errorReason,
    }
  }
  if (crossSection === 'round') {
    const diameter = call.diameter ?? 6
    if (diameter < 2 || diameter > 48) {
      return {
        type: 'add_duct_segment',
        status: 'invalid',
        points: parsed.points,
        crossSection,
        diameter,
        system,
        levelId,
        errorReason: `Round duct diameter ${diameter}" is out of range (2-48).`,
      }
    }
    return {
      type: 'add_duct_segment',
      status: 'valid',
      points: parsed.points,
      crossSection,
      diameter,
      system,
      levelId,
    }
  }
  // rect
  const width = call.width ?? 14
  const height = call.height ?? 8
  if (width < 4 || width > 60) {
    return {
      type: 'add_duct_segment',
      status: 'invalid',
      points: parsed.points,
      crossSection,
      width,
      height,
      system,
      levelId,
      errorReason: `Rect duct width ${width}" is out of range (4-60).`,
    }
  }
  if (height < 3 || height > 40) {
    return {
      type: 'add_duct_segment',
      status: 'invalid',
      points: parsed.points,
      crossSection,
      width,
      height,
      system,
      levelId,
      errorReason: `Rect duct height ${height}" is out of range (3-40).`,
    }
  }
  return {
    type: 'add_duct_segment',
    status: 'valid',
    points: parsed.points,
    crossSection,
    width,
    height,
    system,
    levelId,
  }
}

const DUCT_FITTING_KINDS = new Set(['elbow', 'tee', 'reducer', 'cap'])

export function validateAddDuctFitting(call: AddDuctFittingToolCall): ValidatedAddDuctFitting {
  const levelId = resolveEffectiveLevelId(call.levelId) ?? undefined
  const position = call.position ?? [0, 0, 0]
  const rotation = call.rotation ?? [0, 0, 0]
  if (!Array.isArray(position) || position.length !== 3) {
    return {
      type: 'add_duct_fitting',
      status: 'invalid',
      position: [0, 0, 0],
      rotation,
      fittingType: call.fittingType ?? 'elbow',
      levelId,
      errorReason: 'position must be a [x, y, z] numeric triple.',
    }
  }
  if (!DUCT_FITTING_KINDS.has(call.fittingType)) {
    return {
      type: 'add_duct_fitting',
      status: 'invalid',
      position,
      rotation,
      fittingType: call.fittingType ?? 'elbow',
      levelId,
      errorReason: `fittingType "${call.fittingType}" is not one of: ${[...DUCT_FITTING_KINDS].join(', ')}.`,
    }
  }
  const diameter = call.portSizes?.diameter
  const diameter2 = call.portSizes?.diameter2
  if (diameter !== undefined && (diameter < 2 || diameter > 48)) {
    return {
      type: 'add_duct_fitting',
      status: 'invalid',
      position,
      rotation,
      fittingType: call.fittingType,
      diameter,
      diameter2,
      levelId,
      errorReason: `portSizes.diameter ${diameter}" is out of range (2-48).`,
    }
  }
  if (diameter2 !== undefined && (diameter2 < 2 || diameter2 > 48)) {
    return {
      type: 'add_duct_fitting',
      status: 'invalid',
      position,
      rotation,
      fittingType: call.fittingType,
      diameter,
      diameter2,
      levelId,
      errorReason: `portSizes.diameter2 ${diameter2}" is out of range (2-48).`,
    }
  }
  return {
    type: 'add_duct_fitting',
    status: 'valid',
    position,
    rotation,
    fittingType: call.fittingType,
    diameter,
    diameter2,
    levelId,
  }
}

const DUCT_TERMINAL_KINDS = new Set(['supply', 'return', 'diffuser'])

export function validateAddDuctTerminal(call: AddDuctTerminalToolCall): ValidatedAddDuctTerminal {
  const levelId = resolveEffectiveLevelId(call.levelId) ?? undefined
  const position = call.position ?? [0, 0, 0]
  const rotation = call.rotation ?? 0
  if (!Array.isArray(position) || position.length !== 3) {
    return {
      type: 'add_duct_terminal',
      status: 'invalid',
      position: [0, 0, 0],
      terminalType: call.terminalType ?? 'supply',
      rotation,
      levelId,
      errorReason: 'position must be a [x, y, z] numeric triple.',
    }
  }
  if (!DUCT_TERMINAL_KINDS.has(call.terminalType)) {
    return {
      type: 'add_duct_terminal',
      status: 'invalid',
      position,
      terminalType: call.terminalType ?? 'supply',
      rotation,
      levelId,
      errorReason: `terminalType "${call.terminalType}" is not one of: ${[...DUCT_TERMINAL_KINDS].join(', ')}.`,
    }
  }
  if (call.hostId) {
    const { nodes } = useScene.getState()
    const host = nodes[call.hostId as AnyNodeId]
    if (!host) {
      return {
        type: 'add_duct_terminal',
        status: 'invalid',
        position,
        hostId: call.hostId,
        terminalType: call.terminalType,
        rotation,
        levelId,
        errorReason: `hostId "${call.hostId}" not found in scene.`,
      }
    }
  }
  return {
    type: 'add_duct_terminal',
    status: 'valid',
    position,
    hostId: call.hostId,
    terminalType: call.terminalType,
    rotation,
    levelId,
  }
}

const PIPE_KIND_KINDS = new Set(['dwv', 'supply', 'gas'])

export function validateAddPipeSegment(call: AddPipeSegmentToolCall): ValidatedAddPipeSegment {
  const levelId = resolveEffectiveLevelId(call.levelId) ?? undefined
  const pipeKind = call.pipeKind ?? 'dwv'
  const diameter = call.diameter ?? 2
  // Runtime enum guard — validator rejects invalid pipeKind values BEFORE the
  // executor calls PipeSegmentNode.parse(). Currently the executor collapses
  // dwv/supply/gas → schema 'waste' (see confirm-operations.ts), so any
  // non-canonical pipeKind is silently repurposed; that's fine at parse-time
  // but we still need to reject genuinely invalid strings here.
  if (!PIPE_KIND_KINDS.has(pipeKind)) {
    return {
      type: 'add_pipe_segment',
      status: 'invalid',
      points: [],
      diameter,
      pipeKind,
      levelId,
      errorReason: `pipeKind "${pipeKind}" is not one of: dwv, supply, gas.`,
    }
  }
  const parsed = normalizePolylinePath(call.points, 'points')
  if ('errorReason' in parsed) {
    return {
      type: 'add_pipe_segment',
      status: 'invalid',
      points: [],
      diameter,
      pipeKind,
      levelId,
      errorReason: parsed.errorReason,
    }
  }
  if (diameter < 1.25 || diameter > 8) {
    return {
      type: 'add_pipe_segment',
      status: 'invalid',
      points: parsed.points,
      diameter,
      pipeKind,
      levelId,
      errorReason: `diameter ${diameter}" is out of range (1.25-8).`,
    }
  }
  return {
    type: 'add_pipe_segment',
    status: 'valid',
    points: parsed.points,
    diameter,
    pipeKind,
    levelId,
  }
}

const PIPE_FITTING_KINDS = new Set(['elbow', 'tee', 'wye', 'reducer'])

export function validateAddPipeFitting(call: AddPipeFittingToolCall): ValidatedAddPipeFitting {
  const levelId = resolveEffectiveLevelId(call.levelId) ?? undefined
  const position = call.position ?? [0, 0, 0]
  const rotation = call.rotation ?? [0, 0, 0]
  const diameter = call.diameter ?? 2
  if (!Array.isArray(position) || position.length !== 3) {
    return {
      type: 'add_pipe_fitting',
      status: 'invalid',
      position: [0, 0, 0],
      rotation,
      fittingType: call.fittingType ?? 'elbow',
      diameter,
      levelId,
      errorReason: 'position must be a [x, y, z] numeric triple.',
    }
  }
  if (!PIPE_FITTING_KINDS.has(call.fittingType)) {
    return {
      type: 'add_pipe_fitting',
      status: 'invalid',
      position,
      rotation,
      fittingType: call.fittingType ?? 'elbow',
      diameter,
      levelId,
      errorReason: `fittingType "${call.fittingType}" is not one of: ${[...PIPE_FITTING_KINDS].join(', ')}.`,
    }
  }
  if (diameter < 1.25 || diameter > 8) {
    return {
      type: 'add_pipe_fitting',
      status: 'invalid',
      position,
      rotation,
      fittingType: call.fittingType,
      diameter,
      levelId,
      errorReason: `diameter ${diameter}" is out of range (1.25-8).`,
    }
  }
  return {
    type: 'add_pipe_fitting',
    status: 'valid',
    position,
    rotation,
    fittingType: call.fittingType,
    diameter,
    levelId,
  }
}

const PIPE_TRAP_KINDS = new Set(['p-trap', 's-trap'])

export function validateAddPipeTrap(call: AddPipeTrapToolCall): ValidatedAddPipeTrap {
  const levelId = resolveEffectiveLevelId(call.levelId) ?? undefined
  const position = call.position ?? [0, 0, 0]
  const rotation = call.rotation ?? 0
  const diameter = call.diameter ?? 2
  const trapType = call.trapType ?? 'p-trap'
  if (!Array.isArray(position) || position.length !== 3) {
    return {
      type: 'add_pipe_trap',
      status: 'invalid',
      position: [0, 0, 0],
      rotation,
      diameter,
      trapType,
      levelId,
      errorReason: 'position must be a [x, y, z] numeric triple.',
    }
  }
  if (diameter < 1.25 || diameter > 4) {
    return {
      type: 'add_pipe_trap',
      status: 'invalid',
      position,
      rotation,
      diameter,
      trapType,
      levelId,
      errorReason: `diameter ${diameter}" is out of range (1.25-4).`,
    }
  }
  if (!PIPE_TRAP_KINDS.has(trapType)) {
    return {
      type: 'add_pipe_trap',
      status: 'invalid',
      position,
      rotation,
      diameter,
      trapType,
      levelId,
      errorReason: `trapType "${trapType}" is not one of: p-trap, s-trap.`,
    }
  }
  return {
    type: 'add_pipe_trap',
    status: 'valid',
    position,
    rotation,
    diameter,
    trapType,
    levelId,
  }
}

const HVAC_EQUIPMENT_KINDS = new Set(['indoor-unit', 'outdoor-unit', 'ahu'])

export function validateAddHvacEquipment(call: AddHvacEquipmentToolCall): ValidatedAddHvacEquipment {
  const levelId = resolveEffectiveLevelId(call.levelId) ?? undefined
  const position = call.position ?? [0, 0, 0]
  const rotation = call.rotation ?? 0
  const width = call.width ?? 0.56
  const depth = call.depth ?? 0.71
  const height = call.height ?? 1.1
  if (!Array.isArray(position) || position.length !== 3) {
    return {
      type: 'add_hvac_equipment',
      status: 'invalid',
      position: [0, 0, 0],
      rotation,
      equipmentType: call.equipmentType ?? 'indoor-unit',
      width, depth, height,
      levelId,
      errorReason: 'position must be a [x, y, z] numeric triple.',
    }
  }
  if (!HVAC_EQUIPMENT_KINDS.has(call.equipmentType)) {
    return {
      type: 'add_hvac_equipment',
      status: 'invalid',
      position,
      rotation,
      equipmentType: call.equipmentType ?? 'indoor-unit',
      width, depth, height,
      levelId,
      errorReason: `equipmentType "${call.equipmentType}" is not one of: ${[...HVAC_EQUIPMENT_KINDS].join(', ')}.`,
    }
  }
  if (width < 0.3 || width > 2) {
    return {
      type: 'add_hvac_equipment',
      status: 'invalid',
      position, rotation,
      equipmentType: call.equipmentType,
      width, depth, height,
      levelId,
      errorReason: `width ${width}m is out of range (0.3-2).`,
    }
  }
  if (depth < 0.3 || depth > 2) {
    return {
      type: 'add_hvac_equipment',
      status: 'invalid',
      position, rotation,
      equipmentType: call.equipmentType,
      width, depth, height,
      levelId,
      errorReason: `depth ${depth}m is out of range (0.3-2).`,
    }
  }
  if (height < 0.4 || height > 2.5) {
    return {
      type: 'add_hvac_equipment',
      status: 'invalid',
      position, rotation,
      equipmentType: call.equipmentType,
      width, depth, height,
      levelId,
      errorReason: `height ${height}m is out of range (0.4-2.5).`,
    }
  }
  return {
    type: 'add_hvac_equipment',
    status: 'valid',
    position, rotation,
    equipmentType: call.equipmentType,
    width, depth, height,
    levelId,
  }
}

/** Shared helper for add_lineset / add_liquid_line: both connect two
 * hvac-equipment nodes, optionally along an explicit polyline route. */
function resolveMepConnectionRoute(
  call: { fromId: string; toId: string; route?: [number, number, number][] },
): { fromId: AnyNodeId; toId: AnyNodeId; route: [number, number, number][]; levelId?: string } | { errorReason: string } {
  const { nodes } = useScene.getState()
  if (!call.fromId) return { errorReason: 'fromId is required.' }
  if (!call.toId) return { errorReason: 'toId is required.' }
  const from = nodes[call.fromId as AnyNodeId]
  const to = nodes[call.toId as AnyNodeId]
  if (!from) return { errorReason: `fromId "${call.fromId}" not found in scene.` }
  if (!to) return { errorReason: `toId "${call.toId}" not found in scene.` }
  if (from.type !== 'hvac-equipment') {
    return { errorReason: `fromId "${call.fromId}" is a ${from.type}, not hvac-equipment.` }
  }
  if (to.type !== 'hvac-equipment') {
    return { errorReason: `toId "${call.toId}" is a ${to.type}, not hvac-equipment.` }
  }
  const levelId = (from as { parentId?: string }).parentId ?? (to as { parentId?: string }).parentId
  let route: [number, number, number][]
  if (call.route && Array.isArray(call.route)) {
    const parsed = normalizePolylinePath(call.route, 'route')
    if ('errorReason' in parsed) return parsed
    route = parsed.points
  } else {
    const fromPos = (from as { position?: [number, number, number] }).position ?? [0, 0, 0]
    const toPos = (to as { position?: [number, number, number] }).position ?? [0, 0, 0]
    route = [
      [fromPos[0], fromPos[1], fromPos[2]],
      [toPos[0], toPos[1], toPos[2]],
    ]
  }
  return { fromId: call.fromId as AnyNodeId, toId: call.toId as AnyNodeId, route, levelId }
}

export function validateAddLineset(call: AddLinesetToolCall): ValidatedAddLineset {
  const resolved = resolveMepConnectionRoute(call)
  if ('errorReason' in resolved) {
    return {
      type: 'add_lineset',
      status: 'invalid',
      fromId: (call.fromId ?? '') as AnyNodeId,
      toId: (call.toId ?? '') as AnyNodeId,
      route: [],
      errorReason: resolved.errorReason,
    }
  }
  return {
    type: 'add_lineset',
    status: 'valid',
    fromId: resolved.fromId,
    toId: resolved.toId,
    route: resolved.route,
    levelId: resolved.levelId,
  }
}

export function validateAddLiquidLine(call: AddLiquidLineToolCall): ValidatedAddLiquidLine {
  const resolved = resolveMepConnectionRoute(call)
  if ('errorReason' in resolved) {
    return {
      type: 'add_liquid_line',
      status: 'invalid',
      fromId: (call.fromId ?? '') as AnyNodeId,
      toId: (call.toId ?? '') as AnyNodeId,
      route: [],
      errorReason: resolved.errorReason,
    }
  }
  return {
    type: 'add_liquid_line',
    status: 'valid',
    fromId: resolved.fromId,
    toId: resolved.toId,
    route: resolved.route,
    levelId: resolved.levelId,
  }
}

// ============================================================================
// align_opening_to_nearest validator — Phase 2 §6.4
// Uses the shared opening-guides service to find the nearest along-wall (or
// vertical) sibling and returns the snap delta so the executor can rewrite
// position via apply_patch.
// ============================================================================

const ALIGN_AXIS_KINDS = new Set(['horizontal', 'vertical', 'both'])

export function validateAlignOpeningToNearest(
  call: AlignOpeningToNearestToolCall,
): ValidatedAlignOpeningToNearest {
  const axis = call.axis ?? 'both'
  if (!ALIGN_AXIS_KINDS.has(axis)) {
    return {
      type: 'align_opening_to_nearest',
      status: 'invalid',
      nodeId: (call.nodeId ?? '') as AnyNodeId,
      axis,
      errorReason: `axis "${axis}" is not one of: horizontal, vertical, both.`,
    }
  }
  const { nodes } = useScene.getState()
  const node = nodes[call.nodeId as AnyNodeId] as
    | { type: string; wallId?: string; position?: [number, number, number]; width?: number; height?: number; id?: string }
    | undefined
  if (!node) {
    return {
      type: 'align_opening_to_nearest',
      status: 'invalid',
      nodeId: (call.nodeId ?? '') as AnyNodeId,
      axis,
      errorReason: `Node "${call.nodeId}" not found.`,
    }
  }
  if (node.type !== 'door' && node.type !== 'window') {
    return {
      type: 'align_opening_to_nearest',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      axis,
      errorReason: `Node "${call.nodeId}" is a ${node.type}, not a door or window.`,
    }
  }
  const wall = node.wallId ? nodes[node.wallId as AnyNodeId] : undefined
  if (!wall || wall.type !== 'wall') {
    return {
      type: 'align_opening_to_nearest',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      axis,
      errorReason: `Opening "${call.nodeId}" is not hosted on a wall (wallId="${node.wallId ?? ''}").`,
    }
  }

  const wallNode = wall as { start?: [number, number]; end?: [number, number]; height?: number; children?: string[] }
  const start = wallNode.start ?? [0, 0]
  const end = wallNode.end ?? [0, 0]
  const wallLength = Math.hypot(end[0] - start[0], end[1] - start[1])
  const wallHeight = wallNode.height ?? 2.5

  // Prefer siblings hinted by the live alignment-guides store when the user
  // is mid-drag on this wall — the store's candidateNodeId tells us which
  // openings the UI already considered relevant. This lets align_opening_to_nearest
  // stay consistent with what's rendered on screen. When the store is empty
  // (headless AI batch, no active drag) we fall back to enumerating wall.children
  // so this path still works without any UI state.
  const activeGuides = useAlignmentGuides.getState().guides
  const hintedSiblingIds = new Set<string>()
  if (activeGuides.length > 0) {
    for (const g of activeGuides) {
      if (g.candidateNodeId && g.candidateNodeId !== node.id) {
        hintedSiblingIds.add(g.candidateNodeId)
      }
    }
  }

  const siblings: { id: string; centerS: number; width: number; centerY: number; height: number }[] = []
  for (const childId of wallNode.children ?? []) {
    if (childId === node.id) continue
    const sib = nodes[childId as AnyNodeId] as
      | { id: string; type: string; position?: [number, number, number]; width?: number; height?: number }
      | undefined
    if (!sib || (sib.type !== 'door' && sib.type !== 'window')) continue
    siblings.push({
      id: sib.id,
      centerS: sib.position?.[0] ?? 0,
      width: sib.width ?? 0,
      centerY: sib.position?.[1] ?? 0,
      height: sib.height ?? 0,
    })
  }

  // If the store hinted at specific candidates on this wall, prioritize them —
  // computeOpeningGuides scores all siblings the same, but the drag UI has
  // already narrowed focus. Filter siblings to the hinted set when any hint
  // matches a real sibling; otherwise keep the full wall-child list.
  const hintedSiblings = siblings.filter((s) => hintedSiblingIds.has(s.id))
  const effectiveSiblings = hintedSiblings.length > 0 ? hintedSiblings : siblings

  const originalPosition: [number, number, number] = node.position ?? [0, 0, 0]
  const guides = computeOpeningGuides({
    moving: {
      id: node.id ?? call.nodeId,
      centerS: originalPosition[0],
      width: node.width ?? 0,
      centerY: originalPosition[1],
      height: node.height ?? 0,
    },
    siblings: effectiveSiblings,
    wall: { length: wallLength, height: wallHeight },
    includeVertical: node.type === 'window',
  })

  let snapDeltaS = 0
  let snapDeltaY = 0
  const appliedSnaps: ValidatedAlignOpeningToNearest['appliedSnaps'] = {}

  if ((axis === 'horizontal' || axis === 'both') && guides.alongWall) {
    snapDeltaS = guides.alongWall.snap
    appliedSnaps.alongWall = {
      delta: guides.alongWall.snap,
      feature: guides.alongWall.movingFeature,
      targetId: guides.alongWall.targetId,
    }
  }
  if ((axis === 'vertical' || axis === 'both') && guides.vertical) {
    snapDeltaY = guides.vertical.snap
    appliedSnaps.vertical = {
      delta: guides.vertical.snap,
      feature: guides.vertical.movingFeature,
      targetId: guides.vertical.targetId,
    }
  }

  if (!appliedSnaps.alongWall && !appliedSnaps.vertical) {
    return {
      type: 'align_opening_to_nearest',
      status: 'invalid',
      nodeId: call.nodeId as AnyNodeId,
      axis,
      originalPosition,
      errorReason: 'No alignment target found within tolerance on this wall. Add sibling openings first or move the target closer.',
    }
  }

  const snappedPosition: [number, number, number] = [
    originalPosition[0] + snapDeltaS,
    originalPosition[1] + snapDeltaY,
    originalPosition[2],
  ]

  return {
    type: 'align_opening_to_nearest',
    status: 'valid',
    nodeId: call.nodeId as AnyNodeId,
    axis,
    originalPosition,
    snappedPosition,
    appliedSnaps,
  }
}
