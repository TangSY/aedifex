import { captureScreenshot } from '@aedifex/viewer'
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
// Replaces the single-pass model in ai-chat-panel.tsx.
// ============================================================================

// A-M5: Track pending screenshot timers so they can be cancelled on cleanup
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

/** Maximum iterations per user message to prevent infinite loops */
const MAX_ITERATIONS = 8

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
  store.setAIProcessing(true)

  // Build conversation history + new user message
  const history = store.getConversationHistory()
  const conversationMessages: AgentMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as AgentMessage),
    { role: 'user' as const, content: userMessage },
  ]

  let iteration = 0
  let lastMessageId: string | null = null
  let beforeScreenshotUrl: string | null = null // P0-2: capture once on first mutation

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration++
      onIterationStart?.(iteration)
      useAIChat.getState().setIterationCount(iteration)

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
      const { text, toolCalls, toolCallIds } = await streamLLMResponse(
        conversationMessages,
        catalogSummary,
        scenePrompt,
      )

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

        // Check if this is a deterministic operation (skip feedback)
        // 1. confirm/reject are always terminal
        // 2. Pure remove batches (all remove_item/remove_node) with all succeeded
        //    are also terminal — no follow-up needed, prevents LLM from repeating
        //    the same deletes and generating a noisy "all invalid" second attempt.
        // 3. Pure structural batches (add_wall/add_door/add_window/remove_*) skip
        //    feedback — these are precise operations that don't benefit from LLM
        //    adjustment, and looping causes duplicate walls (Critical bug fix).
        // Record tool errors for context injection (#6)
        const invalidOps = validated.filter((op) => op.status === 'invalid')
        for (const op of invalidOps) {
          const reason = 'errorReason' in op ? (op.errorReason as string) : 'unknown error'
          useAIChat.getState().recordToolError(op.type, reason)
        }

        const isTerminalTool = mutationCalls.every((tc) => DETERMINISTIC_TOOLS.has(tc.tool))
        const isPureRemove = mutationCalls.every((tc) =>
          tc.tool === 'remove_item' || tc.tool === 'remove_node',
        )
        // Single remove should loop back so LLM can follow up with replacement
        // (e.g. remove old wall → add two new wall segments for "open a gap").
        // Only batch removes (≥2) are terminal to avoid repeated delete attempts.
        const isBulkRemove = isPureRemove && mutationCalls.length >= 2
        // Pure structural batches (all add_wall / remove_node / remove_item) are
        // deterministic — the LLM cannot improve them via feedback, and looping
        // back causes duplicate walls/deletes until MAX_ITERATIONS.
        const STRUCTURAL_DETERMINISTIC = new Set([
          'add_wall',
          'add_door',
          'add_window',
          'add_stair',
          'update_stair',
          'remove_item',
          'remove_node',
          'update_wall',
          'update_item',
          'update_slab',
          'update_ceiling',
          'update_roof',
          'update_zone',
          'update_site',
        ])
        const isPureStructuralBatch = mutationCalls.every((tc: AIToolCall) => {
          if (STRUCTURAL_DETERMINISTIC.has(tc.tool)) return true
          if (tc.tool === 'batch_operations') {
            // tc is narrowed to BatchOperationsToolCall by discriminated union
            return tc.operations.every((op) => {
              // op.type comes from the original operation object embedded in the batch
              const opTool = (op as { type?: string }).type
              return opTool !== undefined && STRUCTURAL_DETERMINISTIC.has(opTool)
            })
          }
          return false
        })
        // add_item/move_item are deterministic only when ALL operations succeeded
        // without adjustment. If any operation was adjusted (position clamped, etc.),
        // feed back to LLM so it can review the adjustment and decide next steps.
        const hasAdjusted = validated.some((op) => op.status === 'adjusted')
        const FURNITURE_TOOLS = new Set(['add_item', 'move_item'])
        const isFurnitureBatch = mutationCalls.some((tc) => FURNITURE_TOOLS.has(tc.tool))
        const isFurnitureDeterministic = isFurnitureBatch && !hasAdjusted && validOps.length > 0

        // When some operations failed, always feed back to LLM so it can
        // explain the failures to the user and potentially retry.
        const hasInvalid = invalidOps.length > 0

        // Detect wall-dependency failures: doors/windows fail with "not found"
        // because walls in the same batch haven't been created yet.
        // In this case, DON'T treat as deterministic — let the loop continue
        // so walls get confirmed first, then LLM retries doors/windows with
        // the real wallIds from createdNodeIds.
        const hasWallCreations = validated.some(
          (op) => op.type === 'add_wall' && op.status !== 'invalid',
        )
        const hasWallDependencyFailures = invalidOps.some(
          (op) =>
            (op.type === 'add_door' || op.type === 'add_window') &&
            'errorReason' in op &&
            typeof op.errorReason === 'string' &&
            op.errorReason.includes('not found'),
        )
        const hasDeferrableDependencies = hasWallCreations && hasWallDependencyFailures

        // Single remove operations should loop back for follow-up (e.g. add replacement walls),
        // but structural batches (add_wall etc.) and bulk removes are terminal.
        const isSingleRemove = isPureRemove && mutationCalls.length === 1
        const isDeterministic =
          isTerminalTool || (isBulkRemove && validOps.length > 0) || (isPureStructuralBatch && !isSingleRemove && validOps.length > 0 && !hasDeferrableDependencies) || isFurnitureDeterministic
        // Structural operations are deterministic — repeating them won't change the
        // outcome. Break even on partial failure to avoid wasting iterations
        // (e.g. batch update_wall ×4 where some fail due to missing wallId).
        // Exception: wall + door/window batches with dependency failures should
        // loop back so LLM can retry with real wall IDs.
        if (isDeterministic && validOps.length > 0 && (!hasInvalid || isPureStructuralBatch)) {
          // Non-destructive operations (add/move/structural) auto-confirm immediately.
          // Only pure remove operations wait for user Reject/Confirm.
          if (!isPureRemove && isGhostPreviewActive()) {
            const log = confirmGhostPreview(validOps)
            invalidateSceneCache()
            if (lastMessageId) {
              log.messageId = lastMessageId
              useAIChat.getState().confirmOperations(lastMessageId)
              useAIChat.getState().addOperationLog(log)
            }
            // Capture after screenshot (async, non-blocking)
            if (lastMessageId) {
              const msgId = lastMessageId
              setTimeout(async () => {
                const afterUrl = await captureScreenshot()
                if (afterUrl) useAIChat.getState().setScreenshotAfter(msgId, afterUrl)
              }, 200)
            }
          }
          const toolResult = buildToolResult(
            mutationCalls.map((tc) => tc.tool).join('+'),
            validated,
          )
          onIterationEnd?.(iteration, toolResult)
          break
        }

        // Auto-confirm current ghost preview before feeding back to LLM.
        // This converts ghost nodes (walls, items, etc.) into real scene nodes,
        // so the next iteration's scene context reflects the actual state.
        // Without this, clearGhostPreview in the next applyGhostPreview would
        // remove the ghost walls, causing doors/windows to lose their parent.
        let createdNodeIds: AnyNodeId[] = []
        if (isGhostPreviewActive()) {
          const log = confirmGhostPreview(validOps)
          createdNodeIds = log.affectedNodeIds
          // Invalidate scene cache so next iteration gets fresh context (#4)
          invalidateSceneCache()
          if (lastMessageId) {
            log.messageId = lastMessageId
            useAIChat.getState().confirmOperations(lastMessageId)
            useAIChat.getState().addOperationLog(log)
          }
        }

        // Build compact tool result for LLM feedback (#5)
        const toolResult = buildToolResult(
          mutationCalls.map((tc) => tc.tool).join('+'),
          validated,
          createdNodeIds,
          { compact: true },
        )
        onIterationEnd?.(iteration, toolResult)

        // Feed result back to LLM for iteration
        // Add assistant message with tool calls to conversation
        conversationMessages.push({
          role: 'assistant',
          content: text || '',
        })

        // Add tool results — one per tool call
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
 * Returns the accumulated text, parsed tool calls, and tool call IDs.
 */
function streamLLMResponse(
  messages: AgentMessage[],
  catalogSummary: string,
  sceneContext: string,
): Promise<{ text: string; toolCalls: AIToolCall[]; toolCallIds: string[] }> {
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
        onComplete: (fullText, toolCalls, toolCallIds) => {
          resolve({ text: fullText, toolCalls, toolCallIds: toolCallIds ?? [] })
        },
        onError: (err) => {
          reject(new Error(err))
        },
      },
    )
  })
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
