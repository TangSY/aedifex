import type { AnyNodeId, AssetInput } from '@aedifex/core'

// ============================================================================
// Validated Operation (output of mutation executor)
// ============================================================================

export type ValidatedOperationStatus = 'valid' | 'adjusted' | 'invalid'

export interface ValidatedAddItem {
  type: 'add_item'
  status: ValidatedOperationStatus
  /** Resolved catalog asset. May be undefined when status is 'invalid' (e.g. missing catalogSlug). */
  asset?: AssetInput
  position: [number, number, number]
  rotation: [number, number, number]
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedRemoveItem {
  type: 'remove_item'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  errorReason?: string
}

export interface ValidatedMoveItem {
  type: 'move_item'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  position: [number, number, number]
  rotation: [number, number, number]
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateMaterial {
  type: 'update_material'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  material: string
  errorReason?: string
}

export interface ValidatedAddWall {
  type: 'add_wall'
  status: ValidatedOperationStatus
  start: [number, number]
  end: [number, number]
  thickness: number
  height?: number
  curveOffset?: number
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateWall {
  type: 'update_wall'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  height?: number
  thickness?: number
  start?: [number, number]
  end?: [number, number]
  curveOffset?: number
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateWallMaterial {
  type: 'update_wall_material'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  side: 'interior' | 'exterior' | 'both'
  materialPreset?: string
  materialColor?: string
  errorReason?: string
}

export interface ValidatedUpdateRoofMaterial {
  type: 'update_roof_material'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  role: 'top' | 'edge' | 'wall'
  materialPreset?: string
  materialColor?: string
  errorReason?: string
}

export interface ValidatedUpdateStairMaterial {
  type: 'update_stair_material'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  role: 'railing' | 'tread' | 'side'
  materialPreset?: string
  materialColor?: string
  errorReason?: string
}

export interface ValidatedUpdateDoor {
  type: 'update_door'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  width?: number
  height?: number
  localX?: number
  localY?: number
  side?: 'front' | 'back'
  hingesSide?: 'left' | 'right'
  swingDirection?: 'inward' | 'outward'
  errorReason?: string
  adjustmentReason?: string
}

export interface ValidatedUpdateWindow {
  type: 'update_window'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  width?: number
  height?: number
  localX?: number
  localY?: number
  side?: 'front' | 'back'
  errorReason?: string
  adjustmentReason?: string
}

export interface ValidatedAddDoor {
  type: 'add_door'
  status: ValidatedOperationStatus
  wallId: AnyNodeId
  /** Wall-local X position (center of door) */
  localX: number
  /** Wall-local Y position (center of door = height/2) */
  localY: number
  width: number
  height: number
  side?: 'front' | 'back'
  hingesSide: 'left' | 'right'
  swingDirection: 'inward' | 'outward'
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedAddWindow {
  type: 'add_window'
  status: ValidatedOperationStatus
  wallId: AnyNodeId
  /** Wall-local X position (center of window) */
  localX: number
  /** Wall-local Y position (center of window) */
  localY: number
  width: number
  height: number
  side?: 'front' | 'back'
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedRemoveNode {
  type: 'remove_node'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  nodeType: string
  errorReason?: string
}

// --- New Validated Operations ---

export interface ValidatedAddLevel {
  type: 'add_level'
  status: ValidatedOperationStatus
  level: number
  name?: string
  buildingId: AnyNodeId
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedAddSlab {
  type: 'add_slab'
  status: ValidatedOperationStatus
  polygon: [number, number][]
  elevation: number
  holes: [number, number][][]
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateSlab {
  type: 'update_slab'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  elevation?: number
  polygon?: [number, number][]
  errorReason?: string
}

export interface ValidatedAddCeiling {
  type: 'add_ceiling'
  status: ValidatedOperationStatus
  polygon: [number, number][]
  height: number
  material?: string
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateCeiling {
  type: 'update_ceiling'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  height?: number
  material?: string
  errorReason?: string
}

export interface ValidatedAddRoof {
  type: 'add_roof'
  status: ValidatedOperationStatus
  position: [number, number, number]
  width: number
  depth: number
  roofType: 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat'
  roofHeight: number
  wallHeight: number
  overhang: number
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedAddStair {
  type: 'add_stair'
  status: ValidatedOperationStatus
  position: [number, number, number]
  rotation: number
  width: number
  length: number
  height: number
  stepCount: number
  stairType?: 'straight' | 'curved' | 'spiral'
  slabOpeningMode?: 'none' | 'destination'
  openingOffset?: number
  fillToFloor?: boolean
  innerRadius?: number
  sweepAngle?: number
  topLandingMode?: 'none' | 'integrated'
  topLandingDepth?: number
  showCenterColumn?: boolean
  showStepSupports?: boolean
  railingMode?: 'none' | 'left' | 'right' | 'both'
  railingHeight?: number
  fromLevelId?: string | null
  toLevelId?: string | null
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateStair {
  type: 'update_stair'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  position?: [number, number, number]
  rotation?: number
  width?: number
  length?: number
  height?: number
  stepCount?: number
  stairType?: 'straight' | 'curved' | 'spiral'
  slabOpeningMode?: 'none' | 'destination'
  openingOffset?: number
  fillToFloor?: boolean
  innerRadius?: number
  sweepAngle?: number
  topLandingMode?: 'none' | 'integrated'
  topLandingDepth?: number
  showCenterColumn?: boolean
  showStepSupports?: boolean
  railingMode?: 'none' | 'left' | 'right' | 'both'
  railingHeight?: number
  fromLevelId?: string | null
  toLevelId?: string | null
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateRoof {
  type: 'update_roof'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  roofType?: 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat'
  roofHeight?: number
  wallHeight?: number
  width?: number
  depth?: number
  errorReason?: string
}

export interface ValidatedAddZone {
  type: 'add_zone'
  status: ValidatedOperationStatus
  polygon: [number, number][]
  name?: string
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateZone {
  type: 'update_zone'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  polygon?: [number, number][]
  name?: string
  errorReason?: string
}

export interface ValidatedAddBuilding {
  type: 'add_building'
  status: ValidatedOperationStatus
  position: [number, number, number]
  name?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateSite {
  type: 'update_site'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  polygon?: [number, number][]
  errorReason?: string
}

export interface ValidatedAddScan {
  type: 'add_scan'
  status: ValidatedOperationStatus
  url: string
  position: [number, number, number]
  scale: number
  opacity: number
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedAddGuide {
  type: 'add_guide'
  status: ValidatedOperationStatus
  url: string
  position: [number, number, number]
  scale: number
  opacity: number
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateItem {
  type: 'update_item'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  scale?: [number, number, number]
  errorReason?: string
}

export interface ValidatedMoveBuilding {
  type: 'move_building'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  position?: [number, number, number]
  rotationY?: number
  errorReason?: string
}

export interface ValidatedCloneLevel {
  type: 'clone_level'
  status: ValidatedOperationStatus
  levelId: AnyNodeId
  name?: string
  errorReason?: string
}

export interface ValidatedEnterWalkthrough {
  type: 'enter_walkthrough'
  status: ValidatedOperationStatus
  errorReason?: string
}

export interface ValidatedAddFence {
  type: 'add_fence'
  status: ValidatedOperationStatus
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
  style: 'slat' | 'rail' | 'privacy'
  baseStyle: 'floating' | 'grounded'
  color: string
  postSpacing: number
  curveOffset?: number
  /** Resolved target level ID (from tool call or viewer selection at validation time). */
  levelId?: string
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedUpdateFence {
  type: 'update_fence'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  start?: [number, number]
  end?: [number, number]
  height?: number
  thickness?: number
  style?: 'slat' | 'rail' | 'privacy'
  baseStyle?: 'floating' | 'grounded'
  color?: string
  postSpacing?: number
  curveOffset?: number
  adjustmentReason?: string
  errorReason?: string
}

export interface ValidatedAddCutOut {
  type: 'add_cut_out'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  hole: [number, number][]
  adjustmentReason?: string
  errorReason?: string
}

export type ValidatedOperation =
  | ValidatedAddItem
  | ValidatedRemoveItem
  | ValidatedMoveItem
  | ValidatedUpdateMaterial
  | ValidatedAddWall
  | ValidatedUpdateWall
  | ValidatedUpdateDoor
  | ValidatedUpdateWindow
  | ValidatedAddDoor
  | ValidatedAddWindow
  | ValidatedRemoveNode
  | ValidatedAddLevel
  | ValidatedAddSlab
  | ValidatedUpdateSlab
  | ValidatedAddCeiling
  | ValidatedUpdateCeiling
  | ValidatedAddRoof
  | ValidatedUpdateRoof
  | ValidatedAddStair
  | ValidatedUpdateStair
  | ValidatedAddZone
  | ValidatedUpdateZone
  | ValidatedAddBuilding
  | ValidatedUpdateSite
  | ValidatedAddScan
  | ValidatedAddGuide
  | ValidatedUpdateItem
  | ValidatedMoveBuilding
  | ValidatedCloneLevel
  | ValidatedEnterWalkthrough
  | ValidatedAddFence
  | ValidatedUpdateFence
  | ValidatedAddCutOut
  | ValidatedUpdateWallMaterial
  | ValidatedUpdateRoofMaterial
  | ValidatedUpdateStairMaterial
