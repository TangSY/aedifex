import type { AnyNode, AnyNodeId, AssetInput } from '@aedifex/core'

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
  adjustmentReason?: string
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
  | ValidatedAddZone
  | ValidatedUpdateZone
  | ValidatedAddBuilding
  | ValidatedUpdateSite
  | ValidatedAddScan
  | ValidatedAddGuide
  | ValidatedUpdateItem

// ============================================================================
// Chat Message Types
// ============================================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** Tool calls parsed from assistant response */
  toolCalls?: AIToolCall[]
  /** Validated operations after executor processing */
  operations?: ValidatedOperation[]
  /** Whether operations have been confirmed/rejected/undone */
  operationStatus?: 'pending' | 'confirmed' | 'rejected' | 'undone'
  /** Before screenshot (data URL) */
  screenshotBefore?: string
  /** After screenshot (data URL) */
  screenshotAfter?: string
}

// ============================================================================
// AI Operation Log
// ============================================================================

export interface AIOperationLog {
  id: string
  messageId: string
  timestamp: number
  operations: ValidatedOperation[]
  status: 'previewing' | 'confirmed' | 'rejected' | 'undone'
  /** Node IDs created/modified by this operation batch */
  affectedNodeIds: AnyNodeId[]
  /** Node IDs that were newly created (for undo: delete these) */
  createdNodeIds: AnyNodeId[]
  /** Snapshot of nodes that existed before the operation (for undo: restore these) */
  previousSnapshot: Record<AnyNodeId, AnyNode>
  /** Parent mapping for removed nodes (for undo: re-create with correct parent) */
  removedNodes: { node: AnyNode; parentId: AnyNodeId }[]
}

// ============================================================================
// Proposal (Multi-proposal comparison)
// ============================================================================

export interface Proposal {
  id: string
  label: string
  operations: ValidatedOperation[]
  /** Snapshot of nodes affected by this proposal (for switching) */
  nodeSnapshot: Record<AnyNodeId, AnyNode>
  /** User micro-adjustments applied on top of AI operations */
  userAdjustments: { id: AnyNodeId; data: Partial<AnyNode> }[]
}

// ============================================================================
// Scene Context (sent to Claude API)
// ============================================================================

export interface SceneWallSummary {
  id: string
  start: [number, number]
  end: [number, number]
  thickness: number
  length?: number
  children?: { type: string; id: string; localX: number; width: number }[]
}

export interface SceneZoneSummary {
  id: string
  name: string
  polygon: [number, number][]
  bounds: { min: [number, number]; max: [number, number] }
}

export interface SceneLevelSummary {
  id: string
  level: number
  name?: string
  childCount: number
}

export interface SceneCeilingSummary {
  id: string
  height: number
  area: number
}

export interface SceneRoofSummary {
  id: string
  segments: { id: string; roofType: string; width: number; depth: number }[]
}

export interface SceneSlabSummary {
  id: string
  elevation: number
  area: number
}

export interface SceneContext {
  activeZone?: {
    id: string
    name: string
    bounds?: { min: [number, number]; max: [number, number] }
  }
  levelId: string
  items: SceneItemSummary[]
  walls: SceneWallSummary[]
  zones: SceneZoneSummary[]
  levels: SceneLevelSummary[]
  ceilings: SceneCeilingSummary[]
  roofs: SceneRoofSummary[]
  slabs: SceneSlabSummary[]
  wallCount: number
  zoneCount: number
}

export interface SceneItemSummary {
  id: string
  name: string
  catalogSlug: string
  position: [number, number, number]
  rotationY: number
  dimensions: [number, number, number]
  category: string
}

// ============================================================================
// Agentic Loop — Tool Result (fed back to LLM)
// ============================================================================

/** Structured result of executing a tool call, fed back to LLM for iteration */
export interface ToolResult {
  /** The tool name that was called */
  toolName: string
  /** Whether execution succeeded */
  success: boolean
  /** Human-readable summary of what happened */
  summary: string
  /** Details for the LLM to reason about */
  details: {
    /** Operations that were validated and applied */
    validCount: number
    /** Operations that needed position/collision adjustments */
    adjustedCount: number
    /** Operations that failed validation */
    invalidCount: number
    /** Specific adjustment descriptions */
    adjustments: string[]
    /** Specific error descriptions */
    errors: string[]
    /** IDs of nodes created by this operation (for LLM to reference in follow-up) */
    createdNodeIds?: string[]
  }
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

// ============================================================================
// Agentic Loop — State
// ============================================================================

export type AgentLoopState = 'idle' | 'running' | 'paused' | 'complete'

/** Message format for the agentic loop (supports tool_result role) */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** Tool call ID (required for tool role messages) */
  tool_call_id?: string
}

/** Pending question from ask_user tool */
export interface PendingQuestion {
  question: string
  suggestions?: string[]
  /** Resolve function to resume the agentic loop */
  resolve: (answer: string) => void
}

// ============================================================================
// API Request/Response
// ============================================================================

export interface AIChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  sceneContext: SceneContext
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitState {
  tokenCount: number
  requestCount: number
  windowStart: number
}
