// ============================================================================
// Claude Tool Call Types
// ============================================================================

export interface AddItemToolCall {
  tool: 'add_item'
  catalogSlug: string
  position: [number, number, number]
  rotationY: number
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  /**
   * Explicit outdoor placement flag. Default false — items must stay inside a
   * zone polygon (will be clamped if AI gives an out-of-zone position). Set true
   * ONLY when the user clearly asks for an outdoor placement ("在房子外面",
   * "在院子里", "outdoor", landscape items like trees on the site).
   */
  outdoor?: boolean
  description?: string
}

export interface RemoveItemToolCall {
  tool: 'remove_item'
  nodeId: string
  reason?: string
}

export interface MoveItemToolCall {
  tool: 'move_item'
  nodeId: string
  position: [number, number, number]
  rotationY?: number
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  /**
   * Explicit outdoor placement flag. Default false — moving outside the zone
   * polygon clamps the position back inside. Set true only when user clearly
   * asks for an outdoor destination.
   */
  outdoor?: boolean
  reason?: string
}

export interface UpdateMaterialToolCall {
  tool: 'update_material'
  nodeId: string
  material: string
  reason?: string
}

/** Update wall surface material (interior or exterior side). */
export interface UpdateWallMaterialToolCall {
  tool: 'update_wall_material'
  nodeId: string
  /** Which face to apply material to. Use 'both' to set the legacy single-face material. */
  side: 'interior' | 'exterior' | 'both'
  /** Material catalog ID (preset). Mutually exclusive with materialColor. */
  materialPreset?: string
  /** Color value (hex string). Mutually exclusive with materialPreset. */
  materialColor?: string
  reason?: string
}

/** Update roof surface material per role (top sheet, edge fascia, gable wall). */
export interface UpdateRoofMaterialToolCall {
  tool: 'update_roof_material'
  nodeId: string
  /** Which roof surface to apply material to. */
  role: 'top' | 'edge' | 'wall'
  materialPreset?: string
  materialColor?: string
  reason?: string
}

/** Update stair surface material per role (railing, tread, side). */
export interface UpdateStairMaterialToolCall {
  tool: 'update_stair_material'
  nodeId: string
  /** Which stair surface to apply material to. */
  role: 'railing' | 'tread' | 'side'
  materialPreset?: string
  materialColor?: string
  reason?: string
}

/**
 * Unified per-slot paint tool — writes a single slot on `node.slots`.
 * Replaces the per-kind `update_*_material` tools for the 10 kinds that have
 * migrated to the paint-slots model: wall, slab, ceiling, stair, column,
 * elevator, fence, shelf, door, window. The old `update_*_material` tools
 * remain for backward compatibility but only mutate legacy single-material
 * fields — prefer `paint_slot` for per-part painting.
 */
export interface PaintSlotToolCall {
  tool: 'paint_slot'
  /** Target node ID. */
  nodeId: string
  /**
   * Slot identifier within the node's kind. Valid values per kind:
   * - wall: 'interior' | 'exterior'
   * - slab: 'surface' | 'side'
   * - ceiling: 'surface'
   * - stair: 'treads' | 'body' | 'railing'
   * - column: 'shaft' | 'base' | 'capital' | 'frame'
   * - elevator: 'cab' | 'doors' | 'shaft' | 'glass'
   * - fence: 'posts' | 'infill' | 'base' | 'rail'
   * - shelf: 'shelves' | 'frame' | 'back'
   * - door: 'panel' | 'frame' | 'glass' | 'hardware'
   * - window: 'frame' | 'glass'
   * For item nodes, any string is accepted (slot ids come from the GLB mesh names).
   */
  slotId: string
  /**
   * MaterialRef: `library:<preset>` (catalog material) or `scene:<id>` (minted
   * scene material). Set to empty string to clear back to the slot default.
   */
  materialRef: string
  reason?: string
}

export interface AddWallToolCall {
  tool: 'add_wall'
  start: [number, number]
  end: [number, number]
  thickness?: number
  height?: number
  /** Midpoint sagitta offset to bend the wall into an arc (positive/negative meters). */
  curveOffset?: number
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  description?: string
}

export interface UpdateWallToolCall {
  tool: 'update_wall'
  nodeId: string
  height?: number
  thickness?: number
  start?: [number, number]
  end?: [number, number]
  curveOffset?: number
  reason?: string
}

export interface UpdateDoorToolCall {
  tool: 'update_door'
  nodeId: string
  width?: number
  height?: number
  positionAlongWall?: number
  side?: 'front' | 'back'
  hingesSide?: 'left' | 'right'
  swingDirection?: 'inward' | 'outward'
  reason?: string
}

export interface UpdateWindowToolCall {
  tool: 'update_window'
  nodeId: string
  width?: number
  height?: number
  positionAlongWall?: number
  heightFromFloor?: number
  side?: 'front' | 'back'
  reason?: string
}

export interface AddDoorToolCall {
  tool: 'add_door'
  wallId: string
  /** Position along the wall in meters (0 = wall start, wallLength = wall end) */
  positionAlongWall: number
  width?: number
  height?: number
  side?: 'front' | 'back'
  hingesSide?: 'left' | 'right'
  swingDirection?: 'inward' | 'outward'
  description?: string
}

export interface AddWindowToolCall {
  tool: 'add_window'
  wallId: string
  /** Position along the wall in meters */
  positionAlongWall: number
  /** Height of window center from floor */
  heightFromFloor?: number
  width?: number
  height?: number
  side?: 'front' | 'back'
  description?: string
}

export interface RemoveNodeToolCall {
  tool: 'remove_node'
  nodeId: string
  reason?: string
}

// --- New AI Tool Calls ---

export interface AddLevelToolCall {
  tool: 'add_level'
  name?: string
  description?: string
}

export interface AddSlabToolCall {
  tool: 'add_slab'
  polygon: [number, number][]
  elevation?: number
  holes?: [number, number][][]
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  description?: string
}

export interface UpdateSlabToolCall {
  tool: 'update_slab'
  nodeId: string
  elevation?: number
  polygon?: [number, number][]
  reason?: string
}

export interface AddCeilingToolCall {
  tool: 'add_ceiling'
  polygon: [number, number][]
  height?: number
  material?: string
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  description?: string
}

export interface UpdateCeilingToolCall {
  tool: 'update_ceiling'
  nodeId: string
  height?: number
  material?: string
  reason?: string
}

export interface AddRoofToolCall {
  tool: 'add_roof'
  position: [number, number, number]
  width: number
  depth: number
  roofType: 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat'
  roofHeight?: number
  wallHeight?: number
  overhang?: number
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  description?: string
}

export interface UpdateRoofToolCall {
  tool: 'update_roof'
  nodeId: string
  roofType?: 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat'
  roofHeight?: number
  wallHeight?: number
  width?: number
  depth?: number
  reason?: string
}

export type StairKind = 'straight' | 'curved' | 'spiral'
export type StairSlabOpening = 'none' | 'destination'
export type StairTopLanding = 'none' | 'integrated'
export type StairRailing = 'none' | 'left' | 'right' | 'both'

export interface AddElevatorToolCall {
  tool: 'add_elevator'
  /** Building-local X/Z. Y is auto-resolved to the floor support; pass [x, 0, z]. */
  position: [number, number, number]
  rotationY?: number
  /** Cab footprint (default 1.6 × 1.6). */
  width?: number
  depth?: number
  cabHeight?: number
  /** Service range — bottom stop. Defaults to the currently selected level. */
  fromLevelId?: string | null
  /** Service range — top stop. Defaults to the level above fromLevelId. */
  toLevelId?: string | null
  /** Optional explicit served levels (only used when fromLevelId/toLevelId are absent). */
  servedLevelIds?: string[]
  shaftStyle?: 'solid' | 'glass'
  doorStyle?: 'center-opening' | 'single-left' | 'single-right'
  doorPanelStyle?: 'glass-frame' | 'solid-panel' | 'segmented-panel'
  /** Target building. When omitted, uses the building containing the active level. */
  buildingId?: string
  description?: string
}

export interface AddStairToolCall {
  tool: 'add_stair'
  position: [number, number, number]
  rotationY?: number
  width?: number
  length?: number
  height?: number
  stepCount?: number
  /** Stair geometry kind. */
  stairType?: StairKind
  /** Whether to auto-cut destination-level slab/ceiling. */
  slabOpeningMode?: StairSlabOpening
  openingOffset?: number
  fillToFloor?: boolean
  /** Curved stair: inner radius (meters). */
  innerRadius?: number
  /** Curved stair: total sweep (radians). */
  sweepAngle?: number
  /** Spiral stair: integrated top landing mode. */
  topLandingMode?: StairTopLanding
  topLandingDepth?: number
  showCenterColumn?: boolean
  showStepSupports?: boolean
  /** Railing rendering mode. */
  railingMode?: StairRailing
  railingHeight?: number
  /** Source level for auto cutout (defaults to current). */
  fromLevelId?: string | null
  /** Destination level for auto cutout (defaults to next level above). */
  toLevelId?: string | null
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  description?: string
}

export interface UpdateStairToolCall {
  tool: 'update_stair'
  nodeId: string
  position?: [number, number, number]
  rotationY?: number
  width?: number
  length?: number
  height?: number
  stepCount?: number
  stairType?: StairKind
  slabOpeningMode?: StairSlabOpening
  openingOffset?: number
  fillToFloor?: boolean
  innerRadius?: number
  sweepAngle?: number
  topLandingMode?: StairTopLanding
  topLandingDepth?: number
  showCenterColumn?: boolean
  showStepSupports?: boolean
  railingMode?: StairRailing
  railingHeight?: number
  fromLevelId?: string | null
  toLevelId?: string | null
  reason?: string
}

export interface AddZoneToolCall {
  tool: 'add_zone'
  polygon: [number, number][]
  name?: string
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  description?: string
}

export interface UpdateZoneToolCall {
  tool: 'update_zone'
  nodeId: string
  polygon?: [number, number][]
  name?: string
  reason?: string
}

export interface AddBuildingToolCall {
  tool: 'add_building'
  position?: [number, number, number]
  name?: string
  description?: string
}

export interface UpdateSiteToolCall {
  tool: 'update_site'
  polygon?: [number, number][]
  reason?: string
}

export interface AddScanToolCall {
  tool: 'add_scan'
  url: string
  position?: [number, number, number]
  scale?: number
  opacity?: number
  description?: string
}

export interface AddGuideToolCall {
  tool: 'add_guide'
  url: string
  position?: [number, number, number]
  scale?: number
  opacity?: number
  description?: string
}

export interface UpdateItemToolCall {
  tool: 'update_item'
  nodeId: string
  scale?: [number, number, number]
  reason?: string
}

export interface BatchOperationsToolCall {
  tool: 'batch_operations'
  operations: Omit<AIToolCall, 'tool' | 'operations'>[]
  description: string
}

export interface PlacementOption {
  id: string
  label: string
  catalogSlug: string
  position: [number, number, number]
  rotationY: number
  reason: string
}

export interface ProposePlacementToolCall {
  tool: 'propose_placement'
  question: string
  options: PlacementOption[]
}

// ============================================================================
// Agentic Loop — Additional Tool Call Types
// ============================================================================

/** Move/rotate an entire building on the site */
export interface MoveBuildingToolCall {
  tool: 'move_building'
  nodeId: string
  position?: [number, number, number]
  rotationY?: number
  reason?: string
}

/** Clone an entire floor level with all descendants */
export interface CloneLevelToolCall {
  tool: 'clone_level'
  levelId: string
  name?: string
  description?: string
}

/** Add a fence segment to the scene */
export interface AddFenceToolCall {
  tool: 'add_fence'
  start: [number, number]
  end: [number, number]
  height?: number
  thickness?: number
  style?: 'slat' | 'rail' | 'privacy' | 'horizontal'
  baseStyle?: 'floating' | 'grounded'
  color?: string
  postSpacing?: number
  /** Topper drawn on each fence post. Default 'pyramid'. */
  postCap?: 'none' | 'flat' | 'pyramid'
  /** For style='horizontal': reveal between boards in meters (default 0.01; 0 = flush). */
  slatGap?: number
  /** Midpoint sagitta offset to bend the fence into an arc (positive/negative meters). */
  curveOffset?: number
  /** Target level ID. When omitted, uses the currently selected level in the viewer. */
  levelId?: string
  description?: string
}

/** Update properties of an existing fence */
export interface UpdateFenceToolCall {
  tool: 'update_fence'
  nodeId: string
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
  reason?: string
}

/** Roof accessory kind — eleven configurations exposed by AI tools. */
export type RoofAccessoryKind =
  | 'chimney'
  | 'dormer'
  | 'skylight'
  | 'solar-panel'
  | 'ridge-vent'
  | 'box-vent'
  | 'turbine-vent'
  | 'eyebrow-vent'
  | 'cupola'
  | 'gutter'
  | 'downspout'

/** Add a roof accessory (point vents / dormer / skylight / solar-panel / gutter / downspout) to a roof segment */
export interface AddRoofAccessoryToolCall {
  tool: 'add_roof_accessory'
  /** Accessory kind */
  kind: RoofAccessoryKind
  /** Target roof segment node ID (from scene context). For kind="downspout" this is derived from the host gutter and may be omitted. */
  roofSegmentId?: string
  /**
   * Segment-local position [x, y, z] (Y is ignored — anchored to pitched surface).
   * For kind="gutter" this is treated as the cursor hit on the segment: the
   * validator snaps it to the nearest eave (drip edge), like the manual tool.
   * For kind="downspout" it is ignored — the mount derives from the gutter outlet.
   */
  position: [number, number, number]
  /** Rotation around Y axis in radians (default: 0). For kind="gutter" it is overridden by the eave snap orientation. */
  rotation?: number
  /** Width in meters. Kind defaults: chimney/box-vent 0.6, dormer 2.0, skylight 1.0, solar-panel 1.0, ridge-vent 2.0, eyebrow-vent 0.5, cupola 0.8. For turbine-vent this sets the head diameter (default 0.32). */
  width?: number
  /** Depth in meters. Kind defaults: chimney 0.6, dormer 1.5, skylight 1.0, solar-panel 1.6, box-vent 0.6, ridge-vent 0.3, eyebrow-vent 0.6, cupola 0.8. Ignored for turbine-vent. */
  depth?: number
  /** Chimney only: height above ridge in meters (default: 1.0) */
  heightAboveRidge?: number
  /** Gutter: run length along the eave in meters (default: 2.0). Downspout: vertical pipe length override (default: auto — eave height down to segment base). Ignored for other kinds. */
  length?: number
  /** Downspout only (required for it): node ID of the host gutter this downspout drains. Create the gutter first (add_roof_accessory kind="gutter"). */
  gutterId?: string
  /** Downspout only: outlet position along the gutter length (gutter-local +X), signed from the gutter CENTER in meters (default: 0). */
  offsetAlongGutter?: number
  description?: string
}

/** Add a cut-out (hole) to an existing slab or ceiling */
export interface AddCutOutToolCall {
  tool: 'add_cut_out'
  /** The node ID of the target slab or ceiling */
  nodeId: string
  /** The hole polygon as array of [x, z] points */
  hole: [number, number][]
  description?: string
}

/** Enter first-person walkthrough mode */
export interface EnterWalkthroughToolCall {
  tool: 'enter_walkthrough'
  reason?: string
}

/**
 * Save an existing room (zone) as a reusable preset. The actual persistence
 * (serialization, quota, thumbnail) is delegated to the host's
 * RoomPresetProvider — OSS deployments without a backend decline gracefully.
 */
export interface SaveRoomPresetToolCall {
  tool: 'save_room_preset'
  /** Room name to match against zone names (case-insensitive, substring). */
  roomName: string
  /** Optional level name/number to narrow the search (e.g. "2", "Second Floor"). */
  levelName?: string
}

/** Insert one of the user's saved room presets into the scene. */
export interface InsertRoomPresetToolCall {
  tool: 'insert_room_preset'
  /** Preset name to match against the user's saved presets (case-insensitive, substring). */
  presetName: string
  /** Optional target level name/number. Defaults to the active level. */
  levelName?: string
  /** Optional [x, z] anchor on the floor plane. Defaults to [0, 0]. */
  position?: [number, number]
}

/** LLM asks the user a question and waits for response */
export interface AskUserToolCall {
  tool: 'ask_user'
  question: string
  /** Optional suggested responses */
  suggestions?: string[]
}

/** LLM confirms the current ghost preview */
export interface ConfirmPreviewToolCall {
  tool: 'confirm_preview'
  reason?: string
}

/** LLM rejects the current ghost preview */
export interface RejectPreviewToolCall {
  tool: 'reject_preview'
  reason?: string
}

// ============================================================================
// MEP tool call types (Phase 2 §6.2)
// ============================================================================

export interface AddDuctSegmentToolCall {
  tool: 'add_duct_segment'
  levelId?: string
  points: [number, number, number][]
  crossSection?: 'round' | 'rect'
  diameter?: number
  width?: number
  height?: number
  system?: 'supply' | 'return'
  description?: string
}

export interface AddDuctFittingToolCall {
  tool: 'add_duct_fitting'
  levelId?: string
  position: [number, number, number]
  rotation?: [number, number, number]
  fittingType: 'elbow' | 'tee' | 'reducer' | 'cap'
  portSizes?: { diameter?: number; diameter2?: number }
}

export interface AddDuctTerminalToolCall {
  tool: 'add_duct_terminal'
  levelId?: string
  position: [number, number, number]
  hostId?: string
  terminalType: 'supply' | 'return' | 'diffuser'
  rotation?: number
}

export interface AddPipeSegmentToolCall {
  tool: 'add_pipe_segment'
  levelId?: string
  points: [number, number, number][]
  diameter?: number
  pipeKind?: 'dwv' | 'supply' | 'gas'
  description?: string
}

export interface AddPipeFittingToolCall {
  tool: 'add_pipe_fitting'
  levelId?: string
  position: [number, number, number]
  rotation?: [number, number, number]
  fittingType: 'elbow' | 'tee' | 'wye' | 'reducer'
  diameter?: number
}

export interface AddPipeTrapToolCall {
  tool: 'add_pipe_trap'
  levelId?: string
  position: [number, number, number]
  rotation?: number
  diameter: number
  trapType?: 'p-trap' | 's-trap'
}

export interface AddHvacEquipmentToolCall {
  tool: 'add_hvac_equipment'
  levelId?: string
  position: [number, number, number]
  rotation?: number
  equipmentType: 'indoor-unit' | 'outdoor-unit' | 'ahu'
  width?: number
  depth?: number
  height?: number
}

export interface AddLinesetToolCall {
  tool: 'add_lineset'
  fromId: string
  toId: string
  route?: [number, number, number][]
}

export interface AddLiquidLineToolCall {
  tool: 'add_liquid_line'
  fromId: string
  toId: string
  route?: [number, number, number][]
}

// ============================================================================
// Opening alignment (Phase 2 §6.4)
// ============================================================================

export interface AlignOpeningToNearestToolCall {
  tool: 'align_opening_to_nearest'
  nodeId: string
  axis?: 'horizontal' | 'vertical' | 'both'
}

export type AIToolCall =
  | AddItemToolCall
  | RemoveItemToolCall
  | MoveItemToolCall
  | UpdateMaterialToolCall
  | AddWallToolCall
  | UpdateWallToolCall
  | UpdateDoorToolCall
  | UpdateWindowToolCall
  | AddDoorToolCall
  | AddWindowToolCall
  | RemoveNodeToolCall
  | AddLevelToolCall
  | AddSlabToolCall
  | UpdateSlabToolCall
  | AddCeilingToolCall
  | UpdateCeilingToolCall
  | AddRoofToolCall
  | UpdateRoofToolCall
  | AddStairToolCall
  | UpdateStairToolCall
  | AddElevatorToolCall
  | AddZoneToolCall
  | UpdateZoneToolCall
  | AddBuildingToolCall
  | UpdateSiteToolCall
  | AddScanToolCall
  | AddGuideToolCall
  | UpdateItemToolCall
  | BatchOperationsToolCall
  | ProposePlacementToolCall
  | MoveBuildingToolCall
  | CloneLevelToolCall
  | EnterWalkthroughToolCall
  | SaveRoomPresetToolCall
  | InsertRoomPresetToolCall
  | AskUserToolCall
  | ConfirmPreviewToolCall
  | RejectPreviewToolCall
  | AddFenceToolCall
  | UpdateFenceToolCall
  | AddCutOutToolCall
  | AddRoofAccessoryToolCall
  | UpdateWallMaterialToolCall
  | UpdateRoofMaterialToolCall
  | UpdateStairMaterialToolCall
  | PaintSlotToolCall
  | AddDuctSegmentToolCall
  | AddDuctFittingToolCall
  | AddDuctTerminalToolCall
  | AddPipeSegmentToolCall
  | AddPipeFittingToolCall
  | AddPipeTrapToolCall
  | AddHvacEquipmentToolCall
  | AddLinesetToolCall
  | AddLiquidLineToolCall
  | AlignOpeningToNearestToolCall
