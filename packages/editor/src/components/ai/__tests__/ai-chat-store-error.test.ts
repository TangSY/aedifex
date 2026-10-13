/**
 * ai-chat-store — setStreamError preserves opaque metadata.
 *
 * SaaS deployments use `errorMetadata` to ferry transport-layer signals
 * (HTTP code, upgradeUrl, plan info) to their decorator components. The OSS
 * store contract is that this metadata is treated as an opaque
 * Record<string, unknown> — store actions never inspect it, the persistence
 * layer never serializes its contents into a typed schema, and clearError
 * resets it back to null.
 *
 * If setStreamError ever loses the metadata (e.g. by spreading it into a
 * typed object that drops unknown keys), SaaS upgrade overlays silently
 * vanish on quota errors.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

// Mock dependencies the store transitively imports.
vi.mock('../ai-agent-loop', () => ({
  abortActiveLoop: vi.fn(),
}))

vi.mock('../ai-preview-manager', () => ({
  undoConfirmedOperation: vi.fn(),
}))

vi.mock('../ai-token-estimator', () => ({
  shouldAutoCompact: () => false,
}))

const mockSummarize = vi.fn(async () => ({ summary: 'mock-summary' }))
vi.mock('../runtime', () => ({
  getAIRuntime: () => ({
    transport: { summarize: mockSummarize },
    persistence: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    catalog: {},
    telemetry: {},
  }),
}))

import { useAIChat } from '../ai-chat-store'

beforeEach(() => {
  useAIChat.setState({
    messages: [],
    isStreaming: false,
    streamingContent: '',
    error: null,
    errorMetadata: null,
    conversationSummary: null,
    isSummarizing: false,
    summarizeFailureCount: 0,
    recentErrors: new Map(),
    loopState: 'idle',
    iterationCount: 0,
    pendingQuestion: null,
    totalTokensUsed: 0,
    isAIProcessing: false,
    operationLog: [],
    proposals: [],
    activeProposalId: null,
  })
})

describe('useAIChat.setStreamError — opaque metadata', () => {
  it('preserves QUOTA_EXCEEDED + upgradeUrl metadata exactly as supplied', () => {
    const metadata = { code: 'QUOTA_EXCEEDED', upgradeUrl: 'https://example.com/upgrade' }
    useAIChat.getState().setStreamError('Quota exceeded', metadata)

    const state = useAIChat.getState()
    expect(state.error).toBe('Quota exceeded')
    expect(state.errorMetadata).toEqual(metadata)
    // Object identity isn't part of the contract — but value equality is.
    expect(state.errorMetadata?.code).toBe('QUOTA_EXCEEDED')
    expect(state.errorMetadata?.upgradeUrl).toBe('https://example.com/upgrade')
  })

  it('preserves arbitrary unknown keys in the metadata (opaque pass-through)', () => {
    const metadata = {
      code: 'PLAN_REQUIRED',
      upgradeUrl: 'https://app.example/billing',
      planId: 'pro',
      ttlSeconds: 30,
      nested: { trial: true },
    }
    useAIChat.getState().setStreamError('Plan required', metadata)

    const state = useAIChat.getState()
    expect(state.errorMetadata).toEqual(metadata)
    expect(state.errorMetadata?.planId).toBe('pro')
    expect(state.errorMetadata?.ttlSeconds).toBe(30)
    expect((state.errorMetadata?.nested as any)?.trial).toBe(true)
  })

  it('defaults metadata to null when not supplied (OSS path)', () => {
    useAIChat.getState().setStreamError('Generic error')
    const state = useAIChat.getState()
    expect(state.error).toBe('Generic error')
    expect(state.errorMetadata).toBeNull()
  })

  it('explicit null clears metadata even if a prior error attached one', () => {
    useAIChat.getState().setStreamError('Quota', { code: 'QUOTA_EXCEEDED' })
    expect(useAIChat.getState().errorMetadata).not.toBeNull()

    useAIChat.getState().setStreamError('Different error', null)
    expect(useAIChat.getState().errorMetadata).toBeNull()
  })

  it('clearError resets both error and errorMetadata to null', () => {
    useAIChat.getState().setStreamError('Quota', { code: 'QUOTA_EXCEEDED', upgradeUrl: '/u' })

    useAIChat.getState().clearError()
    const state = useAIChat.getState()
    expect(state.error).toBeNull()
    expect(state.errorMetadata).toBeNull()
  })

  it('setStreamError also halts streaming and clears streamingContent', () => {
    useAIChat.setState({ isStreaming: true, streamingContent: 'partial...' })

    useAIChat.getState().setStreamError('Stream broke', { code: 'NETWORK' })
    const state = useAIChat.getState()
    expect(state.isStreaming).toBe(false)
    expect(state.streamingContent).toBe('')
  })
})

describe('useAIChat.startStreaming — clears prior error state', () => {
  it('startStreaming wipes existing error + errorMetadata', () => {
    useAIChat.getState().setStreamError('Old', { code: 'OLD' })

    useAIChat.getState().startStreaming()
    const state = useAIChat.getState()
    expect(state.error).toBeNull()
    expect(state.errorMetadata).toBeNull()
    expect(state.isStreaming).toBe(true)
  })
})
