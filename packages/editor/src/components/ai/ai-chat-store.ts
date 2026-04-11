import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { undoConfirmedOperation } from './ai-preview-manager'
import { shouldAutoCompact } from './ai-token-estimator'
import type {
  AIOperationLog,
  AIToolCall,
  AgentLoopState,
  ChatMessage,
  PendingQuestion,
  Proposal,
  ValidatedOperation,
} from './types'

// ============================================================================
// AI Chat Store
// ============================================================================

export interface AIChatState {
  // Chat messages
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string

  // AI processing lock
  isAIProcessing: boolean

  // Operation log
  operationLog: AIOperationLog[]

  // Multi-proposal
  proposals: Proposal[]
  activeProposalId: string | null

  // Error state
  error: string | null

  // Conversation summarization
  conversationSummary: string | null
  isSummarizing: boolean
  /** Consecutive summarization failure count (circuit breaker) */
  summarizeFailureCount: number

  // Tool error tracking (for context injection)
  recentErrors: Map<string, { reason: string; count: number }>

  // Agentic loop
  loopState: AgentLoopState
  iterationCount: number
  pendingQuestion: PendingQuestion | null
  /** Accumulated token usage across all iterations in current agent loop */
  totalTokensUsed: number

  // Feature flag
  isEnabled: boolean
}

export interface AIChatActions {
  // Message actions
  addUserMessage: (content: string) => string
  startStreaming: () => void
  appendStreamContent: (chunk: string) => void
  finishStreaming: (toolCalls?: AIToolCall[]) => string
  setStreamError: (error: string) => void

  // Operation actions
  setOperations: (messageId: string, operations: ValidatedOperation[]) => void
  confirmOperations: (messageId: string) => void
  rejectOperations: (messageId: string) => void

  // Screenshot actions
  setScreenshotBefore: (messageId: string, dataUrl: string) => void
  setScreenshotAfter: (messageId: string, dataUrl: string) => void

  // Operation log
  addOperationLog: (log: AIOperationLog) => void
  updateLogStatus: (logId: string, status: AIOperationLog['status']) => void
  undoOperation: (logId: string) => void

  // Multi-proposal
  setProposals: (proposals: Proposal[]) => void
  setActiveProposal: (proposalId: string) => void
  clearProposals: () => void

  // AI lock
  setAIProcessing: (processing: boolean) => void

  // Agentic loop
  setLoopState: (state: AgentLoopState) => void
  setIterationCount: (count: number) => void
  setPendingQuestion: (question: PendingQuestion | null) => void
  resolvePendingQuestion: (answer: string) => void
  addTokensUsed: (tokens: number) => void
  resetTokensUsed: () => void

  // Summarization
  setConversationSummary: (summary: string) => void
  summarizeIfNeeded: () => Promise<void>

  // Tool error tracking
  recordToolError: (tool: string, reason: string) => void
  getRecentErrors: () => { tool: string; reason: string; count: number }[]

  // Reset
  clearChat: () => void
  clearError: () => void

  // Get conversation history for API calls
  getConversationHistory: () => { role: 'user' | 'assistant'; content: string }[]
}

export const useAIChat = create<AIChatState & AIChatActions>((set, get) => ({
  // State
  messages: [],
  isStreaming: false,
  streamingContent: '',
  isAIProcessing: false,
  operationLog: [],
  proposals: [],
  activeProposalId: null,
  error: null,
  conversationSummary: null,
  isSummarizing: false,
  summarizeFailureCount: 0,
  recentErrors: new Map(),
  loopState: 'idle',
  iterationCount: 0,
  pendingQuestion: null,
  totalTokensUsed: 0,
  isEnabled: true,

  // Message actions
  addUserMessage: (content) => {
    const id = nanoid()
    const message: ChatMessage = {
      id,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, message] }))
    return id
  },

  startStreaming: () => {
    set({ isStreaming: true, streamingContent: '', error: null })
  },

  appendStreamContent: (chunk) => {
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
    }))
  },

  finishStreaming: (toolCalls) => {
    const id = nanoid()
    const { streamingContent } = get()
    const message: ChatMessage = {
      id,
      role: 'assistant',
      content: streamingContent,
      timestamp: Date.now(),
      toolCalls,
      operationStatus: toolCalls?.length ? 'pending' : undefined,
    }
    set((state) => ({
      messages: [...state.messages, message],
      isStreaming: false,
      streamingContent: '',
    }))
    return id
  },

  setStreamError: (error) => {
    set({ isStreaming: false, streamingContent: '', error })
  },

  // Operation actions
  setOperations: (messageId, operations) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, operations, operationStatus: 'pending' as const } : m,
      ),
    }))
  },

  confirmOperations: (messageId) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, operationStatus: 'confirmed' as const } : m,
      ),
    }))
  },

  rejectOperations: (messageId) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, operationStatus: 'rejected' as const } : m,
      ),
    }))
  },

  // Screenshot actions
  setScreenshotBefore: (messageId, dataUrl) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, screenshotBefore: dataUrl } : m,
      ),
    }))
  },

  setScreenshotAfter: (messageId, dataUrl) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, screenshotAfter: dataUrl } : m,
      ),
    }))
  },

  // Operation log
  addOperationLog: (log) => {
    set((state) => {
      const updated = [...state.operationLog, log]
      // Keep only the most recent 30 entries to prevent memory growth
      const trimmed = updated.length > 30 ? updated.slice(-30) : updated
      return { operationLog: trimmed }
    })
  },

  updateLogStatus: (logId, status) => {
    set((state) => ({
      operationLog: state.operationLog.map((l) =>
        l.id === logId ? { ...l, status } : l,
      ),
    }))
  },

  undoOperation: (logId) => {
    const { operationLog } = get()
    const log = operationLog.find((l) => l.id === logId)
    if (!log || log.status !== 'confirmed') return

    // Restore scene to pre-operation state
    undoConfirmedOperation(log)

    // Update log status
    set((state) => ({
      operationLog: state.operationLog.map((l) =>
        l.id === logId ? { ...l, status: 'undone' as const } : l,
      ),
      // Also update the corresponding message's operation status
      messages: state.messages.map((m) =>
        m.id === log.messageId ? { ...m, operationStatus: 'undone' as const } : m,
      ),
    }))
  },

  // Multi-proposal
  setProposals: (proposals) => {
    set({
      proposals,
      activeProposalId: proposals[0]?.id ?? null,
    })
  },

  setActiveProposal: (proposalId) => {
    set({ activeProposalId: proposalId })
  },

  clearProposals: () => {
    set({ proposals: [], activeProposalId: null })
  },

  // AI lock
  setAIProcessing: (processing) => {
    set({ isAIProcessing: processing })
  },

  // Agentic loop
  setLoopState: (loopState) => {
    set({ loopState })
  },

  setIterationCount: (iterationCount) => {
    set({ iterationCount })
  },

  setPendingQuestion: (pendingQuestion) => {
    set({ pendingQuestion })
  },

  resolvePendingQuestion: (answer) => {
    const { pendingQuestion } = get()
    if (pendingQuestion) {
      pendingQuestion.resolve(answer)
      set({ pendingQuestion: null, loopState: 'running' })
    }
  },

  addTokensUsed: (tokens) => {
    set((state) => ({ totalTokensUsed: state.totalTokensUsed + tokens }))
  },

  resetTokensUsed: () => {
    set({ totalTokensUsed: 0 })
  },

  // Summarization
  setConversationSummary: (summary) => {
    set({ conversationSummary: summary })
  },

  // Summarization (token-aware + circuit breaker)
  summarizeIfNeeded: async () => {
    // A-7: Atomic check-and-set — use a single set() call to both check and
    // acquire the lock, eliminating the race window between get() and set().
    let shouldProceed = false
    let messages: ChatMessage[] = []
    let summarizeFailureCount = 0

    set((state) => {
      if (state.isSummarizing) return state // Already in progress, no-op
      shouldProceed = true
      messages = state.messages
      summarizeFailureCount = state.summarizeFailureCount
      return { ...state, isSummarizing: true }
    })

    if (!shouldProceed) return

    // Circuit breaker: stop after 3 consecutive failures
    const MAX_SUMMARIZE_FAILURES = 3
    if (summarizeFailureCount >= MAX_SUMMARIZE_FAILURES) {
      set({ isSummarizing: false })
      return
    }

    // Token-aware trigger: use estimator instead of message count
    const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }))
    if (!shouldAutoCompact(apiMessages)) {
      // Fallback: also trigger on high message count even if token estimate is low
      if (messages.length < 30) {
        set({ isSummarizing: false })
        return
      }
    }

    try {
      const messagesToSummarize = messages.slice(0, -10)

      if (messagesToSummarize.length < 5) {
        set({ isSummarizing: false })
        return
      }

      const response = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSummarize.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (response.ok) {
        const { summary } = await response.json()
        if (summary) {
          // Success: reset failure count
          set({ conversationSummary: summary, summarizeFailureCount: 0 })
          // Release screenshots from summarized messages to free memory.
          // summarizeIfNeeded keeps the last 10 messages (slice(0, -10) was
          // summarized), so null out screenshots on all but the most recent 10.
          const currentMessages = get().messages
          if (currentMessages.length > 10) {
            // Revoke Object URLs before clearing references
            for (let i = 0; i < currentMessages.length - 10; i++) {
              const m = currentMessages[i]!
              if (m.screenshotBefore) URL.revokeObjectURL(m.screenshotBefore)
              if (m.screenshotAfter) URL.revokeObjectURL(m.screenshotAfter)
            }
            set({
              messages: currentMessages.map((m, i) =>
                i < currentMessages.length - 10
                  ? { ...m, screenshotBefore: undefined, screenshotAfter: undefined }
                  : m,
              ),
            })
          }
        }
      } else {
        // HTTP error: increment failure count
        const newCount = get().summarizeFailureCount + 1
        if (newCount >= MAX_SUMMARIZE_FAILURES) {
          console.warn(`[AI] Summarization circuit breaker tripped after ${newCount} failures`)
        }
        set({ summarizeFailureCount: newCount })
      }
    } catch {
      // Network error: increment failure count
      const newCount = get().summarizeFailureCount + 1
      if (newCount >= MAX_SUMMARIZE_FAILURES) {
        console.warn(`[AI] Summarization circuit breaker tripped after ${newCount} failures`)
      }
      set({ summarizeFailureCount: newCount })
    } finally {
      set({ isSummarizing: false })
    }
  },

  // Tool error tracking (#6)
  recordToolError: (tool, reason) => {
    const key = `${tool}:${reason.slice(0, 50)}`
    const { recentErrors } = get()
    const existing = recentErrors.get(key)
    const newMap = new Map(recentErrors)
    newMap.set(key, {
      reason,
      count: (existing?.count ?? 0) + 1,
    })
    // Limit map size to prevent unbounded growth
    if (newMap.size > 20) {
      const firstKey = newMap.keys().next().value
      if (firstKey) newMap.delete(firstKey)
    }
    set({ recentErrors: newMap })
  },

  getRecentErrors: () => {
    const { recentErrors } = get()
    const result: { tool: string; reason: string; count: number }[] = []
    for (const [key, { reason, count }] of recentErrors) {
      if (count >= 2) {
        const tool = key.split(':')[0] ?? key
        result.push({ tool, reason, count })
      }
    }
    return result
  },

  // Reset
  clearChat: () => {
    // Revoke all screenshot Object URLs to free blob memory
    for (const msg of get().messages) {
      if (msg.screenshotBefore) URL.revokeObjectURL(msg.screenshotBefore)
      if (msg.screenshotAfter) URL.revokeObjectURL(msg.screenshotAfter)
    }
    set({
      messages: [],
      isStreaming: false,
      streamingContent: '',
      isAIProcessing: false,
      operationLog: [],
      proposals: [],
      activeProposalId: null,
      error: null,
      conversationSummary: null,
      isSummarizing: false,
      summarizeFailureCount: 0,
      recentErrors: new Map(),
      loopState: 'idle',
      iterationCount: 0,
      pendingQuestion: null,
      totalTokensUsed: 0,
    })
  },

  clearError: () => {
    set({ error: null })
  },

  // Conversation history (for API calls, with summarization support)
  getConversationHistory: () => {
    const { messages, conversationSummary } = get()

    // If we have a summary, prepend it and only include messages after the summary point
    if (conversationSummary) {
      const recentMessages = messages.slice(-10)
      return [
        { role: 'user' as const, content: `[Previous conversation summary: ${conversationSummary}]` },
        { role: 'assistant' as const, content: 'Understood. I have the context from our previous conversation.' },
        ...recentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ]
    }

    // No summary yet — keep last 20 messages
    const recent = messages.slice(-20)
    return recent.map((m) => ({
      role: m.role,
      content: m.content,
    }))
  },
}))
