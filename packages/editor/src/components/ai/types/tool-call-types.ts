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
  style?: 'slat' | 'rail' | 'privacy'
  baseStyle?: 'floating' | 'grounded'
  color?: string
  postSpacing?: number
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
  style?: 'slat' | 'rail' | 'privacy'
  baseStyle?: 'floating' | 'grounded'
  color?: string
  postSpacing?: number
  curveOffset?: number
  reason?: string
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
  | AskUserToolCall
  | ConfirmPreviewToolCall
  | RejectPreviewToolCall
  | AddFenceToolCall
  | UpdateFenceToolCall
  | AddCutOutToolCall
  | UpdateWallMaterialToolCall
  | UpdateRoofMaterialToolCall
  | UpdateStairMaterialToolCall
