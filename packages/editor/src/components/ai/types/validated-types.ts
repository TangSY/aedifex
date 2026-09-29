import type { AnyNodeId, AssetInput } from '@aedifex/core'
import type { RoofAccessoryKind } from './tool-call-types'

// ============================================================================
// Roof accessory validated op (shared by chimney/dormer/skylight/solar-panel/
// ridge-vent/box-vent/turbine-vent/eyebrow-vent/cupola/gutter/downspout)
// ============================================================================

export interface ValidatedAddRoofAccessory {
  type: 'add_roof_accessory'
  status: ValidatedOperationStatus
  kind: RoofAccessoryKind
  roofSegmentId: string
  /** For kind="gutter" this is the eave-snapped position (validator output, not the raw LLM input). */
  position: [number, number, number]
  /** For kind="gutter" this is the eave snap orientation (outward axis away from the building). */
  rotation: number
  /**
   * For kind="turbine-vent" this carries the head diameter. For
   * kind="downspout" width is a schema placeholder only — confirm hardcodes
   * the bore diameter to 0.07 (matching the manual tool's
   * DEFAULT_OUTLET_DIAMETER) and never reads this field.
   */
  width: number
  depth: number
  /** Chimney only */
  heightAboveRidge?: number
  /** Gutter: run length along the eave. Downspout: vertical drop length (auto-computed from eave height when omitted in the call). */
  length?: number
  /** Downspout only: host gutter node ID. */
  gutterId?: string
  /** Downspout only: outlet offset along the gutter length, signed from center. */
  outletOffset?: number
  adjustmentReason?: string
  errorReason?: string
}

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
  /** Display name captured at validation time (node may be gone after confirm). */
  nodeName?: string
  errorReason?: string
}

export interface ValidatedMoveItem {
  type: 'move_item'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  /** Display name captured at validation time. */
  nodeName?: string
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
  /** Display name captured at validation time. */
  nodeName?: string
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

/**
 * Unified per-slot paint validated op. The validator looks up the node's kind
 * and rejects unknown slot ids; valid ops write to `node.slots[slotId]`.
 */
export interface ValidatedPaintSlot {
  type: 'paint_slot'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  slotId: string
  /**
   * MaterialRef written into `node.slots[slotId]`. Empty string is a sentinel
   * for "clear back to slot default" and is passed through to the executor.
   */
  materialRef: string
  /** Resolved kind of the target node (for downstream logging/preview). */
  kind?: string
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
  /** Display name captured at validation time (node may be gone after confirm). */
  nodeName?: string
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

export interface ValidatedAddElevator {
  type: 'add_elevator'
  status: ValidatedOperationStatus
  position: [number, number, number]
  rotation: number
  width: number
  depth: number
  cabHeight: number
  fromLevelId: string | null
  toLevelId: string | null
  servedLevelIds?: string[]
  shaftStyle?: 'solid' | 'glass'
  doorStyle?: 'center-opening' | 'single-left' | 'single-right'
  doorPanelStyle?: 'glass-frame' | 'solid-panel' | 'segmented-panel'
  buildingId?: string
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

/**
 * Validated save_room_preset. Resolution happens at validation time:
 * roomName/levelName fuzzy-match against scene zones. Execution is a host
 * async action (RoomPresetProvider.save) — no ghost preview is produced.
 */
export interface ValidatedSaveRoomPreset {
  type: 'save_room_preset'
  status: ValidatedOperationStatus
  /** Resolved zone node id (empty string when status is 'invalid'). */
  zoneId: string
  /** Resolved zone display name — used as the suggested preset name. */
  zoneName: string
  errorReason?: string
}

/**
 * Validated insert_room_preset. presetName fuzzy-matches against
 * RoomPresetProvider.list(); level/position resolve like other placement
 * tools. Execution is a host async action (RoomPresetProvider.insert).
 */
export interface ValidatedInsertRoomPreset {
  type: 'insert_room_preset'
  status: ValidatedOperationStatus
  /** Resolved preset id (empty string when status is 'invalid'). */
  presetId: string
  /** Resolved preset display name. */
  presetName: string
  /** Resolved target level id (empty string when status is 'invalid'). */
  levelId: string
  /** Floor-plane anchor [x, z]. */
  position: [number, number]
  errorReason?: string
}

export interface ValidatedAddFence {
  type: 'add_fence'
  status: ValidatedOperationStatus
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
  style: 'slat' | 'rail' | 'privacy' | 'horizontal'
  baseStyle: 'floating' | 'grounded'
  color: string
  postSpacing: number
  postCap?: 'none' | 'flat' | 'pyramid'
  slatGap?: number
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
  style?: 'slat' | 'rail' | 'privacy' | 'horizontal'
  baseStyle?: 'floating' | 'grounded'
  color?: string
  postSpacing?: number
  postCap?: 'none' | 'flat' | 'pyramid'
  slatGap?: number
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

// ============================================================================
// MEP validated operations (Phase 2 §6.2)
// ============================================================================

export interface ValidatedAddDuctSegment {
  type: 'add_duct_segment'
  status: ValidatedOperationStatus
  points: [number, number, number][]
  crossSection: 'round' | 'rect'
  diameter?: number
  width?: number
  height?: number
  system: 'supply' | 'return'
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddDuctFitting {
  type: 'add_duct_fitting'
  status: ValidatedOperationStatus
  position: [number, number, number]
  rotation: [number, number, number]
  fittingType: 'elbow' | 'tee' | 'reducer' | 'cap'
  diameter?: number
  diameter2?: number
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddDuctTerminal {
  type: 'add_duct_terminal'
  status: ValidatedOperationStatus
  position: [number, number, number]
  hostId?: string
  terminalType: 'supply' | 'return' | 'diffuser'
  rotation: number
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddPipeSegment {
  type: 'add_pipe_segment'
  status: ValidatedOperationStatus
  points: [number, number, number][]
  diameter: number
  pipeKind: 'dwv' | 'supply' | 'gas'
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddPipeFitting {
  type: 'add_pipe_fitting'
  status: ValidatedOperationStatus
  position: [number, number, number]
  rotation: [number, number, number]
  fittingType: 'elbow' | 'tee' | 'wye' | 'reducer'
  diameter: number
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddPipeTrap {
  type: 'add_pipe_trap'
  status: ValidatedOperationStatus
  position: [number, number, number]
  rotation: number
  diameter: number
  trapType: 'p-trap' | 's-trap'
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddHvacEquipment {
  type: 'add_hvac_equipment'
  status: ValidatedOperationStatus
  position: [number, number, number]
  rotation: number
  equipmentType: 'indoor-unit' | 'outdoor-unit' | 'ahu'
  width: number
  depth: number
  height: number
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddLineset {
  type: 'add_lineset'
  status: ValidatedOperationStatus
  fromId: AnyNodeId
  toId: AnyNodeId
  route: [number, number, number][]
  levelId?: string
  errorReason?: string
}

export interface ValidatedAddLiquidLine {
  type: 'add_liquid_line'
  status: ValidatedOperationStatus
  fromId: AnyNodeId
  toId: AnyNodeId
  route: [number, number, number][]
  levelId?: string
  errorReason?: string
}

// ============================================================================
// Opening alignment (Phase 2 §6.4)
// ============================================================================

export interface ValidatedAlignOpeningToNearest {
  type: 'align_opening_to_nearest'
  status: ValidatedOperationStatus
  nodeId: AnyNodeId
  axis: 'horizontal' | 'vertical' | 'both'
  originalPosition?: [number, number, number]
  snappedPosition?: [number, number, number]
  appliedSnaps?: {
    alongWall?: { delta: number; feature: string; targetId: string }
    vertical?: { delta: number; feature: string; targetId: string }
  }
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
  | ValidatedAddElevator
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
  | ValidatedSaveRoomPreset
  | ValidatedInsertRoomPreset
  | ValidatedAddFence
  | ValidatedUpdateFence
  | ValidatedAddCutOut
  | ValidatedAddRoofAccessory
  | ValidatedUpdateWallMaterial
  | ValidatedUpdateRoofMaterial
  | ValidatedUpdateStairMaterial
  | ValidatedPaintSlot
  | ValidatedAddDuctSegment
  | ValidatedAddDuctFitting
  | ValidatedAddDuctTerminal
  | ValidatedAddPipeSegment
  | ValidatedAddPipeFitting
  | ValidatedAddPipeTrap
  | ValidatedAddHvacEquipment
  | ValidatedAddLineset
  | ValidatedAddLiquidLine
  | ValidatedAlignOpeningToNearest
