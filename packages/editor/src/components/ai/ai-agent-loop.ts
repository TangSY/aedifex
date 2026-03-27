import { captureScreenshot } from '../editor/thumbnail-generator'
import { useAIChat } from './ai-chat-store'
import { buildToolResult, validateAllToolCalls } from './ai-mutation-executor'
import {
  applyGhostPreview,
  clearGhostPreview,
  confirmGhostPreview,
} from './ai-preview-manager'
import { formatSceneContextForPrompt, serializeSceneContext } from './ai-scene-serializer'
import { streamChat } from './ai-stream-client'
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

/** Maximum iterations per user message to prevent infinite loops */
const MAX_ITERATIONS = 5

/** Tool calls that skip the feedback loop (deterministic, no adjustment possible) */
const DETERMINISTIC_TOOLS = new Set(['remove_item', 'remove_node', 'confirm_preview', 'reject_preview'])

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

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration++
      onIterationStart?.(iteration)
      useAIChat.getState().setIterationCount(iteration)

      // Get fresh scene context each iteration (scene may have changed)
      const sceneCtx = serializeSceneContext()

      // Stream LLM response
      const { text, toolCalls, toolCallIds } = await streamLLMResponse(
        conversationMessages,
        catalogSummary,
        formatSceneContextForPrompt(sceneCtx),
      )

      // Save assistant message
      lastMessageId = useAIChat.getState().finishStreaming(
        toolCalls.length > 0 ? toolCalls : undefined,
      )

      // No tool calls → LLM is done, exit loop
      if (toolCalls.length === 0) {
        onIterationEnd?.(iteration, null)
        break
      }

      // Check for special tool calls (ask_user, confirm_preview, reject_preview)
      const specialResult = await handleSpecialToolCalls(toolCalls, lastMessageId)
      if (specialResult === 'paused') {
        // Loop was paused for ask_user — it will be resumed externally
        return
      }
      if (specialResult === 'confirmed' || specialResult === 'rejected') {
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
        // Capture before screenshot
        const beforeScreenshot = await captureScreenshot()
        if (beforeScreenshot && lastMessageId) {
          useAIChat.getState().setScreenshotBefore(lastMessageId, beforeScreenshot)
        }

        // Validate and apply ghost preview
        const validated = validateAllToolCalls(mutationCalls)
        if (lastMessageId) {
          useAIChat.getState().setOperations(lastMessageId, validated)
        }

        const validOps = validated.filter((op) => op.status !== 'invalid')
        if (validOps.length > 0) {
          applyGhostPreview(validOps)
        }

        // Build tool result for LLM feedback
        const toolResult = buildToolResult(
          mutationCalls.map((tc) => tc.tool).join('+'),
          validated,
        )
        onIterationEnd?.(iteration, toolResult)

        // Check if this is a deterministic operation (skip feedback)
        const isDeterministic = mutationCalls.every((tc) => DETERMINISTIC_TOOLS.has(tc.tool))
        if (isDeterministic && toolResult.success) {
          break
        }

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
// Special Tool Call Handlers
// ============================================================================

type SpecialResult = 'none' | 'paused' | 'confirmed' | 'rejected'

/**
 * Handle special tool calls that don't go through the mutation executor.
 */
async function handleSpecialToolCalls(
  toolCalls: AIToolCall[],
  messageId: string,
): Promise<SpecialResult> {
  // Handle ask_user — pause the loop and wait for user response
  const askCall = toolCalls.find((tc) => tc.tool === 'ask_user') as AskUserToolCall | undefined
  if (askCall) {
    useAIChat.getState().setLoopState('paused')
    useAIChat.getState().setAIProcessing(false)

    // Create a promise that will be resolved when the user responds
    await new Promise<string>((resolve) => {
      const question: PendingQuestion = {
        question: askCall.question,
        suggestions: askCall.suggestions,
        resolve,
      }
      useAIChat.getState().setPendingQuestion(question)
    })

    return 'paused'
  }

  // Handle confirm_preview — confirm current ghost preview
  const confirmCall = toolCalls.find((tc) => tc.tool === 'confirm_preview') as ConfirmPreviewToolCall | undefined
  if (confirmCall) {
    const pendingMsg = findPendingMessage()
    if (pendingMsg?.operations) {
      // Update UI state first so the pending operation card disappears immediately
      useAIChat.getState().confirmOperations(pendingMsg.id)

      const log = confirmGhostPreview(pendingMsg.operations)
      log.messageId = pendingMsg.id
      useAIChat.getState().addOperationLog(log)

      // Capture after screenshot
      setTimeout(async () => {
        const afterScreenshot = await captureScreenshot()
        if (afterScreenshot) {
          useAIChat.getState().setScreenshotAfter(pendingMsg.id, afterScreenshot)
        }
      }, 200)
    }
    return 'confirmed'
  }

  // Handle reject_preview — reject current ghost preview
  const rejectCall = toolCalls.find((tc) => tc.tool === 'reject_preview') as RejectPreviewToolCall | undefined
  if (rejectCall) {
    clearGhostPreview()
    const pendingMsg = findPendingMessage()
    if (pendingMsg) {
      useAIChat.getState().rejectOperations(pendingMsg.id)
    }
    return 'rejected'
  }

  return 'none'
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
 */
export async function confirmOperationsFromUI(
  messageId: string,
  operations: ValidatedOperation[],
): Promise<void> {
  // Update UI state first so the pending operation card disappears immediately
  useAIChat.getState().confirmOperations(messageId)

  // Then execute the scene mutations (heavier, triggers re-renders)
  const log = confirmGhostPreview(operations)
  log.messageId = messageId
  useAIChat.getState().addOperationLog(log)

  // Capture after screenshot
  setTimeout(async () => {
    const afterScreenshot = await captureScreenshot()
    if (afterScreenshot) {
      useAIChat.getState().setScreenshotAfter(messageId, afterScreenshot)
    }
  }, 200)
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
