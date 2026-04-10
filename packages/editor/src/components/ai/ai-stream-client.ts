import type { AIToolCall } from './types'

// ============================================================================
// SSE Stream Client
// Connects to /api/ai/chat and processes OpenAI-format streaming responses.
// Parses text content + tool_call blocks from the event stream.
// ============================================================================

export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface StreamCallbacks {
  onTextChunk: (text: string) => void
  onToolCall: (toolCall: AIToolCall) => void
  onComplete: (fullText: string, toolCalls: AIToolCall[], toolCallIds: string[], usage?: StreamUsage) => void
  onError: (error: string) => void
}

/**
 * Send a chat request and stream the response.
 * Returns an AbortController for cancellation.
 */
/** Maximum stream retry attempts before giving up */
const MAX_STREAM_RETRIES = 1
/** Delay before retrying a failed stream (ms) */
const STREAM_RETRY_DELAY_MS = 1000

/**
 * Send a chat request and stream the response.
 * Automatically retries once on stream failure (inspired by Claude Code's
 * streaming → non-streaming fallback pattern).
 * Returns an AbortController for cancellation.
 */
export function streamChat(
  request: {
    messages: { role: string; content: string; tool_call_id?: string }[]
    catalogSummary: string
    sceneContext: string
  },
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController()

  processStreamWithRetry(request, callbacks, controller.signal).catch((err) => {
    if (err.name !== 'AbortError') {
      callbacks.onError(err.message ?? 'Stream connection failed.')
    }
  })

  return controller
}

async function processStreamWithRetry(
  request: {
    messages: { role: string; content: string; tool_call_id?: string }[]
    catalogSummary: string
    sceneContext: string
  },
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
    try {
      await processStream(request, callbacks, signal)
      return // Success
    } catch (err) {
      if (signal.aborted) throw err

      const isLastAttempt = attempt >= MAX_STREAM_RETRIES
      if (isLastAttempt) throw err

      // Retry after delay
      console.warn(`[AI Stream] Attempt ${attempt + 1} failed, retrying in ${STREAM_RETRY_DELAY_MS}ms`)
      await new Promise((resolve) => setTimeout(resolve, STREAM_RETRY_DELAY_MS))
    }
  }
}

async function processStream(
  request: {
    messages: { role: string; content: string; tool_call_id?: string }[]
    catalogSummary: string
    sceneContext: string
  },
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    let errorMessage: string
    try {
      const errorBody = await response.json()
      errorMessage = errorBody.error ?? `Request failed (${response.status})`
    } catch {
      errorMessage = `Request failed (${response.status})`
    }

    // Use backend error message directly to distinguish different 429 sources
    callbacks.onError(errorMessage)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError('No response body.')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  const toolCalls: AIToolCall[] = []
  // BUG FIX A-8: Guard against onComplete being called twice (once on finish_reason, once after loop)
  let completed = false
  // Track token usage from stream_options: { include_usage: true }
  let streamUsage: StreamUsage | undefined

  // State for tracking OpenAI tool_calls across streaming chunks.
  // OpenAI streams tool calls by index — each chunk carries an index and
  // a partial function name/arguments fragment. We accumulate per-index.
  const pendingTools: Map<number, { id: string; name: string; arguments: string }> = new Map()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') continue

        let chunk: Record<string, unknown>
        try {
          chunk = JSON.parse(data)
        } catch {
          continue
        }

        // Capture usage from the final chunk (stream_options: { include_usage: true })
        const chunkUsage = chunk.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
        if (chunkUsage) {
          streamUsage = {
            promptTokens: chunkUsage.prompt_tokens ?? 0,
            completionTokens: chunkUsage.completion_tokens ?? 0,
            totalTokens: chunkUsage.total_tokens ?? 0,
          }
        }

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined
        const choice = choices?.[0]
        if (!choice) continue

        const delta = choice.delta as Record<string, unknown> | undefined
        if (!delta) continue

        // Handle text content
        if (delta.content) {
          const text = delta.content as string
          fullText += text
          callbacks.onTextChunk(text)
        }

        // Handle tool calls (streamed by index)
        const deltaToolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
        if (deltaToolCalls) {
          for (const tc of deltaToolCalls) {
            const index = tc.index as number
            const fn = tc.function as Record<string, unknown> | undefined

            if (!pendingTools.has(index)) {
              pendingTools.set(index, { id: '', name: '', arguments: '' })
            }
            const pending = pendingTools.get(index)!

            // Track tool call ID (sent in the first chunk for each tool call)
            if (tc.id) {
              pending.id = tc.id as string
            }
            if (fn?.name) {
              pending.name = fn.name as string
            }
            if (fn?.arguments) {
              pending.arguments += fn.arguments as string
            }
          }
        }

        // Check if stream is complete
        const finishReason = choice.finish_reason as string | null
        if (finishReason) {
          // Assemble all accumulated tool calls
          const toolCallIds: string[] = []
          for (const [, pending] of pendingTools) {
            if (!pending.name) continue
            try {
              const input = JSON.parse(pending.arguments)
              const toolCall = parseToolCall(pending.name, input)
              if (toolCall) {
                toolCalls.push(toolCall)
                toolCallIds.push(pending.id)
                callbacks.onToolCall(toolCall)
              }
            } catch {
              // Failed to parse tool arguments — skip
            }
          }

          completed = true
          callbacks.onComplete(fullText, toolCalls, toolCallIds, streamUsage)
          return
        }
      }
    }

    // Stream ended without finish_reason — flush pending tools (only if not already completed)
    if (!completed) {
      const toolCallIds: string[] = []
      for (const [, pending] of pendingTools) {
        if (!pending.name) continue
        try {
          const input = JSON.parse(pending.arguments)
          const toolCall = parseToolCall(pending.name, input)
          if (toolCall) {
            toolCalls.push(toolCall)
            toolCallIds.push(pending.id)
            callbacks.onToolCall(toolCall)
          }
        } catch {
          // Failed to parse tool arguments — skip
        }
      }

      callbacks.onComplete(fullText, toolCalls, toolCallIds, streamUsage)
    }
  } finally {
    reader.releaseLock()
  }
}

// ============================================================================
// Tool Call Parser
// ============================================================================

function parseToolCall(name: string, input: Record<string, unknown>): AIToolCall | null {
  switch (name) {
    case 'add_item':
      return {
        tool: 'add_item',
        catalogSlug: input.catalogSlug as string,
        position: input.position as [number, number, number],
        rotationY: (input.rotationY as number) ?? 0,
        description: input.description as string | undefined,
      }

    case 'remove_item':
      return {
        tool: 'remove_item',
        nodeId: input.nodeId as string,
        reason: input.reason as string | undefined,
      }

    case 'move_item':
      return {
        tool: 'move_item',
        nodeId: input.nodeId as string,
        position: input.position as [number, number, number],
        rotationY: input.rotationY as number | undefined,
        reason: input.reason as string | undefined,
      }

    case 'update_material':
      return {
        tool: 'update_material',
        nodeId: input.nodeId as string,
        material: input.material as string,
        reason: input.reason as string | undefined,
      }

    case 'add_wall':
      return {
        tool: 'add_wall',
        start: input.start as [number, number],
        end: input.end as [number, number],
        thickness: input.thickness as number | undefined,
        height: input.height as number | undefined,
        description: input.description as string | undefined,
      }

    case 'add_door':
      return {
        tool: 'add_door',
        wallId: input.wallId as string,
        positionAlongWall: (input.positionAlongWall as number) ?? 0,
        width: input.width as number | undefined,
        height: input.height as number | undefined,
        side: input.side as 'front' | 'back' | undefined,
        hingesSide: input.hingesSide as 'left' | 'right' | undefined,
        swingDirection: input.swingDirection as 'inward' | 'outward' | undefined,
        description: input.description as string | undefined,
      }

    case 'add_window':
      return {
        tool: 'add_window',
        wallId: input.wallId as string,
        positionAlongWall: (input.positionAlongWall as number) ?? 0,
        heightFromFloor: input.heightFromFloor as number | undefined,
        width: input.width as number | undefined,
        height: input.height as number | undefined,
        side: input.side as 'front' | 'back' | undefined,
        description: input.description as string | undefined,
      }

    case 'update_wall':
      return {
        tool: 'update_wall',
        nodeId: input.nodeId as string,
        height: input.height as number | undefined,
        thickness: input.thickness as number | undefined,
        reason: input.reason as string | undefined,
      }

    case 'update_door':
      return {
        tool: 'update_door',
        nodeId: input.nodeId as string,
        width: input.width as number | undefined,
        height: input.height as number | undefined,
        positionAlongWall: input.positionAlongWall as number | undefined,
        side: input.side as 'front' | 'back' | undefined,
        hingesSide: input.hingesSide as 'left' | 'right' | undefined,
        swingDirection: input.swingDirection as 'inward' | 'outward' | undefined,
        reason: input.reason as string | undefined,
      }

    case 'update_window':
      return {
        tool: 'update_window',
        nodeId: input.nodeId as string,
        width: input.width as number | undefined,
        height: input.height as number | undefined,
        positionAlongWall: input.positionAlongWall as number | undefined,
        heightFromFloor: input.heightFromFloor as number | undefined,
        side: input.side as 'front' | 'back' | undefined,
        reason: input.reason as string | undefined,
      }

    case 'remove_node':
      return {
        tool: 'remove_node',
        nodeId: input.nodeId as string,
        reason: input.reason as string | undefined,
      }

    case 'batch_operations':
      return {
        tool: 'batch_operations',
        operations: (input.operations as Record<string, unknown>[]) ?? [],
        description: (input.description as string) ?? '',
      }

    case 'propose_placement':
      return {
        tool: 'propose_placement',
        question: (input.question as string) ?? '',
        options: ((input.options as Record<string, unknown>[]) ?? []).map((opt) => ({
          id: (opt.id as string) ?? '',
          label: (opt.label as string) ?? '',
          catalogSlug: (opt.catalogSlug as string) ?? '',
          position: (opt.position as [number, number, number]) ?? [0, 0, 0],
          rotationY: (opt.rotationY as number) ?? 0,
          reason: (opt.reason as string) ?? '',
        })),
      }

    case 'ask_user':
      return {
        tool: 'ask_user',
        question: (input.question as string) ?? '',
        suggestions: input.suggestions as string[] | undefined,
      }

    case 'confirm_preview':
      return {
        tool: 'confirm_preview',
        reason: input.reason as string | undefined,
      }

    case 'reject_preview':
      return {
        tool: 'reject_preview',
        reason: input.reason as string | undefined,
      }

    default:
      return null
  }
}
