import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type {
  AIRuntime,
  ChatTransport,
  CatalogProvider,
  ChatPersistence,
  AITelemetry,
  StreamCallbacks,
  LoopExitReason,
} from '../contracts/runtime'
import type { AIToolCall } from '../types'
import type { ChatRequestBody } from '../contracts/chat-request'

// ============================================================================
// Module-level mocks (must be declared BEFORE importing the module under test)
//
// IMPORTANT: We intentionally do NOT mock '../ai-scene-serializer'. The real
// serializer reads from useScene/useViewer, which we DO mock — that's
// sufficient to drive scene state without leaking a stub of formatSceneContext
// into sibling test files (bun:test's vi.mock registry is process-global).
// ============================================================================

const mockNodes: Record<string, unknown> = {}
const mockSelection = { levelId: 'level_1', zoneId: null as string | null, selectedIds: [] as string[] }

vi.mock('@aedifex/viewer', () => ({
  captureScreenshot: vi.fn(async () => 'data:image/png;base64,fake'),
  useViewer: {
    getState: () => ({
      selection: mockSelection,
      setWalkthroughMode: vi.fn(),
    }),
  },
}))

vi.mock('@aedifex/core', () => ({
  useScene: {
    getState: () => ({ nodes: mockNodes }),
  },
}))

vi.mock('../ai-preview-manager', () => ({
  applyGhostPreview: vi.fn(),
  clearGhostPreview: vi.fn(),
  confirmGhostPreview: vi.fn(() => ({
    messageId: '',
    createdNodeIds: [],
    removedNodes: [],
    affectedNodeIds: [],
  })),
  isGhostPreviewActive: vi.fn(() => false),
  undoConfirmedOperation: vi.fn(),
}))

vi.mock('../ai-mutation-executor', () => ({
  validateAllToolCalls: vi.fn(() => [] as unknown[]),
  buildToolResult: vi.fn(() => ({ ok: true })),
}))

// ============================================================================
// Imports — done after vi.mock declarations
// ============================================================================

import { runAgentLoop, abortActiveLoop } from '../ai-agent-loop'
import { setAIRuntime, resetAIRuntimeForTesting } from '../runtime'
import { useAIChat } from '../ai-chat-store'
import { invalidateSceneCache } from '../ai-scene-serializer'

// ============================================================================
// Test runtime — replaceable transport + telemetry
// ============================================================================

interface FakeStreamReply {
  text: string
  toolCalls: AIToolCall[]
  toolCallIds?: string[]
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  /** If set, the transport calls onError instead of onComplete. */
  error?: { message: string; metadata?: Record<string, unknown> }
}

class FakeChatTransport implements ChatTransport {
  private replies: FakeStreamReply[] = []
  callCount = 0

  setReplies(replies: FakeStreamReply[]) {
    this.replies = replies
    this.callCount = 0
  }

  async streamChat(
    _request: ChatRequestBody,
    callbacks: StreamCallbacks,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      throw new DOMException('aborted', 'AbortError')
    }
    const reply = this.replies[this.callCount] ?? {
      text: '',
      toolCalls: [],
      toolCallIds: [],
    }
    this.callCount++

    if (reply.error) {
      callbacks.onError(reply.error.message, reply.error.metadata)
      return
    }

    callbacks.onTextChunk(reply.text)
    callbacks.onComplete(
      reply.text,
      reply.toolCalls,
      reply.toolCallIds ?? reply.toolCalls.map((_, i) => `call_${i}`),
      reply.usage,
    )
  }

  async summarize(): Promise<{ summary: string } | null> {
    return { summary: 'compressed' }
  }
}

const fakeTelemetry: AITelemetry & {
  loopFinishedCalls: Array<{ iterations: number; reason: LoopExitReason; toolCalls: number }>
  errorCalls: Array<{ phase: string; message: string }>
} = {
  loopFinishedCalls: [],
  errorCalls: [],
  loopStarted: vi.fn(),
  loopFinished: vi.fn((ctx) => {
    fakeTelemetry.loopFinishedCalls.push({
      iterations: ctx.iterations,
      reason: ctx.reason,
      toolCalls: ctx.toolCalls,
    })
  }),
  toolValidated: vi.fn(),
  error: vi.fn((err) => {
    fakeTelemetry.errorCalls.push({ phase: err.phase, message: err.message })
  }),
}

const fakeTransport = new FakeChatTransport()

const fakeCatalog: CatalogProvider = {
  resolveSlug: () => ({ asset: null, matchType: 'none', suggestions: [] }),
  generateSummary: () => '',
}

const fakePersistence: ChatPersistence = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

const fakeRuntime: AIRuntime = {
  transport: fakeTransport,
  catalog: fakeCatalog,
  persistence: fakePersistence,
  telemetry: fakeTelemetry,
}

// ============================================================================
// Test helpers — drive scene state by populating mockNodes directly so the
// real serializeSceneContext returns what we need.
// ============================================================================

function resetScene() {
  for (const k of Object.keys(mockNodes)) delete mockNodes[k]
  mockSelection.levelId = 'level_1'
  mockSelection.zoneId = null
  mockSelection.selectedIds = []
  invalidateSceneCache()
}

function setBuildingWithLevels(levelCount: number, opts?: { stairs?: number; elevators?: number }) {
  resetScene()
  const levelIds = Array.from({ length: levelCount }, (_, i) => `level_${i + 1}`)
  const stairIds = Array.from({ length: opts?.stairs ?? 0 }, (_, i) => `stair_${i}`)
  const elevIds = Array.from({ length: opts?.elevators ?? 0 }, (_, i) => `elev_${i}`)

  mockNodes.building_1 = {
    id: 'building_1',
    type: 'building',
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    name: 'Building A',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [...levelIds, ...elevIds],
  }

  for (let i = 0; i < levelCount; i++) {
    const id = levelIds[i]!
    mockNodes[id] = {
      id,
      type: 'level',
      object: 'node',
      parentId: 'building_1',
      visible: true,
      metadata: {},
      level: i,
      children: i === 0 ? stairIds : [],
    }
  }

  for (const stairId of stairIds) {
    mockNodes[stairId] = {
      id: stairId,
      type: 'stair',
      object: 'node',
      parentId: 'level_1',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      children: [],
    }
  }

  for (const elevId of elevIds) {
    mockNodes[elevId] = {
      id: elevId,
      type: 'elevator',
      object: 'node',
      parentId: 'building_1',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: 0,
      width: 1.6,
      depth: 1.6,
      cabHeight: 2.35,
      fromLevelId: 'level_1',
      toLevelId: 'level_2',
      shaftStyle: 'enclosed',
      doorStyle: 'sliding',
      doorPanelStyle: 'center-opening',
      children: [],
    }
  }
}

beforeEach(() => {
  setAIRuntime(fakeRuntime)
  fakeTelemetry.loopFinishedCalls.length = 0
  fakeTelemetry.errorCalls.length = 0
  // Reset all telemetry vi.fn call counters
  ;(fakeTelemetry.loopStarted as ReturnType<typeof vi.fn>).mockClear()
  ;(fakeTelemetry.loopFinished as ReturnType<typeof vi.fn>).mockClear()
  ;(fakeTelemetry.toolValidated as ReturnType<typeof vi.fn>).mockClear()
  ;(fakeTelemetry.error as ReturnType<typeof vi.fn>).mockClear()
  fakeTransport.setReplies([])
  resetScene()
  useAIChat.setState({
    messages: [],
    isStreaming: false,
    streamingContent: '',
    isAIProcessing: false,
    operationLog: [],
    proposals: [],
    activeProposalId: null,
    error: null,
    errorMetadata: null,
    conversationSummary: null,
    isSummarizing: false,
    summarizeFailureCount: 0,
    recentErrors: new Map(),
    pendingQuestion: null,
    loopState: 'idle',
    iterationCount: 0,
    tokensUsed: 0,
  } as Partial<ReturnType<typeof useAIChat.getState>> as ReturnType<typeof useAIChat.getState>)
})

afterEach(() => {
  abortActiveLoop()
  resetAIRuntimeForTesting()
})

// ============================================================================
// Multi-level vertical-connection reminder
// ============================================================================

describe('runAgentLoop — multi-level vertical-connection reminder', () => {
  it('injects reminder ONCE when ≥2 levels + 0 stairs + 0 elevators + 0 toolCalls, then accepts next exit', async () => {
    setBuildingWithLevels(2, { stairs: 0, elevators: 0 })

    fakeTransport.setReplies([
      { text: 'Done.', toolCalls: [], usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
      { text: 'OK, user wants disconnected levels.', toolCalls: [], usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
    ])

    await runAgentLoop({ userMessage: 'build something', catalogSummary: '' })

    // Both replies must have been consumed → reminder triggered second iteration
    expect(fakeTransport.callCount).toBe(2)
    expect(fakeTelemetry.loopFinishedCalls[0]?.iterations).toBe(2)
    expect(fakeTelemetry.loopFinishedCalls[0]?.reason).toBe('success')
  })

  it('does NOT re-inject reminder after it was already triggered (latched per turn)', async () => {
    setBuildingWithLevels(2, { stairs: 0, elevators: 0 })
    fakeTransport.setReplies([
      { text: 'Done.', toolCalls: [] },
      { text: 'Done again.', toolCalls: [] },
      { text: 'Never.', toolCalls: [] },
    ])
    await runAgentLoop({ userMessage: 'build', catalogSummary: '' })
    // Exits after reply 2 (reminder latched)
    expect(fakeTransport.callCount).toBe(2)
  })

  it('does NOT inject reminder when stairs.length > 0', async () => {
    setBuildingWithLevels(2, { stairs: 1, elevators: 0 })
    fakeTransport.setReplies([{ text: 'Done.', toolCalls: [] }])
    await runAgentLoop({ userMessage: 'build', catalogSummary: '' })
    expect(fakeTransport.callCount).toBe(1)
  })

  it('does NOT inject reminder when elevators.length > 0', async () => {
    setBuildingWithLevels(2, { stairs: 0, elevators: 1 })
    fakeTransport.setReplies([{ text: 'Done.', toolCalls: [] }])
    await runAgentLoop({ userMessage: 'build', catalogSummary: '' })
    expect(fakeTransport.callCount).toBe(1)
  })

  it('does NOT inject reminder when fewer than 2 levels exist', async () => {
    setBuildingWithLevels(1, { stairs: 0, elevators: 0 })
    fakeTransport.setReplies([{ text: 'Done.', toolCalls: [] }])
    await runAgentLoop({ userMessage: 'build', catalogSummary: '' })
    expect(fakeTransport.callCount).toBe(1)
  })
})

// ============================================================================
// Loop exit reasons + telemetry
// ============================================================================

describe('runAgentLoop — exit reasons + telemetry', () => {
  it('telemetry.loopStarted fires once at the start', async () => {
    setBuildingWithLevels(1)
    fakeTransport.setReplies([{ text: 'Done.', toolCalls: [] }])
    await runAgentLoop({ userMessage: 'go', catalogSummary: '' })
    expect(fakeTelemetry.loopStarted).toHaveBeenCalledTimes(1)
  })

  it('telemetry.loopFinished fires once at the end with reason=success', async () => {
    setBuildingWithLevels(1)
    fakeTransport.setReplies([{ text: 'Done.', toolCalls: [] }])
    await runAgentLoop({ userMessage: 'go', catalogSummary: '' })
    expect(fakeTelemetry.loopFinished).toHaveBeenCalledTimes(1)
    expect(fakeTelemetry.loopFinishedCalls[0]?.reason).toBe('success')
  })

  it('forwards transport errors with metadata into the store', async () => {
    setBuildingWithLevels(1)
    fakeTransport.setReplies([
      {
        text: '',
        toolCalls: [],
        error: { message: 'quota exceeded', metadata: { code: 'QUOTA', upgradeUrl: '/billing' } },
      },
    ])
    await runAgentLoop({ userMessage: 'go', catalogSummary: '' })
    const state = useAIChat.getState()
    expect(state.error).toBe('quota exceeded')
    expect(state.errorMetadata).toEqual({ code: 'QUOTA', upgradeUrl: '/billing' })
    expect(fakeTelemetry.loopFinishedCalls[0]?.reason).toBe('failed')
  })
})

// ============================================================================
// abortActiveLoop
// ============================================================================

describe('abortActiveLoop', () => {
  it('is callable when no loop is active (no throw)', () => {
    expect(() => abortActiveLoop()).not.toThrow()
  })

  it('is idempotent — calling twice in a row does not throw', () => {
    abortActiveLoop()
    expect(() => abortActiveLoop()).not.toThrow()
  })
})

// ============================================================================
// Empty-response fallback
// ============================================================================

describe('runAgentLoop — empty-response fallback', () => {
  it('commits a fallback assistant message visible to the user when LLM returns nothing', async () => {
    // The fallback must appear in the COMMITTED messages[] — not stuck in the
    // streaming buffer of a never-flushed next session. Previously the loop
    // called finishStreaming() before appendStreamContent(fallback) so the
    // fallback landed in a buffer that was never flushed. Fix: append first,
    // then finishStreaming. This test pins the fixed behavior.
    setBuildingWithLevels(1)
    fakeTransport.setReplies([{ text: '', toolCalls: [] }])
    await runAgentLoop({ userMessage: 'go', catalogSummary: '' })
    const state = useAIChat.getState()
    const lastAssistant = [...state.messages].reverse().find((m) => m.role === 'assistant')
    expect(lastAssistant?.content).toMatch(/unable to process/i)
  })
})
