import { nanoid } from 'nanoid'
import { captureScreenshot, useViewer } from '@aedifex/viewer'
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
import { getAIRuntime, getRoomPresetProvider } from './runtime'
import { formatRoomPresetSummary } from './runtime/default-room-presets'
import {
  executeRoomPresetToolCalls,
  isRoomPresetToolCall,
} from './ai-room-preset-executor'
import type { AllowedChatRole, ChatMessageInput } from './contracts/chat-request'
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

// Track pending screenshot timers so they can be cancelled on cleanup
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

/**
 * Global AbortController for the current agent loop.
 * Starting a new loop or calling clearChat aborts the previous one,
 * preventing stale callbacks from corrupting the new conversation state.
 */
let activeLoopController: AbortController | null = null

/**
 * Abort any in-flight agent loop. Called by clearChat and at the start
 * of each new runAgentLoop invocation.
 */
export function abortActiveLoop(): void {
  if (activeLoopController) {
    activeLoopController.abort()
    activeLoopController = null
  }
  // Cancel any pending screenshot timers
  for (const timer of pendingTimers) {
    clearTimeout(timer)
  }
  pendingTimers.clear()
}

/** Total token budget per agent loop run (prompt + completion summed) */
const TOKEN_BUDGET = 10_000_000

/** When conversation context exceeds this threshold, auto-compress */
const CONTEXT_COMPRESS_THRESHOLD = 100_000

/** Safety cap to prevent truly infinite loops (bugs, runaway LLM) */
const MAX_ITERATIONS = 200

/** After this many consecutive all-invalid iterations, force the LLM to stop retrying */
const MAX_CONSECUTIVE_FAILURES = 3

/** Number of recent messages to keep when compressing */
const COMPRESS_KEEP_RECENT = 6

/**
 * Tool calls that skip the feedback loop (deterministic, no adjustment possible).
 * Only confirm/reject are truly terminal — remove operations should loop back
 * so the LLM can follow up (e.g. remove old door → add new door at new position).
 */
const DETERMINISTIC_TOOLS = new Set(['confirm_preview', 'reject_preview'])

// Last run's arguments — lets the error-banner Retry button re-issue the
// request after a transport failure without the user retyping the message.
let lastRunArgs: { userMessage: string; catalogSummary: string } | null = null

/**
 * Re-run the agent loop with the same message as the last run (after a
 * stream/transport error). Returns false when there is nothing to retry
 * or a loop is already in flight.
 */
export function retryLastAgentRun(): boolean {
  if (!lastRunArgs) return false
  const { isAIProcessing, isStreaming } = useAIChat.getState()
  if (isAIProcessing || isStreaming) return false
  void runAgentLoop(lastRunArgs)
  return true
}

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
  // Abort any previous in-flight loop to prevent stale callbacks
  abortActiveLoop()
  lastRunArgs = { userMessage, catalogSummary }
  const loopController = new AbortController()
  activeLoopController = loopController
  const signal = loopController.signal

  const store = useAIChat.getState()

  // If there are lingering ghost preview nodes from a previous loop,
  // pause and ask the user to confirm or discard them before proceeding.
  if (isGhostPreviewActive()) {
    const pendingMsg = [...store.messages].reverse().find(
      (m) => m.operationStatus === 'pending' && m.operations?.length,
    )

    store.setAIProcessing(false)

    const answer = await new Promise<string>((resolve, reject) => {
      // If loop is aborted while waiting for user answer, reject to unblock
      const onAbort = () => reject(new DOMException('Agent loop aborted', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
      store.setPendingQuestion({
        question: 'There are unconfirmed changes from the previous operation. Would you like to keep or discard them before continuing?',
        suggestions: ['Keep changes', 'Discard changes'],
        resolve: (value: string) => {
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
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
  let beforeScreenshotUrl: string | null = null // capture once on first mutation
  let consecutiveFailures = 0 // track all-invalid iterations to break collision loops
  // Multi-level safety net: when the LLM tries to stop with ≥2 levels but no
  // vertical connection (no stair AND no elevator), we inject a reminder
  // and let it run one more iteration to add the missing connection. Latched
  // so we only nag once per user turn — if the LLM still doesn't add one
  // after the reminder, we accept it and exit (probably the user explicitly
  // asked for disconnected levels).
  let verticalConnectionReminderInjected = false

  // Telemetry: best-effort, fully optional. The OSS default runtime
  // ships a frozen no-op object so the indirection is essentially free.
  const telemetry = getAIRuntime().telemetry
  const loopMessageId = nanoid()
  let totalToolCalls = 0
  let loopExitReason: 'success' | 'aborted' | 'failed' | 'budget' | 'iteration-cap' = 'success'
  telemetry?.loopStarted?.({ messageId: loopMessageId, userMessage })

  try {
    while (iteration < MAX_ITERATIONS && totalTokensUsed < TOKEN_BUDGET) {
      // Check if this loop has been superseded by a new one (clearChat or new message)
      if (signal.aborted) break

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

      // Stream LLM response (pass signal so fetch can be aborted)
      const { text, toolCalls, toolCallIds, usage } = await streamLLMResponse(
        conversationMessages,
        catalogSummary,
        scenePrompt,
        signal,
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

      // Decide exit behavior BEFORE finishStreaming, because finishStreaming
      // commits the current streaming buffer and resets streamingContent to
      // ''. If we wait to append the empty-response fallback until after
      // that reset, the fallback lands in the NEXT (never-flushed) streaming
      // session and is invisible in messages[]. Same window applies to
      // reading the scene-context for the vertical-connection reminder.
      let willInjectVerticalReminder = false
      let cachedCheckCtx: ReturnType<typeof serializeSceneContext> | null = null
      if (toolCalls.length === 0 && !verticalConnectionReminderInjected) {
        try {
          cachedCheckCtx = serializeSceneContext()
          const hasVerticalConnection =
            cachedCheckCtx.stairs.length > 0 || cachedCheckCtx.elevators.length > 0
          if (cachedCheckCtx.levels.length >= 2 && !hasVerticalConnection) {
            willInjectVerticalReminder = true
          }
        } catch (err) {
          console.warn('[AI Agent] Multi-level vertical-connection check failed:', err)
        }
      }

      // Empty-response fallback — write to the streaming buffer BEFORE
      // finishStreaming so it ends up inside the committed assistant message
      // visible in messages[]. Skip when the reminder is about to continue
      // the loop, since the reminder will produce real content next round.
      if (toolCalls.length === 0 && !willInjectVerticalReminder && !text?.trim()) {
        const fallback = 'Sorry, I was unable to process that request. Please try rephrasing or providing more details.'
        useAIChat.getState().appendStreamContent(fallback)
      }

      // Save assistant message
      lastMessageId = useAIChat.getState().finishStreaming(
        toolCalls.length > 0 ? toolCalls : undefined,
      )

      // No tool calls → LLM is done, exit loop … unless the scene has a
      // dangling multi-level structure without any stair/elevator connecting
      // it, in which case force one more round to add the missing connection.
      if (toolCalls.length === 0) {
        if (willInjectVerticalReminder && cachedCheckCtx) {
          verticalConnectionReminderInjected = true
          conversationMessages.push({
            role: 'assistant' as const,
            content: text || '',
          })
          conversationMessages.push({
            role: 'user' as const,
            content:
              `[System reminder] The scene now contains ${cachedCheckCtx.levels.length} levels but neither a stair nor an elevator connects them. ` +
              `Per the Multi-Level Building Workflow rules, you MUST add at least one vertical connection so the levels are ` +
              `physically accessible. Either call \`add_stair\` with \`slabOpeningMode:"destination"\` (defaults: ` +
              `\`stairType:"straight"\`, \`length:3.0\`, \`width:1.0\`), or call \`add_elevator\` (defaults: ` +
              `\`width:1.6\`, \`depth:1.6\`, \`cabHeight:2.35\`; service range auto-resolves to the bottom and top served levels). ` +
              `Prefer the elevator when the user explicitly asked for one or the building spans 3+ floors. ` +
              `If the user explicitly asked for a disconnected design, reply with text explaining the constraint and that you ` +
              `are leaving the levels disconnected by request, then stop.`,
          })
          onIterationEnd?.(iteration, null)
          continue
        }
        // Fallback (when applicable) was already appended above before
        // finishStreaming, so the committed assistant message contains it.
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

      // Check for enter_walkthrough (side-effect action, not a scene mutation)
      if (toolCalls.some((tc) => tc.tool === 'enter_walkthrough')) {
        useViewer.getState().setWalkthroughMode(true)
        onIterationEnd?.(iteration, null)
        break
      }

      // Room preset tools (save_room_preset / insert_room_preset) — host-async
      // actions executed by the RoomPresetProvider, NOT scene mutations. They
      // bypass the ghost preview pipeline entirely: validate → call provider →
      // feed the outcome back to the LLM as a tool message and continue the
      // loop so the model can summarize (or recover from quota/name errors).
      // The system prompt instructs the LLM to call these tools standalone;
      // any other mutation calls in the same response are intentionally not
      // executed this iteration (mirrors the propose_placement precedent) —
      // the LLM re-issues them next round after seeing the tool result.
      const presetCalls = toolCalls.filter(isRoomPresetToolCall)
      if (presetCalls.length > 0) {
        const presetResult = await executeRoomPresetToolCalls(presetCalls, lastMessageId)
        totalToolCalls += presetCalls.length
        onIterationEnd?.(iteration, presetResult)

        // Feed result back to the LLM (success wording / host-provided
        // failure messages such as "quota reached" flow through verbatim).
        conversationMessages.push({
          role: 'assistant' as const,
          content: text || '',
        })
        for (let i = 0; i < toolCalls.length; i++) {
          const callId = toolCallIds?.[i] ?? `call_${i}`
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(presetResult),
            tool_call_id: callId,
          })
        }
        continue
      }

      // Execute mutation tool calls
      const mutationCalls = toolCalls.filter(
        (tc) => !['ask_user', 'confirm_preview', 'reject_preview', 'propose_placement'].includes(tc.tool),
      )

      if (mutationCalls.length > 0) {
        // Capture before screenshot only on the first mutation iteration.
        // Intermediate iterations skip capture to avoid blocking the main thread.
        if (!beforeScreenshotUrl) {
          beforeScreenshotUrl = await captureScreenshot()
        }
        if (beforeScreenshotUrl && lastMessageId) {
          useAIChat.getState().setScreenshotBefore(lastMessageId, beforeScreenshotUrl)
        }

        // Validate and apply ghost preview
        const validated = validateAllToolCalls(mutationCalls)
        // Telemetry: emit one event per validated op (no-op by default).
        if (telemetry?.toolValidated) {
          for (const op of validated) {
            telemetry.toolValidated({ tool: op.type, status: op.status })
          }
        }
        totalToolCalls += validated.length
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

        // Record tool errors for context injection
        const invalidOps = validated.filter((op) => op.status === 'invalid')
        for (const op of invalidOps) {
          const reason = 'errorReason' in op ? (op.errorReason as string) : 'unknown error'
          useAIChat.getState().recordToolError(op.type, reason)
        }

        // Track consecutive all-invalid iterations to break collision loops.
        // When the LLM keeps suggesting positions that all fail, force it to
        // stop retrying and inform the user instead.
        if (validOps.length === 0 && invalidOps.length > 0) {
          consecutiveFailures++
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            // Inject a system hint so the LLM stops retrying placements
            conversationMessages.push({
              role: 'assistant',
              content: text || '',
            })
            for (let i = 0; i < mutationCalls.length; i++) {
              const callId = toolCallIds?.[i] ?? `call_${i}`
              const toolResult = buildToolResult(
                mutationCalls.map((tc) => tc.tool).join('+'),
                validated,
              )
              conversationMessages.push({
                role: 'tool',
                content: JSON.stringify(toolResult),
                tool_call_id: callId,
              })
            }
            conversationMessages.push({
              role: 'user',
              content: `[System: ${consecutiveFailures} consecutive placement attempts have all failed due to collisions or space constraints. STOP retrying placements. Instead, inform the user that the space is too crowded and suggest they remove some items first or choose a different location. Use ask_user to present options.]`,
            })
            onIterationEnd?.(iteration, null)
            continue // let LLM respond with ask_user instead of more collisions
          }
        } else {
          consecutiveFailures = 0 // reset on any successful operation
        }

        // Terminal check: only confirm_preview/reject_preview are truly terminal.
        // All other mutations — including bulk removes — auto-confirm. The
        // system prompt requires the LLM to call ask_user before any bulk
        // destructive operation, so a separate UI preview/confirm step would
        // be a redundant second confirmation.
        const isTerminalTool = mutationCalls.every((tc) => DETERMINISTIC_TOOLS.has(tc.tool))

        if (isTerminalTool) {
          // Terminal: auto-confirm any pending ops, then exit loop
          let terminalCreatedIds: AnyNodeId[] = []
          let terminalRemovedIds: AnyNodeId[] = []
          if (isGhostPreviewActive() && validOps.length > 0) {
            const log = confirmGhostPreview(validOps)
            terminalCreatedIds = log.createdNodeIds
            terminalRemovedIds = log.removedNodes.map((r) => r.node.id as AnyNodeId)
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
            terminalCreatedIds,
            { compact: true, removedNodeIds: terminalRemovedIds },
          )
          onIterationEnd?.(iteration, toolResult)
          break
        }

        // Non-terminal: auto-confirm and feed result back to LLM for next step.
        // This allows the agent to continue building (e.g. walls → doors → furniture).
        let createdNodeIds: AnyNodeId[] = []
        let removedNodeIds: AnyNodeId[] = []
        if (isGhostPreviewActive()) {
          const log = confirmGhostPreview(validOps)
          // log.createdNodeIds is the inserts; log.removedNodes carries the
          // (node, parentId) pairs of deletes. Split them apart so the tool
          // result can report each category separately — passing
          // log.affectedNodeIds as "created" was the bug that made remove
          // batches surface as "Created nodes: wall_X (unknown), ..." in the
          // tool result, confusing the LLM into re-issuing the deletes.
          createdNodeIds = log.createdNodeIds
          removedNodeIds = log.removedNodes.map((r) => r.node.id as AnyNodeId)
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
          { compact: true, removedNodeIds },
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
    // AbortError means this loop was superseded — don't show error to user
    if (err instanceof DOMException && err.name === 'AbortError') {
      loopExitReason = 'aborted'
      return
    }
    if (signal.aborted) {
      loopExitReason = 'aborted'
      return
    }
    const errorMessage = err instanceof Error ? err.message : 'Agent loop error'
    // Forward opaque metadata attached by the transport (e.g. SaaS-only
    // { code, upgradeUrl }) so decorator components can render upgrade UI.
    const metadata = (err as { metadata?: Record<string, unknown> })?.metadata ?? null
    useAIChat.getState().setStreamError(errorMessage, metadata)
    loopExitReason = 'failed'
    telemetry?.error?.({ phase: 'stream', message: errorMessage, messageId: loopMessageId })
  } finally {
    // Determine the technical reason for loop exit (success/budget/iteration-cap)
    // if no explicit override was set in catch.
    if (loopExitReason === 'success') {
      if (totalTokensUsed >= TOKEN_BUDGET) loopExitReason = 'budget'
      else if (iteration >= MAX_ITERATIONS) loopExitReason = 'iteration-cap'
    }
    telemetry?.loopFinished?.({
      messageId: loopMessageId,
      iterations: iteration,
      toolCalls: totalToolCalls,
      reason: loopExitReason,
    })

    // Only clean up state if THIS loop is still the active one.
    // If a new loop superseded us, it owns the state now.
    if (!signal.aborted) {
      useAIChat.getState().setAIProcessing(false)
      useAIChat.getState().setLoopState('complete')
      useAIChat.getState().summarizeIfNeeded()
    }
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
  abortSignal?: AbortSignal,
): Promise<{ text: string; toolCalls: AIToolCall[]; toolCallIds: string[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  return new Promise((resolve, reject) => {
    // If already aborted (e.g. clearChat called before stream started), reject immediately
    if (abortSignal?.aborted) {
      reject(new DOMException('Agent loop aborted', 'AbortError'))
      return
    }

    const store = useAIChat.getState()
    store.startStreaming()

    // Route through the AI runtime — OSS default hits fetch('/api/ai/chat'),
    // SaaS overrides with auth-cookie + retry transport.
    const transportSignal = abortSignal ?? new AbortController().signal

    const requestMessages: ChatMessageInput[] = messages.map((m) => ({
      role: m.role as AllowedChatRole,
      content: m.content,
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    }))

    // Saved room presets — re-read each request so a save executed earlier
    // in the same loop is visible to subsequent iterations. Empty list →
    // empty string → field omitted (deployments without a preset backend
    // pay zero prompt-token cost).
    let roomPresetSummary = ''
    try {
      roomPresetSummary = formatRoomPresetSummary(getRoomPresetProvider().list())
    } catch (err) {
      console.warn('[AI Agent] Room preset list failed, omitting summary:', err)
    }

    getAIRuntime().transport.streamChat(
      {
        messages: requestMessages,
        catalogSummary,
        sceneContext,
        ...(roomPresetSummary ? { roomPresetSummary } : {}),
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
        onError: (err, metadata) => {
          // Attach the (opaque) metadata onto the rejection so the loop
          // surface can later forward it into useAIChat.setStreamError.
          const error = new Error(err) as Error & {
            metadata?: Record<string, unknown>
          }
          if (metadata) error.metadata = metadata
          reject(error)
        },
        onRetry: () => {
          useAIChat.getState().startStreaming()
        },
      },
      transportSignal,
    ).catch((err) => {
      if ((err as { name?: string })?.name !== 'AbortError') {
        reject(err)
      }
    })
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
 * Extracted shared confirm logic used by both confirmOperationsFromUI
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

  // Capture after-screenshot with tracked timer
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
      // Delegate to shared confirmation logic
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
 * Delegates to shared executeConfirmation.
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
