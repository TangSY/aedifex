import type { AnyNode, AnyNodeId, AssetInput } from '@pascal-app/core'

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

export type ValidatedOperation =
  | ValidatedAddItem
  | ValidatedRemoveItem
  | ValidatedMoveItem
  | ValidatedUpdateMaterial

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
