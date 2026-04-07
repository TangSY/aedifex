import type { AnyNode, AnyNodeId } from '@aedifex/core'
import type { AIToolCall } from './tool-call-types'
import type { ValidatedOperation } from './validated-types'
import type { SceneContext } from './scene-types'

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
