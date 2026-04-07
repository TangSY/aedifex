// ============================================================================
// Claude Tool Call Types
// ============================================================================

export interface AddItemToolCall {
  tool: 'add_item'
  catalogSlug: string
  position: [number, number, number]
  rotationY: number
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
  reason?: string
}

export interface UpdateMaterialToolCall {
  tool: 'update_material'
  nodeId: string
  material: string
  reason?: string
}

export interface AddWallToolCall {
  tool: 'add_wall'
  start: [number, number]
  end: [number, number]
  thickness?: number
  height?: number
  description?: string
}

export interface UpdateWallToolCall {
  tool: 'update_wall'
  nodeId: string
  height?: number
  thickness?: number
  start?: [number, number]
  end?: [number, number]
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

export interface AddStairToolCall {
  tool: 'add_stair'
  position: [number, number, number]
  rotationY?: number
  width?: number
  length?: number
  height?: number
  stepCount?: number
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
  reason?: string
}

export interface AddZoneToolCall {
  tool: 'add_zone'
  polygon: [number, number][]
  name?: string
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
  | AskUserToolCall
  | ConfirmPreviewToolCall
  | RejectPreviewToolCall
