'use client'

import { Bot, MessageCircleQuestion, Send, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { cn } from '../../lib/utils'
import {
  answerPendingQuestion,
  confirmOperationsFromUI,
  rejectOperationsFromUI,
  runAgentLoop,
} from './ai-agent-loop'
import { generateCatalogSummary } from './ai-catalog-resolver'
import { useAIChat } from './ai-chat-store'
import {
  confirmActiveProposal,
  rejectAllProposals,
  switchToProposal,
} from './ai-proposal-manager'
import type { ChatMessage, ValidatedOperation } from './types'
import { MessageBubble } from './chat-ui/message-bubble'
import { StreamingIndicator } from './chat-ui/streaming-indicator'
import { OperationHistoryPanel, PendingOperationCard } from './chat-ui/operation-cards'
import { ProposalTabs } from './chat-ui/proposal-cards'

// ============================================================================
// Chat Panel Component
// ============================================================================

export function AIChatPanel() {
  // Fine-grained selectors — each selector only re-renders when its
  // specific slice changes. streamingContent updates dozens of times per second
  // during streaming; isolating it in StreamingIndicator prevents the entire
  // panel (message list, input area, etc.) from re-rendering on every chunk.
  const messages = useAIChat((s) => s.messages)
  const isStreaming = useAIChat((s) => s.isStreaming)
  const isAIProcessing = useAIChat((s) => s.isAIProcessing)
  const error = useAIChat((s) => s.error)
  const proposals = useAIChat((s) => s.proposals)
  const activeProposalId = useAIChat((s) => s.activeProposalId)
  const pendingQuestion = useAIChat((s) => s.pendingQuestion)
  const operationLog = useAIChat((s) => s.operationLog)
  const addUserMessage = useAIChat((s) => s.addUserMessage)
  const clearChat = useAIChat((s) => s.clearChat)
  const clearError = useAIChat((s) => s.clearError)
  const undoOperation = useAIChat((s) => s.undoOperation)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cache catalog summary (expensive to regenerate)
  const catalogSummaryRef = useRef<string | null>(null)
  if (!catalogSummaryRef.current) {
    catalogSummaryRef.current = generateCatalogSummary()
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // Keep focus on textarea after React re-renders (message sent, streaming, operations, etc.)
  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  // Listen for placement option selections (debounced to prevent double-fire)
  const lastOptionSentRef = useRef('')
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail as string
      if (text && !isAIProcessing && text !== lastOptionSentRef.current) {
        lastOptionSentRef.current = text
        addUserMessage(text)
        runAgentLoop({
          userMessage: text,
          catalogSummary: catalogSummaryRef.current!,
        })
        // Reset after a short delay to allow same option in future
        setTimeout(() => { lastOptionSentRef.current = '' }, 2000)
      }
    }
    window.addEventListener('ai-select-option', handler)
    return () => window.removeEventListener('ai-select-option', handler)
  }, [addUserMessage, isAIProcessing])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming || isAIProcessing) return

    // If there's a pending question, answer it instead of starting a new loop
    if (pendingQuestion) {
      setInput('')
      answerPendingQuestion(trimmed)
      textareaRef.current?.focus()
      return
    }

    setInput('')
    addUserMessage(trimmed)

    // Start the agentic loop — all business logic is in ai-agent-loop.ts
    runAgentLoop({
      userMessage: trimmed,
      catalogSummary: catalogSummaryRef.current!,
    })

    // Keep textarea focused after sending
    textareaRef.current?.focus()
  }, [input, isStreaming, isAIProcessing, pendingQuestion, addUserMessage])

  const handleConfirm = useCallback(
    (messageId: string, operations: ValidatedOperation[]) => {
      confirmOperationsFromUI(messageId, operations)
    },
    [],
  )

  const handleReject = useCallback(
    (messageId: string) => {
      rejectOperationsFromUI(messageId)
    },
    [],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleProposalConfirm = useCallback(() => {
    const ops = confirmActiveProposal()
    if (ops) {
      const pendingMsg = [...messages].reverse().find(
        (m) => m.operationStatus === 'pending' && m.operations?.length,
      )
      if (pendingMsg) {
        confirmOperationsFromUI(pendingMsg.id, pendingMsg.operations!)
      }
    }
  }, [messages])

  const handleProposalReject = useCallback(() => {
    rejectAllProposals()
    const pendingMsg = [...messages].reverse().find(
      (m) => m.operationStatus === 'pending' && m.operations?.length,
    )
    if (pendingMsg) {
      rejectOperationsFromUI(pendingMsg.id)
    }
  }, [messages])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Proposal Tabs (multi-proposal comparison mode) */}
      {proposals.length > 1 && (
        <ProposalTabs
          activeProposalId={activeProposalId}
          onConfirm={handleProposalConfirm}
          onReject={handleProposalReject}
          onSwitch={switchToProposal}
          proposals={proposals}
        />
      )}

      {/* Sticky Operation Card Area (single-proposal mode) */}
      {proposals.length <= 1 && (
        <PendingOperationCard
          messages={messages}
          onConfirm={handleConfirm}
          onReject={handleReject}
        />
      )}

      {/* Messages Area */}
      <div className="subtle-scrollbar flex-1 overflow-y-auto p-3">
        {messages.length === 0 && !isStreaming ? (
          <EmptyState onSuggestionClick={(text) => setInput(text)} />
        ) : (
          <div className="flex flex-col gap-3">
            {/* MessageList renders only when messages array changes */}
            <MessageList messages={messages} />

            {/* StreamingIndicator has its own subscription to
                streamingContent and isStreaming, so high-frequency chunk
                updates only re-render this small component. */}
            <StreamingIndicator messagesEndRef={messagesEndRef} />

            {/* Pending Question from AI */}
            {pendingQuestion && (
              <PendingQuestionCard
                question={pendingQuestion.question}
                suggestions={pendingQuestion.suggestions}
                onSuggestionClick={(suggestion) => {
                  answerPendingQuestion(suggestion)
                  textareaRef.current?.focus()
                }}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden border-destructive/30 border-t bg-destructive/10 px-3 py-2"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
          >
            <div className="flex items-center justify-between">
              <p className="font-barlow text-destructive text-xs">{error}</p>
              <button
                className="text-destructive/60 hover:text-destructive"
                onClick={clearError}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Operation History */}
      {operationLog.length > 0 && (
        <OperationHistoryPanel logs={operationLog} onUndo={undoOperation} />
      )}

      {/* Input Area */}
      <div className="border-border/50 border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className="max-h-[120px] min-h-[36px] flex-1 resize-none rounded-lg border border-input bg-accent/30 px-3 py-2 font-barlow text-sm shadow-xs outline-none placeholder:text-muted-foreground/50 focus:border-sidebar-primary/50 focus:ring-1 focus:ring-sidebar-primary/20"
            disabled={isStreaming || (isAIProcessing && !pendingQuestion)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingQuestion ? 'Answer AI question...' : 'Describe your design changes...'}
            rows={1}
            value={input}
          />
          <button
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all',
              input.trim() && !isStreaming && !(isAIProcessing && !pendingQuestion)
                ? 'bg-sidebar-primary text-white hover:bg-sidebar-primary/90'
                : 'bg-accent/50 text-muted-foreground',
            )}
            disabled={!input.trim() || isStreaming || (isAIProcessing && !pendingQuestion)}
            onClick={handleSend}
            type="button"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="font-barlow text-[10px] text-muted-foreground/50">
            Enter to send · Shift+Enter for new line
          </p>
          {messages.length > 0 && (
            <button
              className="flex items-center gap-1 font-barlow text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
              onClick={clearChat}
              type="button"
            >
              <Trash2 className="h-3 w-3" />
              Clear chat
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MessageList — only re-renders when messages array reference changes
// ============================================================================

const MessageList = memo(function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </>
  )
})

// ============================================================================
// Empty State
// ============================================================================

const SUGGESTION_CHIPS = [
  'Place a sofa and coffee table in the living room',
  'Help me furnish a bedroom',
  'Add lighting fixtures',
  'Rearrange the furniture',
]

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary/15">
        <Bot className="h-5 w-5 text-sidebar-primary" />
      </div>
      <h3 className="mt-3 font-barlow font-semibold text-sm">AI Design Assistant</h3>
      <p className="mt-1 text-center font-barlow text-muted-foreground text-xs leading-relaxed">
        Describe your design changes in natural language,
        <br />
        AI will preview and execute them in the scene.
      </p>
      <div className="mt-4 grid w-full grid-cols-1 gap-1.5">
        {SUGGESTION_CHIPS.map((text) => (
          <button
            className="rounded-lg border border-border/50 bg-accent/30 px-3 py-2 text-left font-barlow text-xs transition-colors hover:bg-accent/60"
            key={text}
            onClick={() => onSuggestionClick(text)}
            type="button"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Pending Question Card (AI asks user a question)
// ============================================================================

function PendingQuestionCard({
  question,
  suggestions,
  onSuggestionClick,
}: {
  question: string
  suggestions?: string[]
  onSuggestionClick: (suggestion: string) => void
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2"
      initial={{ opacity: 0, y: 8 }}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-500/20">
        <MessageCircleQuestion className="h-3.5 w-3.5 text-yellow-500" />
      </div>
      <div className="flex-1 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
        <p className="font-barlow text-sm">{question}</p>
        {suggestions && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                className="rounded-md border border-border/50 bg-accent/30 px-2 py-1 font-barlow text-[11px] transition-colors hover:bg-accent/60"
                key={s}
                onClick={() => onSuggestionClick(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
