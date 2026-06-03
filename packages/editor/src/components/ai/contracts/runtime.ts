/**
 * AIRuntime contracts — the seams an OSS deployment can override.
 *
 * BOUNDARY RULES (these are constitutional):
 *
 * 1. None of the four interfaces below reference auth, quota, billing,
 *    rate-limiting, subscriptions, multi-tenancy, MCP, or any other
 *    SaaS-only concept. They are purely technical: how to send a chat
 *    request, how to look up a catalog item, how to persist a string,
 *    how to fire a telemetry event.
 *
 * 2. Errors flow through `StreamCallbacks.onError(message, metadata?)`
 *    as opaque strings. The OSS store and UI never parse the string —
 *    a SaaS deployment that wants to render an upgrade overlay does so
 *    in its own decorator component by subscribing to `useAIChat`.
 *
 * 3. `ChatPersistence` is synchronous and Storage-shaped so OSS's
 *    sessionStorage path stays a single straight line. SaaS that needs
 *    cloud sync wraps a sync facade around an async IDB/D1 layer in
 *    its own implementation.
 *
 * 4. No method here may take a request/response object specific to
 *    SaaS, no header, no cookie, no session token. If a future need
 *    requires SaaS-shaped state, that need belongs in a SaaS decorator,
 *    not in this contract.
 */

import type { AssetInput } from '@aedifex/core'
import type { AIToolCall } from '../types'
import type { ChatMessageInput, ChatRequestBody } from './chat-request'

// ============================================================================
// ChatTransport — wire layer (replaces hardcoded fetch('/api/ai/chat'))
// ============================================================================

export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface StreamCallbacks {
  onTextChunk: (text: string) => void
  onToolCall: (toolCall: AIToolCall) => void
  onComplete: (
    fullText: string,
    toolCalls: AIToolCall[],
    toolCallIds: string[],
    usage?: StreamUsage,
  ) => void
  /**
   * Opaque error message. `metadata` is whatever extra fields the
   * upstream response carried (e.g. `{ code, upgradeUrl }` for a SaaS
   * route). The OSS store treats it as `Record<string, unknown>` and
   * stores it verbatim on `useAIChat.errorMetadata` so SaaS decorators
   * can inspect it.
   */
  onError: (error: string, metadata?: Record<string, unknown>) => void
  onRetry?: () => void
}

/**
 * Send a chat request and stream the response. Implementations MUST
 * honor `signal.aborted` to allow the user to cancel mid-stream.
 *
 * The OSS default implementation calls `fetch('/api/ai/chat')` with no
 * headers; SaaS overrides with auth cookies + retry wrapper.
 */
export interface ChatTransport {
  streamChat(
    request: ChatRequestBody,
    callbacks: StreamCallbacks,
    signal: AbortSignal,
  ): Promise<void>
  /**
   * Condense old conversation messages so the loop fits in the LLM
   * context window. Returns null if summarization is unavailable
   * (caller falls back to simple truncation).
   */
  summarize(
    messages: Pick<ChatMessageInput, 'role' | 'content'>[],
    signal: AbortSignal,
  ): Promise<{ summary: string } | null>
}

// ============================================================================
// CatalogProvider — furniture/asset lookup
// ============================================================================

export interface CatalogResolveResult {
  asset: AssetInput | null
  matchType: 'exact' | 'name' | 'fuzzy' | 'none'
  suggestions?: AssetInput[]
  /** When fuzzy match found but shape/variant doesn't match the request */
  shapeWarning?: string
}

export interface CatalogProvider {
  /** Resolve a slug/name/tag to a catalog asset. `null` asset = not found. */
  resolveSlug(slug: string): CatalogResolveResult
  /**
   * Render the catalog as a string injected into the LLM system prompt.
   * Empty string is valid — OSS deployments without a registered catalog
   * still get the structural toolset.
   */
  generateSummary(): string
  /**
   * Subscribe to catalog mutations (SaaS notifies after the user buys a
   * new asset pack or their plan tier changes). OSS default omits this.
   */
  subscribe?(listener: () => void): () => void
}

// ============================================================================
// ChatPersistence — synchronous Storage-shaped interface
// ============================================================================

/**
 * A subset of the Web Storage API. Implementations MUST be synchronous
 * to keep zustand persist middleware's rehydrate path a single straight
 * line (avoids the pendingQuestion-resolver-function corruption that an
 * async rehydrate would introduce).
 *
 * OSS default: a thin wrapper over sessionStorage.
 * SaaS: wraps sessionStorage in a sync facade and fires off async IDB +
 * D1 sync from a separate effect that observes useAIChat directly.
 */
export interface ChatPersistence {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// ============================================================================
// AITelemetry — fully optional, no-op friendly
// ============================================================================

export type LoopExitReason =
  | 'success'
  | 'aborted'
  | 'failed'
  | 'budget'
  | 'iteration-cap'

export interface AITelemetry {
  loopStarted?(ctx: { messageId: string; userMessage: string }): void
  loopFinished?(ctx: {
    messageId: string
    iterations: number
    toolCalls: number
    reason: LoopExitReason
  }): void
  toolValidated?(op: { tool: string; status: string }): void
  error?(err: {
    phase: 'stream' | 'validate' | 'execute' | 'persist'
    message: string
    messageId?: string
  }): void
}

// ============================================================================
// AIRuntime — composition root
// ============================================================================

export interface AIRuntime {
  transport: ChatTransport
  catalog: CatalogProvider
  persistence: ChatPersistence
  telemetry?: AITelemetry
}
