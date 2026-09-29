/**
 * Regression test: ai-stream-client.parseToolCall MUST handle every tool name
 * that the model can emit via OPENAI_TOOLS. The most recent gap is `add_elevator`
 * — it appears in OPENAI_TOOLS (line 399) and has a validator in validate-structure.ts,
 * but parseToolCall has no switch case. The result is that the LLM successfully
 * calls add_elevator (the function spec is in its system prompt), the SSE stream
 * accumulates the tool call, parseToolCall returns null, the elevator silently
 * never appears in the operation list, and the agent loop loses ground truth
 * about whether the request was honoured.
 *
 * The first test in this file FAILS today and pins the bug. See notes[] in the
 * batch report for the fix (add an `add_elevator` case to parseToolCall).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { streamChat } from '../ai-stream-client'
import type { StreamCallbacks } from '../ai-stream-client'

// ============================================================================
// Helpers — keep the SSE plumbing minimal & reusable.
// ============================================================================

function encodeSSE(lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.join('\n') + '\n')
}

function makeChunk(delta: Record<string, unknown>, finishReason?: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finishReason ?? null }] })}`
}

function makeToolCallChunk(index: number, id: string, name: string, args: string): string {
  return makeChunk({ tool_calls: [{ index, id, function: { name, arguments: args } }] })
}

function makeFinishChunk(reason = 'tool_calls'): string {
  return makeChunk({}, reason)
}

function makeStream(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encodeSSE(lines))
      controller.close()
    },
  })
}

function makeCallbacks(): StreamCallbacks & {
  toolCalls: unknown[]
  completes: unknown[]
  errors: string[]
} {
  const toolCalls: unknown[] = []
  const completes: unknown[] = []
  const errors: string[] = []
  return {
    onTextChunk: vi.fn(),
    onToolCall: vi.fn((tc) => { toolCalls.push(tc) }),
    onComplete: vi.fn((fullText, tcs, ids) => { completes.push({ fullText, tcs, ids }) }),
    onError: vi.fn((e) => { errors.push(e) }),
    toolCalls,
    completes,
    errors,
  }
}

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof fetch

function mockFetchOk(stream: ReadableStream<Uint8Array>) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body: stream })
}

const baseRequest = {
  messages: [{ role: 'user', content: 'add an elevator' }],
  catalogSummary: '',
  sceneContext: '',
}

beforeEach(() => {
  mockFetch.mockReset()
})

// ============================================================================
// add_elevator parsing — REGRESSION (currently FAILING; bug to fix in source)
// ============================================================================

describe('parseToolCall add_elevator', () => {
  it("parseToolCall('add_elevator', {...}) returns valid AIToolCall (if dead code — failing test is the alert)", async () => {
    // Realistic payload mirroring the OpenAI tool schema for add_elevator.
    const args = JSON.stringify({
      position: [3, 0, 5],
      width: 1.8,
      depth: 1.8,
      cabHeight: 2.4,
      fromLevelId: 'level_basement',
      toLevelId: 'level_3',
      shaftStyle: 'glass',
      doorStyle: 'center-opening',
    })

    const stream = makeStream([
      makeToolCallChunk(0, 'call_elev_1', 'add_elevator', args),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)
    await new Promise((r) => setTimeout(r, 20))

    // EXPECTATION: the stream client SHOULD surface the elevator tool call.
    // BUG: parseToolCall has no `case 'add_elevator'` branch, so the tool
    // silently falls into `default: return null` and never reaches the
    // application. This assertion FAILS until that branch is added.
    expect(cbs.toolCalls).toHaveLength(1)
    const tc = cbs.toolCalls[0] as { tool: string; position?: unknown; width?: number }
    expect(tc.tool).toBe('add_elevator')
    expect(tc.position).toEqual([3, 0, 5])
    expect(tc.width).toBe(1.8)

    controller.abort()
  })

  it('add_elevator with only required position still passes through (defaults handled downstream)', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_elev_2', 'add_elevator', JSON.stringify({ position: [0, 0, 0] })),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)
    await new Promise((r) => setTimeout(r, 20))

    expect(cbs.toolCalls).toHaveLength(1)
    expect((cbs.toolCalls[0] as { tool: string }).tool).toBe('add_elevator')

    controller.abort()
  })
})

// ============================================================================
// Sanity: other established tool names continue to parse so this file does
// not regress unrelated paths while the elevator gap is open.
// ============================================================================

describe('parseToolCall — established tools still parse', () => {
  it.each([
    ['add_item', { catalogSlug: 'sofa', position: [0, 0, 0], rotationY: 0 }],
    ['add_wall', { start: [0, 0], end: [3, 0] }],
    ['add_stair', { position: [0, 0, 0] }],
    ['batch_operations', { operations: [], description: '' }],
  ] as const)('still surfaces %s', async (name, payload) => {
    const stream = makeStream([
      makeToolCallChunk(0, `call_${name}`, name, JSON.stringify(payload)),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)
    await new Promise((r) => setTimeout(r, 20))

    expect(cbs.toolCalls).toHaveLength(1)
    expect((cbs.toolCalls[0] as { tool: string }).tool).toBe(name)

    controller.abort()
  })
})
