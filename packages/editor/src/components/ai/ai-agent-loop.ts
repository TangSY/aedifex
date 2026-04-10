import { captureScreenshot } from '@aedifex/viewer'
import { generateExecutionPlan, buildPlanningContext } from './ai-planner'
import { useAIChat } from './ai-chat-store'
import { buildToolResult, validateAllToolCalls } from './ai-mutation-executor'
import {
  applyGhostPreview,
  clearGhostPreview,
  confirmGhostPreview,
  isGhostPreviewActive,
} from './ai-preview-manager'
import {
  formatSceneContextForPrompt,
  invalidateSceneCache,
  serializeSceneContext,
} from './ai-scene-serializer'
import { streamChat } from './ai-stream-client'
import { estimateMessagesTokens } from './ai-token-estimator'
import type { AnyNodeId } from '@aedifex/core'
import type {
  AIToolCall,
  AgentMessage,
  AskUserToolCall,
  ConfirmPreviewToolCall,
  PendingQuestion,
  RejectPreviewToolCall,
  ToolResult,
  ValidatedOperation,
} from './types'

// ============================================================================
// Agentic Loop
// Core orchestrator: LLM → tool_call → execute → tool_result → LLM → ...
// Token-budget driven: loops until the model stops or budget exhausted.
// Auto-compresses conversation context at CONTEXT_COMPRESS_THRESHOLD.
// ============================================================================

// A-M5: Track pending screenshot timers so they can be cancelled on cleanup
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

/** Total token budget per agent loop run (prompt + completion summed) */
const TOKEN_BUDGET = 10_000_000

/** When conversation context exceeds this threshold, auto-compress */
const CONTEXT_COMPRESS_THRESHOLD = 100_000

/** Safety cap to prevent truly infinite loops (bugs, runaway LLM) */
const MAX_ITERATIONS = 200

/** Number of recent messages to keep when compressing */
const COMPRESS_KEEP_RECENT = 6

/**
 * Tool calls that skip the feedback loop (deterministic, no adjustment possible).
 * Only confirm/reject are truly terminal — remove operations should loop back
 * so the LLM can follow up (e.g. remove old door → add new door at new position).
 */
const DETERMINISTIC_TOOLS = new Set(['confirm_preview', 'reject_preview'])

/**
 * Run the agentic loop for a user message.
 *
 * Flow:
 * 1. Send user message + context to LLM
 * 2. LLM responds with text + tool_calls
 * 3. Execute tool_calls locally → build ToolResult
 * 4. Feed ToolResult back to LLM as tool_result message
 * 5. LLM decides: more tools? ask user? or done?
 * 6. Repeat until LLM responds with just text (no tools) or MAX_ITERATIONS
 */
export async function runAgentLoop({
  userMessage,
  catalogSummary,
  onIterationStart,
  onIterationEnd,
}: {
  userMessage: string
  catalogSummary: string
  onIterationStart?: (iteration: number) => void
  onIterationEnd?: (iteration: number, result: ToolResult | null) => void
}): Promise<void> {
  const store = useAIChat.getState()

  // If there are lingering ghost preview nodes from a previous loop,
  // pause and ask the user to confirm or discard them before proceeding.
  if (isGhostPreviewActive()) {
    const pendingMsg = [...store.messages].reverse().find(
      (m) => m.operationStatus === 'pending' && m.operations?.length,
    )

    store.setAIProcessing(false)

    const answer = await new Promise<string>((resolve) => {
      store.setPendingQuestion({
        question: 'There are unconfirmed changes from the previous operation. Would you like to keep or discard them before continuing?',
        suggestions: ['Keep changes', 'Discard changes'],
        resolve,
      })
    })

    const shouldKeep = answer.toLowerCase().includes('keep') ||
      answer.toLowerCase().includes('confirm') ||
      answer.toLowerCase().includes('保留') ||
      answer.toLowerCase().includes('确认')

    if (shouldKeep && pendingMsg?.operations) {
      // Confirm ghost preview as real nodes
      await executeConfirmation(pendingMsg.id, pendingMsg.operations)
    } else {
      // Discard ghost preview
      clearGhostPreview()
      if (pendingMsg) {
        store.rejectOperations(pendingMsg.id)
      }
    }

    // Add the user's choice as a message
    store.addUserMessage(answer)
  }

  // Initialize loop state
  store.setLoopState('running')
  store.setIterationCount(0)
  store.resetTokensUsed()
  store.setAIProcessing(true)

  // Build conversation history + new user message
  const history = store.getConversationHistory()

  // Planner: detect complex instructions and inject planning context
  // This makes the LLM present a step-by-step plan via ask_user before executing.
  const plan = generateExecutionPlan(userMessage)
  let effectiveMessage = userMessage
  if (plan.isComplex) {
    const planContext = buildPlanningContext(plan)
    effectiveMessage = `${planContext}\n\nUser request: ${userMessage}`
  }

  let conversationMessages: AgentMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as AgentMessage),
    { role: 'user' as const, content: effectiveMessage },
  ]

  let iteration = 0
  let totalTokensUsed = 0
  let lastMessageId: string | null = null
  let beforeScreenshotUrl: string | null = null // P0-2: capture once on first mutation

  try {
    while (iteration < MAX_ITERATIONS && totalTokensUsed < TOKEN_BUDGET) {
      iteration++
      onIterationStart?.(iteration)
      useAIChat.getState().setIterationCount(iteration)

      // Auto-compress: when conversation context exceeds threshold, summarize
      // older messages to free up context window for continued execution.
      const contextTokens = estimateMessagesTokens(
        conversationMessages.map((m) => ({ role: m.role, content: m.content })),
      )
      if (contextTokens >= CONTEXT_COMPRESS_THRESHOLD) {
        conversationMessages = await compressConversation(conversationMessages)
      }

      // Get fresh scene context each iteration (scene may have changed)
      let scenePrompt: string
      try {
        const sceneCtx = serializeSceneContext()
        scenePrompt = formatSceneContextForPrompt(sceneCtx)
      } catch (serializeError) {
        // Fallback: provide minimal context so the LLM can still respond
        console.warn('[AI Agent] Scene serialization failed, using fallback:', serializeError)
        scenePrompt = 'Current scene (level: unknown):\n- Scene data unavailable due to serialization error. Ask user to describe the current scene.'
      }

      // Stream LLM response
      const { text, toolCalls, toolCallIds, usage } = await streamLLMResponse(
        conversationMessages,
        catalogSummary,
        scenePrompt,
      )

      // Track token usage (use API-reported values, fallback to estimate)
      if (usage) {
        totalTokensUsed += usage.totalTokens
        useAIChat.getState().addTokensUsed(usage.totalTokens)
      } else {
        // Fallback: estimate based on conversation + response length
        const estimatedTokens = estimateMessagesTokens([
          { role: 'assistant', content: text || '' },
        ])
        totalTokensUsed += estimatedTokens
        useAIChat.getState().addTokensUsed(estimatedTokens)
      }

      // Save assistant message
      lastMessageId = useAIChat.getState().finishStreaming(
        toolCalls.length > 0 ? toolCalls : undefined,
      )

      // No tool calls → LLM is done, exit loop
      if (toolCalls.length === 0) {
        // Empty response fallback: if LLM returned no text AND no tools,
        // show a helpful message instead of leaving the chat silent.
        if (!text?.trim() && lastMessageId) {
          const fallback = 'Sorry, I was unable to process that request. Please try rephrasing or providing more details.'
          useAIChat.getState().appendStreamContent(fallback)
        }
        onIterationEnd?.(iteration, null)
        break
      }

      // Check for special tool calls (ask_user, confirm_preview, reject_preview)
      const specialResult = await handleSpecialToolCalls(toolCalls, lastMessageId)
      if (specialResult.type === 'answered') {
        // User answered a question — add the exchange to conversation and continue loop
        conversationMessages.push({
          role: 'assistant' as const,
          content: text || '',
        })
        conversationMessages.push({
          role: 'user' as const,
          content: specialResult.answer,
        })
        onIterationEnd?.(iteration, null)
        continue
      }
      if (specialResult.type === 'confirmed' || specialResult.type === 'rejected') {
        onIterationEnd?.(iteration, null)
        break
      }

      // Check for propose_placement (handled as UI, not mutation)
      if (toolCalls.some((tc) => tc.tool === 'propose_placement')) {
        onIterationEnd?.(iteration, null)
        break
      }

      // Execute mutation tool calls
      const mutationCalls = toolCalls.filter(
        (tc) => !['ask_user', 'confirm_preview', 'reject_preview', 'propose_placement'].includes(tc.tool),
      )

      if (mutationCalls.length > 0) {
        // P0-2: Capture before screenshot only on the first mutation iteration.
        // Intermediate iterations skip capture to avoid blocking the main thread.
        if (!beforeScreenshotUrl) {
          beforeScreenshotUrl = await captureScreenshot()
        }
        if (beforeScreenshotUrl && lastMessageId) {
          useAIChat.getState().setScreenshotBefore(lastMessageId, beforeScreenshotUrl)
        }

        // Validate and apply ghost preview
        const validated = validateAllToolCalls(mutationCalls)
        const validOps = validated.filter((op) => op.status !== 'invalid')

        // Only set operations on the message if there are valid ones
        // (avoids showing empty "Preview 0 operations" bar that needs manual confirm)
        if (validOps.length > 0) {
          if (lastMessageId) {
            useAIChat.getState().setOperations(lastMessageId, validated)
          }
          applyGhostPreview(validOps)
        } else if (lastMessageId) {
          // All operations invalid — record them as auto-rejected
          useAIChat.getState().setOperations(lastMessageId, validated)
          useAIChat.getState().rejectOperations(lastMessageId)
        }

        // Record tool errors for context injection (#6)
        const invalidOps = validated.filter((op) => op.status === 'invalid')
        for (const op of invalidOps) {
          const reason = 'errorReason' in op ? (op.errorReason as string) : 'unknown error'
          useAIChat.getState().recordToolError(op.type, reason)
        }

        // Terminal check: only confirm_preview/reject_preview are truly terminal.
        // Pure bulk removes (≥2) also break to let the user review.
        const isTerminalTool = mutationCalls.every((tc) => DETERMINISTIC_TOOLS.has(tc.tool))
        const isPureRemove = mutationCalls.every((tc) =>
          tc.tool === 'remove_item' || tc.tool === 'remove_node',
        )
        const isBulkRemove = isPureRemove && mutationCalls.length >= 2

        if (isTerminalTool || (isBulkRemove && validOps.length > 0)) {
          // Terminal: auto-confirm non-remove ops, then exit loop
          if (!isPureRemove && isGhostPreviewActive()) {
            const log = confirmGhostPreview(validOps)
            invalidateSceneCache()
            if (lastMessageId) {
              log.messageId = lastMessageId
              useAIChat.getState().confirmOperations(lastMessageId)
              useAIChat.getState().addOperationLog(log)
            }
          }
          const toolResult = buildToolResult(
            mutationCalls.map((tc) => tc.tool).join('+'),
            validated,
          )
          onIterationEnd?.(iteration, toolResult)
          break
        }

        // Non-terminal: auto-confirm and feed result back to LLM for next step.
        // This allows the agent to continue building (e.g. walls → doors → furniture).
        let createdNodeIds: AnyNodeId[] = []
        if (isGhostPreviewActive()) {
          const log = confirmGhostPreview(validOps)
          createdNodeIds = log.affectedNodeIds
          invalidateSceneCache()
          if (lastMessageId) {
            log.messageId = lastMessageId
            useAIChat.getState().confirmOperations(lastMessageId)
            useAIChat.getState().addOperationLog(log)
          }
          // Capture after screenshot (async, non-blocking)
          if (lastMessageId) {
            const msgId = lastMessageId
            const timerId = setTimeout(async () => {
              pendingTimers.delete(timerId)
              const afterUrl = await captureScreenshot()
              if (afterUrl) useAIChat.getState().setScreenshotAfter(msgId, afterUrl)
            }, 200)
            pendingTimers.add(timerId)
          }
        }

        // Build compact tool result for LLM feedback
        const toolResult = buildToolResult(
          mutationCalls.map((tc) => tc.tool).join('+'),
          validated,
          createdNodeIds,
          { compact: true },
        )
        onIterationEnd?.(iteration, toolResult)

        // Feed result back to LLM for next iteration
        conversationMessages.push({
          role: 'assistant',
          content: text || '',
        })

        for (let i = 0; i < mutationCalls.length; i++) {
          const callId = toolCallIds?.[i] ?? `call_${i}`
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: callId,
          })
        }
      } else {
        onIterationEnd?.(iteration, null)
        break
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Agent loop error'
    useAIChat.getState().setStreamError(errorMessage)
  } finally {
    useAIChat.getState().setAIProcessing(false)
    useAIChat.getState().setLoopState('complete')
    useAIChat.getState().summarizeIfNeeded()
  }
}

// ============================================================================
// Stream LLM Response
// ============================================================================

/**
 * Send messages to LLM and stream the response.
 * Returns the accumulated text, parsed tool calls, tool call IDs, and token usage.
 */
function streamLLMResponse(
  messages: AgentMessage[],
  catalogSummary: string,
  sceneContext: string,
): Promise<{ text: string; toolCalls: AIToolCall[]; toolCallIds: string[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  return new Promise((resolve, reject) => {
    const store = useAIChat.getState()
    store.startStreaming()

    streamChat(
      {
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        })),
        catalogSummary,
        sceneContext,
      },
      {
        onTextChunk: (text) => {
          useAIChat.getState().appendStreamContent(text)
        },
        onToolCall: () => {
          // Tool calls are accumulated in onComplete
        },
        onComplete: (fullText, toolCalls, toolCallIds, usage) => {
          resolve({ text: fullText, toolCalls, toolCallIds: toolCallIds ?? [], usage })
        },
        onError: (err) => {
          reject(new Error(err))
        },
      },
    )
  })
}

// ============================================================================
// Context Compression
// ============================================================================

/**
 * Compress conversation messages when context exceeds threshold.
 * Calls /api/ai/summarize to condense older messages, keeping recent ones intact.
 * Falls back to simple truncation if summarize API fails.
 */
async function compressConversation(
  messages: AgentMessage[],
): Promise<AgentMessage[]> {
  const toKeep = messages.slice(-COMPRESS_KEEP_RECENT)
  const toSummarize = messages.slice(0, -COMPRESS_KEEP_RECENT)

  if (toSummarize.length < 2) return messages // Nothing worth compressing

  try {
    const response = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: toSummarize.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (response.ok) {
      const { summary } = await response.json()
      if (summary) {
        // Also update the store's conversation summary
        useAIChat.getState().setConversationSummary(summary)

        return [
          { role: 'user' as const, content: `[Previous conversation summary: ${summary}]` },
          { role: 'assistant' as const, content: 'Understood. I have the context from our previous conversation and will continue executing the plan.' },
          ...toKeep,
        ]
      }
    }
  } catch {
    console.warn('[AI Agent] Context compression failed, using simple truncation')
  }

  // Fallback: simple truncation without summary
  return toKeep
}

// ============================================================================
// Shared Confirmation Logic
// ============================================================================

/**
 * A-D4: Extracted shared confirm logic used by both confirmOperationsFromUI
 * and the confirm_preview branch inside handleSpecialToolCalls.
 *
 * Sequence:
 * 1. confirmOperations(messageId) — update UI state
 * 2. confirmGhostPreview(operations) — execute scene mutations
 * 3. addOperationLog(log) — record in history
 * 4. setTimeout (tracked) — capture after-screenshot
 */
async function executeConfirmation(
  messageId: string,
  operations: ValidatedOperation[],
): Promise<void> {
  // Update UI state first so the pending card disappears immediately
  useAIChat.getState().confirmOperations(messageId)

  // Execute the scene mutations
  const log = confirmGhostPreview(operations)
  log.messageId = messageId
  useAIChat.getState().addOperationLog(log)

  // A-M5: Capture after-screenshot with tracked timer
  const timerId = setTimeout(async () => {
    pendingTimers.delete(timerId)
    const afterScreenshot = await captureScreenshot()
    if (afterScreenshot) {
      useAIChat.getState().setScreenshotAfter(messageId, afterScreenshot)
    }
  }, 200)
  pendingTimers.add(timerId)
}

// ============================================================================
// Special Tool Call Handlers
// ============================================================================

type SpecialResult =
  | { type: 'none' }
  | { type: 'answered'; answer: string }
  | { type: 'confirmed' }
  | { type: 'rejected' }

/**
 * Handle special tool calls that don't go through the mutation executor.
 */
async function handleSpecialToolCalls(
  toolCalls: AIToolCall[],
  _messageId: string | null,
): Promise<SpecialResult> {
  // Handle ask_user — pause the loop, wait for user response, then resume
  const askCall = toolCalls.find((tc) => tc.tool === 'ask_user') as AskUserToolCall | undefined
  if (askCall) {
    useAIChat.getState().setLoopState('paused')
    useAIChat.getState().setAIProcessing(false)

    // Wait for the user to respond
    const answer = await new Promise<string>((resolve) => {
      const question: PendingQuestion = {
        question: askCall.question,
        suggestions: askCall.suggestions,
        resolve,
      }
      useAIChat.getState().setPendingQuestion(question)
    })

    // User answered — resume the loop
    useAIChat.getState().setAIProcessing(true)
    useAIChat.getState().setLoopState('running')

    return { type: 'answered', answer }
  }

  // Handle confirm_preview — confirm current ghost preview
  const confirmCall = toolCalls.find((tc) => tc.tool === 'confirm_preview') as ConfirmPreviewToolCall | undefined
  if (confirmCall) {
    const pendingMsg = findPendingMessage()
    if (pendingMsg?.operations) {
      // A-D4: delegate to shared confirmation logic
      await executeConfirmation(pendingMsg.id, pendingMsg.operations)
    }
    return { type: 'confirmed' }
  }

  // Handle reject_preview — reject current ghost preview
  const rejectCall = toolCalls.find((tc) => tc.tool === 'reject_preview') as RejectPreviewToolCall | undefined
  if (rejectCall) {
    clearGhostPreview()
    const pendingMsg = findPendingMessage()
    if (pendingMsg) {
      useAIChat.getState().rejectOperations(pendingMsg.id)
    }
    return { type: 'rejected' }
  }

  return { type: 'none' }
}

/**
 * Find the most recent message with pending operations.
 */
function findPendingMessage() {
  const { messages } = useAIChat.getState()
  return [...messages].reverse().find(
    (m) => m.operationStatus === 'pending' && m.operations?.length,
  )
}

// ============================================================================
// Confirm / Reject Helpers (called from UI)
// ============================================================================

/**
 * Confirm operations from UI button click.
 * A-D4: delegates to shared executeConfirmation.
 */
export async function confirmOperationsFromUI(
  messageId: string,
  operations: ValidatedOperation[],
): Promise<void> {
  await executeConfirmation(messageId, operations)
}

/**
 * Reject operations from UI button click.
 */
export function rejectOperationsFromUI(messageId: string): void {
  clearGhostPreview()
  useAIChat.getState().rejectOperations(messageId)
}

/**
 * Answer a pending question from the AI (resumes the agentic loop).
 */
export function answerPendingQuestion(answer: string): void {
  const { pendingQuestion } = useAIChat.getState()
  if (!pendingQuestion) return

  // Add the answer as a user message
  useAIChat.getState().addUserMessage(answer)

  // Resume the loop
  useAIChat.getState().resolvePendingQuestion(answer)
}

/**
 * Undo a confirmed operation by its log ID.
 * Restores the scene to its pre-operation state using stored snapshots.
 */
export function undoOperationFromUI(logId: string): void {
  useAIChat.getState().undoOperation(logId)
}
