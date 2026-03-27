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
  | AddDoorToolCall
  | AddWindowToolCall
  | RemoveNodeToolCall
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
  asset: AssetInput
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

export type ValidatedOperation =
  | ValidatedAddItem
  | ValidatedRemoveItem
  | ValidatedMoveItem
  | ValidatedUpdateMaterial
  | ValidatedAddWall
  | ValidatedAddDoor
  | ValidatedAddWindow
  | ValidatedRemoveNode

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
  /** Whether operations have been confirmed/rejected */
  operationStatus?: 'pending' | 'confirmed' | 'rejected'
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
