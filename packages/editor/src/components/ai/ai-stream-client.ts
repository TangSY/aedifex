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
  onRetry?: () => void
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

      callbacks.onRetry?.()

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

  await parseSseChatStream(response, callbacks)
}

/**
 * Parse a `text/event-stream` chat response (OpenAI-format deltas) and
 * fire callbacks for text chunks, tool calls, completion, and errors.
 *
 * Exposed as a shared helper so SaaS deployments can implement their
 * own ChatTransport without duplicating the SSE / tool_call accumulator
 * logic. The caller is responsible for the fetch itself + non-2xx
 * status handling — this function only consumes the readable body.
 */
export async function parseSseChatStream(
  response: Response,
  callbacks: StreamCallbacks,
): Promise<void> {
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

        // Check for server-side error signal in the SSE chunk
        if (chunk.error) {
          callbacks.onError(chunk.error as string)
          return
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
            } catch (parseError) {
              console.error(`Failed to parse tool call arguments for ${pending.name}:`, parseError)
              const reason = parseError instanceof Error ? parseError.message : String(parseError)
              const preview = pending.arguments.length > 200
                ? `${pending.arguments.slice(0, 200)}…`
                : pending.arguments
              callbacks.onError?.(
                `Tool call "${pending.name}" had invalid arguments: ${reason}. Raw: ${preview}`,
              )
              continue
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
        } catch (parseError) {
          console.error(`Failed to parse tool call arguments for ${pending.name}:`, parseError)
          const reason = parseError instanceof Error ? parseError.message : String(parseError)
          const preview = pending.arguments.length > 200
            ? `${pending.arguments.slice(0, 200)}…`
            : pending.arguments
          callbacks.onError?.(
            `Tool call "${pending.name}" had invalid arguments: ${reason}. Raw: ${preview}`,
          )
          continue
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
        outdoor: input.outdoor === true ? true : undefined,
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
        outdoor: input.outdoor === true ? true : undefined,
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
        curveOffset: input.curveOffset as number | undefined,
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
        start: input.start as [number, number] | undefined,
        end: input.end as [number, number] | undefined,
        height: input.height as number | undefined,
        thickness: input.thickness as number | undefined,
        curveOffset: input.curveOffset as number | undefined,
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

    case 'add_level':
      return {
        tool: 'add_level',
        name: input.name as string | undefined,
        description: input.description as string | undefined,
      }

    case 'add_slab':
      return {
        tool: 'add_slab',
        polygon: input.polygon as [number, number][],
        elevation: input.elevation as number | undefined,
        holes: input.holes as [number, number][][] | undefined,
        levelId: input.levelId as string | undefined,
        description: input.description as string | undefined,
      }

    case 'update_slab':
      return {
        tool: 'update_slab',
        nodeId: input.nodeId as string,
        elevation: input.elevation as number | undefined,
        polygon: input.polygon as [number, number][] | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_ceiling':
      return {
        tool: 'add_ceiling',
        polygon: input.polygon as [number, number][],
        height: input.height as number | undefined,
        material: input.material as string | undefined,
        levelId: input.levelId as string | undefined,
        description: input.description as string | undefined,
      }

    case 'update_ceiling':
      return {
        tool: 'update_ceiling',
        nodeId: input.nodeId as string,
        height: input.height as number | undefined,
        material: input.material as string | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_roof':
      return {
        tool: 'add_roof',
        position: input.position as [number, number, number],
        width: input.width as number,
        depth: input.depth as number,
        roofType: input.roofType as 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat',
        roofHeight: input.roofHeight as number | undefined,
        wallHeight: input.wallHeight as number | undefined,
        overhang: input.overhang as number | undefined,
        levelId: input.levelId as string | undefined,
        description: input.description as string | undefined,
      }

    case 'add_roof_accessory':
      return {
        tool: 'add_roof_accessory',
        kind: input.kind as
          | 'chimney'
          | 'dormer'
          | 'skylight'
          | 'solar-panel'
          | 'ridge-vent'
          | 'box-vent'
          | 'turbine-vent'
          | 'eyebrow-vent'
          | 'cupola'
          | 'gutter'
          | 'downspout',
        roofSegmentId: input.roofSegmentId as string,
        position: input.position as [number, number, number],
        rotation: input.rotation as number | undefined,
        width: input.width as number | undefined,
        depth: input.depth as number | undefined,
        heightAboveRidge: input.heightAboveRidge as number | undefined,
        length: input.length as number | undefined,
        gutterId: input.gutterId as string | undefined,
        offsetAlongGutter: input.offsetAlongGutter as number | undefined,
        description: input.description as string | undefined,
      }

    case 'update_roof':
      return {
        tool: 'update_roof',
        nodeId: input.nodeId as string,
        roofType: input.roofType as 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat' | undefined,
        roofHeight: input.roofHeight as number | undefined,
        wallHeight: input.wallHeight as number | undefined,
        width: input.width as number | undefined,
        depth: input.depth as number | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_stair':
      return {
        tool: 'add_stair',
        position: input.position as [number, number, number],
        rotationY: input.rotationY as number | undefined,
        width: input.width as number | undefined,
        length: input.length as number | undefined,
        height: input.height as number | undefined,
        stepCount: input.stepCount as number | undefined,
        stairType: input.stairType as 'straight' | 'curved' | 'spiral' | undefined,
        slabOpeningMode: input.slabOpeningMode as 'none' | 'destination' | undefined,
        openingOffset: input.openingOffset as number | undefined,
        fillToFloor: input.fillToFloor as boolean | undefined,
        innerRadius: input.innerRadius as number | undefined,
        sweepAngle: input.sweepAngle as number | undefined,
        topLandingMode: input.topLandingMode as 'none' | 'integrated' | undefined,
        topLandingDepth: input.topLandingDepth as number | undefined,
        showCenterColumn: input.showCenterColumn as boolean | undefined,
        showStepSupports: input.showStepSupports as boolean | undefined,
        railingMode: input.railingMode as 'none' | 'left' | 'right' | 'both' | undefined,
        railingHeight: input.railingHeight as number | undefined,
        fromLevelId: input.fromLevelId as string | null | undefined,
        toLevelId: input.toLevelId as string | null | undefined,
        levelId: input.levelId as string | undefined,
        description: input.description as string | undefined,
      }

    case 'add_elevator':
      return {
        tool: 'add_elevator',
        position: input.position as [number, number, number],
        rotationY: input.rotationY as number | undefined,
        width: input.width as number | undefined,
        depth: input.depth as number | undefined,
        cabHeight: input.cabHeight as number | undefined,
        fromLevelId: input.fromLevelId as string | null | undefined,
        toLevelId: input.toLevelId as string | null | undefined,
        servedLevelIds: input.servedLevelIds as string[] | undefined,
        shaftStyle: input.shaftStyle as 'solid' | 'glass' | undefined,
        doorStyle: input.doorStyle as 'center-opening' | 'single-left' | 'single-right' | undefined,
        doorPanelStyle: input.doorPanelStyle as 'glass-frame' | 'solid-panel' | 'segmented-panel' | undefined,
        buildingId: input.buildingId as string | undefined,
        description: input.description as string | undefined,
      }

    case 'update_stair':
      return {
        tool: 'update_stair',
        nodeId: input.nodeId as string,
        position: input.position as [number, number, number] | undefined,
        rotationY: input.rotationY as number | undefined,
        width: input.width as number | undefined,
        length: input.length as number | undefined,
        height: input.height as number | undefined,
        stepCount: input.stepCount as number | undefined,
        stairType: input.stairType as 'straight' | 'curved' | 'spiral' | undefined,
        slabOpeningMode: input.slabOpeningMode as 'none' | 'destination' | undefined,
        openingOffset: input.openingOffset as number | undefined,
        fillToFloor: input.fillToFloor as boolean | undefined,
        innerRadius: input.innerRadius as number | undefined,
        sweepAngle: input.sweepAngle as number | undefined,
        topLandingMode: input.topLandingMode as 'none' | 'integrated' | undefined,
        topLandingDepth: input.topLandingDepth as number | undefined,
        showCenterColumn: input.showCenterColumn as boolean | undefined,
        showStepSupports: input.showStepSupports as boolean | undefined,
        railingMode: input.railingMode as 'none' | 'left' | 'right' | 'both' | undefined,
        railingHeight: input.railingHeight as number | undefined,
        fromLevelId: input.fromLevelId as string | null | undefined,
        toLevelId: input.toLevelId as string | null | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_zone':
      return {
        tool: 'add_zone',
        polygon: input.polygon as [number, number][],
        name: input.name as string | undefined,
        levelId: input.levelId as string | undefined,
        description: input.description as string | undefined,
      }

    case 'update_zone':
      return {
        tool: 'update_zone',
        nodeId: input.nodeId as string,
        polygon: input.polygon as [number, number][] | undefined,
        name: input.name as string | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_building':
      return {
        tool: 'add_building',
        position: input.position as [number, number, number] | undefined,
        name: input.name as string | undefined,
        description: input.description as string | undefined,
      }

    case 'update_site':
      return {
        tool: 'update_site',
        polygon: input.polygon as [number, number][] | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_scan':
      return {
        tool: 'add_scan',
        url: input.url as string,
        position: input.position as [number, number, number] | undefined,
        scale: input.scale as number | undefined,
        opacity: input.opacity as number | undefined,
        description: input.description as string | undefined,
      }

    case 'add_guide':
      return {
        tool: 'add_guide',
        url: input.url as string,
        position: input.position as [number, number, number] | undefined,
        scale: input.scale as number | undefined,
        opacity: input.opacity as number | undefined,
        description: input.description as string | undefined,
      }

    case 'update_item':
      return {
        tool: 'update_item',
        nodeId: input.nodeId as string,
        scale: input.scale as [number, number, number] | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_fence':
      return {
        tool: 'add_fence',
        start: input.start as [number, number],
        end: input.end as [number, number],
        height: input.height as number | undefined,
        thickness: input.thickness as number | undefined,
        style: input.style as 'slat' | 'rail' | 'privacy' | undefined,
        baseStyle: input.baseStyle as 'floating' | 'grounded' | undefined,
        color: input.color as string | undefined,
        postSpacing: input.postSpacing as number | undefined,
        curveOffset: input.curveOffset as number | undefined,
        levelId: input.levelId as string | undefined,
        description: input.description as string | undefined,
      }

    case 'update_fence':
      return {
        tool: 'update_fence',
        nodeId: input.nodeId as string,
        start: input.start as [number, number] | undefined,
        end: input.end as [number, number] | undefined,
        height: input.height as number | undefined,
        thickness: input.thickness as number | undefined,
        style: input.style as 'slat' | 'rail' | 'privacy' | undefined,
        baseStyle: input.baseStyle as 'floating' | 'grounded' | undefined,
        color: input.color as string | undefined,
        postSpacing: input.postSpacing as number | undefined,
        curveOffset: input.curveOffset as number | undefined,
        reason: input.reason as string | undefined,
      }

    case 'update_wall_material':
      return {
        tool: 'update_wall_material',
        nodeId: input.nodeId as string,
        side: input.side as 'interior' | 'exterior' | 'both',
        materialPreset: input.materialPreset as string | undefined,
        materialColor: input.materialColor as string | undefined,
        reason: input.reason as string | undefined,
      }

    case 'update_roof_material':
      return {
        tool: 'update_roof_material',
        nodeId: input.nodeId as string,
        role: input.role as 'top' | 'edge' | 'wall',
        materialPreset: input.materialPreset as string | undefined,
        materialColor: input.materialColor as string | undefined,
        reason: input.reason as string | undefined,
      }

    case 'update_stair_material':
      return {
        tool: 'update_stair_material',
        nodeId: input.nodeId as string,
        role: input.role as 'railing' | 'tread' | 'side',
        materialPreset: input.materialPreset as string | undefined,
        materialColor: input.materialColor as string | undefined,
        reason: input.reason as string | undefined,
      }

    case 'add_cut_out':
      return {
        tool: 'add_cut_out',
        nodeId: input.nodeId as string,
        hole: input.hole as [number, number][],
        description: input.description as string | undefined,
      }

    case 'move_building':
      return {
        tool: 'move_building',
        nodeId: input.nodeId as string,
        position: input.position as [number, number, number] | undefined,
        rotationY: input.rotationY as number | undefined,
        reason: input.reason as string | undefined,
      }

    case 'clone_level':
      return {
        tool: 'clone_level',
        levelId: input.levelId as string,
        name: input.name as string | undefined,
        description: input.description as string | undefined,
      }

    case 'enter_walkthrough':
      return {
        tool: 'enter_walkthrough',
        reason: input.reason as string | undefined,
      }

    case 'save_room_preset':
      return {
        tool: 'save_room_preset',
        roomName: (input.roomName as string) ?? '',
        levelName: input.levelName as string | undefined,
      }

    case 'insert_room_preset':
      return {
        tool: 'insert_room_preset',
        presetName: (input.presetName as string) ?? '',
        levelName: input.levelName as string | undefined,
        position: input.position as [number, number] | undefined,
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
