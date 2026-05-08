import {
  type AnyNode,
  type AnyNodeId,
  getCatalogMaterialById,
  useScene,
} from '@aedifex/core'
import { useViewer } from '@aedifex/viewer'
import type {
  AddBuildingToolCall,
  AddCeilingToolCall,
  AddGuideToolCall,
  AddLevelToolCall,
  AddRoofToolCall,
  AddScanToolCall,
  AddSlabToolCall,
  AddStairToolCall,
  AddZoneToolCall,
  CloneLevelToolCall,
  MoveBuildingToolCall,
  UpdateCeilingToolCall,
  UpdateRoofMaterialToolCall,
  UpdateRoofToolCall,
  UpdateSiteToolCall,
  UpdateSlabToolCall,
  UpdateStairMaterialToolCall,
  UpdateStairToolCall,
  UpdateZoneToolCall,
  ValidatedAddBuilding,
  ValidatedAddCeiling,
  ValidatedAddGuide,
  ValidatedAddLevel,
  ValidatedAddRoof,
  ValidatedAddScan,
  ValidatedAddSlab,
  ValidatedAddStair,
  ValidatedAddZone,
  ValidatedCloneLevel,
  ValidatedMoveBuilding,
  ValidatedUpdateCeiling,
  ValidatedUpdateRoof,
  ValidatedUpdateRoofMaterial,
  ValidatedUpdateSite,
  ValidatedUpdateSlab,
  ValidatedUpdateStair,
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
  const adjustmentReason = irrelevantWarnings.length > 0
    ? `${irrelevantWarnings.join(', ')} ignored for stairType=${stairKind} (only applies to ${stairKind === 'straight' ? 'curved/spiral' : 'straight'} stairs).`
    : undefined

  return {
    type: 'add_stair',
    status: adjustmentReason ? 'adjusted' : 'valid',
    position: call.position ?? [0, 0, 0],
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
