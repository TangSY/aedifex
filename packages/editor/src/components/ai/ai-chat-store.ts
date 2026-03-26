import { nanoid } from 'nanoid'
import { create } from 'zustand'
import type {
  AIChatRequest,
  AIOperationLog,
  AIToolCall,
  ChatMessage,
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

  // Multi-proposal
  setProposals: (proposals: Proposal[]) => void
  setActiveProposal: (proposalId: string) => void
  clearProposals: () => void

  // AI lock
  setAIProcessing: (processing: boolean) => void

  // Summarization
  summarizeIfNeeded: () => Promise<void>

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
    set((state) => ({
      operationLog: [...state.operationLog, log],
    }))
  },

  updateLogStatus: (logId, status) => {
    set((state) => ({
      operationLog: state.operationLog.map((l) =>
        l.id === logId ? { ...l, status } : l,
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

  // Summarization
  summarizeIfNeeded: async () => {
    const { messages, conversationSummary, isSummarizing } = get()
    // Trigger summarization when messages exceed threshold and no summarization in progress
    const SUMMARIZE_THRESHOLD = 20
    if (messages.length < SUMMARIZE_THRESHOLD || isSummarizing) return

    set({ isSummarizing: true })

    try {
      const messagesToSummarize = conversationSummary
        ? messages.slice(0, -10) // Summarize older messages, keep last 10 fresh
        : messages.slice(0, -10)

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
          set({ conversationSummary: summary })
        }
      }
    } catch {
      // Summarization failure is non-critical — silently ignore
    } finally {
      set({ isSummarizing: false })
    }
  },

  // Reset
  clearChat: () => {
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
