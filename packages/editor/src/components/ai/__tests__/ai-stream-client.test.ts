import { describe, expect, it, vi, beforeEach } from 'vitest'
import { streamChat } from '../ai-stream-client'
import type { StreamCallbacks } from '../ai-stream-client'

// ============================================================================
// Helpers for building SSE responses
// ============================================================================

function encodeSSELines(lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.join('\n') + '\n')
}

function makeChunk(delta: Record<string, unknown>, finishReason?: string): string {
  return `data: ${JSON.stringify({
    choices: [{
      delta,
      finish_reason: finishReason ?? null,
    }],
  })}`
}

function makeTextChunk(text: string): string {
  return makeChunk({ content: text })
}

function makeToolCallChunk(index: number, id: string, name: string, args: string): string {
  return makeChunk({
    tool_calls: [{
      index,
      id,
      function: { name, arguments: args },
    }],
  })
}

function makeToolCallArgChunk(index: number, args: string): string {
  return makeChunk({
    tool_calls: [{
      index,
      function: { arguments: args },
    }],
  })
}

function makeFinishChunk(finishReason = 'stop'): string {
  return makeChunk({}, finishReason)
}

function makeDoneSignal(): string {
  return 'data: [DONE]'
}

/**
 * Build a ReadableStream that emits `chunks` and then closes.
 */
function makeStream(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encodeSSELines(lines))
      controller.close()
    },
  })
}

function makeCallbacks(overrides?: Partial<StreamCallbacks>): StreamCallbacks & {
  textChunks: string[]
  toolCalls: unknown[]
  completes: [string, unknown[], string[]][]
  errors: string[]
} {
  const textChunks: string[] = []
  const toolCalls: unknown[] = []
  const completes: [string, unknown[], string[]][] = []
  const errors: string[] = []

  return {
    onTextChunk: vi.fn((text) => { textChunks.push(text) }),
    onToolCall: vi.fn((tc) => { toolCalls.push(tc) }),
    onComplete: vi.fn((fullText, tcs, ids) => { completes.push([fullText, tcs, ids]) }),
    onError: vi.fn((err) => { errors.push(err) }),
    textChunks,
    toolCalls,
    completes,
    errors,
    ...overrides,
  }
}

// ============================================================================
// Mock global fetch
// ============================================================================

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockFetchOk(stream: ReadableStream<Uint8Array>) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    body: stream,
  })
}

function mockFetchError(status: number, body?: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body ?? {},
  })
}

const baseRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  catalogSummary: '',
  sceneContext: '',
}

beforeEach(() => {
  mockFetch.mockReset()
})

// ============================================================================
// Text streaming
// ============================================================================

describe('streamChat — text streaming', () => {
  it('calls onTextChunk for each text delta', async () => {
    const stream = makeStream([
      makeTextChunk('Hello'),
      makeTextChunk(' world'),
      makeFinishChunk(),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.onTextChunk).toHaveBeenCalledWith('Hello')
    expect(cbs.onTextChunk).toHaveBeenCalledWith(' world')
    controller.abort()
  })

  it('calls onComplete with full concatenated text', async () => {
    const stream = makeStream([
      makeTextChunk('foo'),
      makeTextChunk('bar'),
      makeFinishChunk(),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.completes[0]?.[0]).toBe('foobar')
    controller.abort()
  })

  it('calls onComplete with empty tool calls when response is text-only', async () => {
    const stream = makeStream([
      makeTextChunk('text only'),
      makeFinishChunk(),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.completes[0]?.[1]).toEqual([])
    controller.abort()
  })
})

// ============================================================================
// Tool call parsing
// ============================================================================

describe('streamChat — tool call parsing', () => {
  it('parses add_item tool call from streamed chunks', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_abc', 'add_item', '{"catalogSlug":"sofa-modern","position":[1,0,2],"rotationY":0}'),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.toolCalls).toHaveLength(1)
    const tc = cbs.toolCalls[0] as any
    expect(tc.tool).toBe('add_item')
    expect(tc.catalogSlug).toBe('sofa-modern')
    expect(tc.position).toEqual([1, 0, 2])
    controller.abort()
  })

  it('assembles tool call arguments split across multiple chunks', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_split', 'add_item', '{"catalogSlug":'),
      makeToolCallArgChunk(0, '"sofa-modern","position":[0,0,0],"rotationY":0}'),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.toolCalls).toHaveLength(1)
    const tc = cbs.toolCalls[0] as any
    expect(tc.catalogSlug).toBe('sofa-modern')
    controller.abort()
  })

  it('parses multiple tool calls with different indices', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_1', 'add_item', '{"catalogSlug":"sofa","position":[0,0,0],"rotationY":0}'),
      makeToolCallChunk(1, 'call_2', 'remove_item', '{"nodeId":"item_123"}'),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.toolCalls).toHaveLength(2)
    expect((cbs.toolCalls[0] as any).tool).toBe('add_item')
    expect((cbs.toolCalls[1] as any).tool).toBe('remove_item')
    controller.abort()
  })

  it('passes tool call IDs to onComplete', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_id_abc', 'remove_item', '{"nodeId":"item_xyz"}'),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    const toolCallIds = cbs.completes[0]?.[2]
    expect(toolCallIds).toContain('call_id_abc')
    controller.abort()
  })

  it('calls onToolCall for each parsed tool call', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_1', 'add_item', '{"catalogSlug":"desk","position":[2,0,3],"rotationY":0}'),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.onToolCall).toHaveBeenCalledTimes(1)
    controller.abort()
  })
})

// ============================================================================
// [DONE] signal
// ============================================================================

describe('streamChat — [DONE] signal', () => {
  it('skips [DONE] line without crashing', async () => {
    const stream = makeStream([
      makeTextChunk('final'),
      makeFinishChunk(),
      makeDoneSignal(),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.errors).toHaveLength(0)
    expect(cbs.completes).toHaveLength(1)
    controller.abort()
  })
})

// ============================================================================
// JSON parse failures
// ============================================================================

describe('streamChat — malformed JSON', () => {
  it('skips malformed JSON lines without crashing', async () => {
    const stream = makeStream([
      'data: {invalid json!!}',
      makeTextChunk('valid'),
      makeFinishChunk(),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.errors).toHaveLength(0)
    expect(cbs.textChunks).toContain('valid')
    controller.abort()
  })

  it('skips tool calls with invalid JSON arguments without crashing', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_bad', 'add_item', '{invalid args}'),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Tool call skipped, no crash, no error
    expect(cbs.errors).toHaveLength(0)
    expect(cbs.toolCalls).toHaveLength(0)
    controller.abort()
  })
})

// ============================================================================
// Network errors
// ============================================================================

describe('streamChat — network errors', () => {
  it('calls onError on non-ok response status', async () => {
    mockFetchError(500, { error: 'Internal Server Error' })

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.errors).toHaveLength(1)
    expect(cbs.errors[0]).toContain('Internal Server Error')
    controller.abort()
  })

  it('calls onError with rate-limit message on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too Many Requests' }),
    })

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.errors).toHaveLength(1)
    expect(cbs.errors[0]).toContain('Too Many Requests')
    controller.abort()
  })

  it('calls onError when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'))

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.errors).toHaveLength(1)
    expect(cbs.errors[0]).toContain('Network failure')
    controller.abort()
  })
})

// ============================================================================
// AbortController
// ============================================================================

describe('streamChat — AbortController', () => {
  it('does not call onError when request is aborted', async () => {
    mockFetch.mockImplementation((_url, opts: RequestInit) => {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'))
        })
      })
    })

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    controller.abort()

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.errors).toHaveLength(0)
  })

  it('returns an AbortController', () => {
    const stream = makeStream([makeFinishChunk()])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    expect(controller).toBeInstanceOf(AbortController)
    controller.abort()
  })
})

// ============================================================================
// Known tool types
// ============================================================================

describe('streamChat — tool type coverage', () => {
  const toolCases: Array<[string, Record<string, unknown>]> = [
    ['remove_item', { nodeId: 'item_1', reason: 'testing' }],
    ['move_item', { nodeId: 'item_1', position: [1, 0, 2], rotationY: 0 }],
    ['update_material', { nodeId: 'item_1', material: 'oak' }],
    ['add_wall', { start: [0, 0], end: [3, 0] }],
    ['add_door', { wallId: 'wall_1', positionAlongWall: 1.5 }],
    ['add_window', { wallId: 'wall_1', positionAlongWall: 2.0 }],
    ['remove_node', { nodeId: 'wall_1' }],
    ['ask_user', { question: 'Where should I place the sofa?' }],
    ['confirm_preview', {}],
    ['reject_preview', {}],
  ]

  for (const [toolName, args] of toolCases) {
    it(`parses ${toolName} tool call`, async () => {
      const stream = makeStream([
        makeToolCallChunk(0, 'call_test', toolName, JSON.stringify(args)),
        makeFinishChunk('tool_calls'),
      ])
      mockFetchOk(stream)

      const cbs = makeCallbacks()
      const controller = streamChat(baseRequest, cbs)

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(cbs.toolCalls).toHaveLength(1)
      expect((cbs.toolCalls[0] as any).tool).toBe(toolName)
      controller.abort()
    })
  }

  it('skips unknown tool names (returns null from parseToolCall)', async () => {
    const stream = makeStream([
      makeToolCallChunk(0, 'call_unknown', 'fly_to_moon', '{"destination":"moon"}'),
      makeFinishChunk('tool_calls'),
    ])
    mockFetchOk(stream)

    const cbs = makeCallbacks()
    const controller = streamChat(baseRequest, cbs)

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(cbs.toolCalls).toHaveLength(0)
    controller.abort()
  })
})
