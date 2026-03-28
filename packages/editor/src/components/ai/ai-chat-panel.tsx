'use client'

import { Bot, Check, ChevronDown, History, Loader2, MapPin, Maximize2, MessageCircleQuestion, Send, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  type KeyboardEvent,
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
import type { ChatMessage, PlacementOption, Proposal, ProposePlacementToolCall, ValidatedOperation } from './types'

// ============================================================================
// Chat Panel Component
// ============================================================================

export function AIChatPanel() {
  const {
    messages,
    isStreaming,
    streamingContent,
    isAIProcessing,
    error,
    proposals,
    activeProposalId,
    iterationCount,
    pendingQuestion,
    operationLog,
    addUserMessage,
    clearChat,
    clearError,
    undoOperation,
  } = useAIChat()

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
  }, [messages, streamingContent])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  // Listen for placement option selections
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail as string
      if (text && !isAIProcessing) {
        addUserMessage(text)
        runAgentLoop({
          userMessage: text,
          catalogSummary: catalogSummaryRef.current!,
        })
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
  }, [input, isStreaming, isAIProcessing, pendingQuestion, addUserMessage, messages])

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
    <div className="flex h-full flex-col">
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
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && !isStreaming ? (
          <EmptyState onSuggestionClick={(text) => setInput(text)} />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="flex gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20">
                  <Bot className="h-3.5 w-3.5 text-sidebar-primary" />
                </div>
                <div className="flex-1 rounded-lg bg-accent/30 px-3 py-2 font-barlow text-sm">
                  {streamingContent || (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {iterationCount > 1 ? `迭代 ${iterationCount} — 思考中...` : '思考中...'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Pending Question from AI */}
            {pendingQuestion && (
              <PendingQuestionCard
                question={pendingQuestion.question}
                suggestions={pendingQuestion.suggestions}
                onAnswer={(answer) => {
                  answerPendingQuestion(answer)
                }}
                onSuggestionClick={(suggestion) => {
                  setInput(suggestion)
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
            placeholder={pendingQuestion ? '回答 AI 的问题...' : '描述你想要的设计变更...'}
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
            Enter 发送 · Shift+Enter 换行
          </p>
          {messages.length > 0 && (
            <button
              className="flex items-center gap-1 font-barlow text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
              onClick={clearChat}
              type="button"
            >
              <Trash2 className="h-3 w-3" />
              清空对话
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State
// ============================================================================

const SUGGESTION_CHIPS = [
  '在客厅放一张沙发和茶几',
  '帮我布置一个卧室',
  '添加照明设备',
  '把家具重新排列',
]

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary/15">
        <Sparkles className="h-5 w-5 text-sidebar-primary" />
      </div>
      <h3 className="mt-3 font-barlow font-semibold text-sm">AI 设计助手</h3>
      <p className="mt-1 text-center font-barlow text-muted-foreground text-xs leading-relaxed">
        用自然语言描述你想要的设计变更，
        <br />
        AI 会帮你在场景中预览和执行。
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
  onAnswer,
  onSuggestionClick,
}: {
  question: string
  suggestions?: string[]
  onAnswer: (answer: string) => void
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

// ============================================================================
// Before/After Comparison with Lightbox
// ============================================================================

function BeforeAfterComparison({ before, after }: { before: string; after: string }) {
  const [isOpen, setIsOpen] = useState(false)
  // Slider position as percentage (0-100), default 50% center
  const [sliderPos, setSliderPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const updateSlider = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPos(pct)
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      updateSlider(e.clientX)
    },
    [updateSlider],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      updateSlider(e.clientX)
    },
    [updateSlider],
  )

  const onPointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <>
      {/* Thumbnail grid */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div>
          <p className="mb-0.5 font-barlow text-[10px] text-muted-foreground">Before</p>
          <img alt="Before" className="rounded border border-border/30" src={before} />
        </div>
        <div>
          <p className="mb-0.5 font-barlow text-[10px] text-muted-foreground">After</p>
          <img alt="After" className="rounded border border-border/30" src={after} />
        </div>
      </div>
      {/* Click-to-compare button */}
      <button
        className="mt-1 flex w-full items-center justify-center gap-1 rounded bg-accent/40 py-1 font-barlow text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        onClick={() => { setIsOpen(true); setSliderPos(50) }}
        type="button"
      >
        <Maximize2 className="h-3 w-3" />
        滑动对比
      </button>

      {/* Fullscreen slider comparison overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              animate={{ scale: 1 }}
              className="relative"
              exit={{ scale: 0.95 }}
              initial={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            >
              {/* Labels */}
              <div className="mb-2 flex justify-between px-1 font-barlow text-xs text-white/70">
                <span>Before</span>
                <span>After</span>
              </div>

              {/* Comparison container */}
              <div
                className="relative select-none overflow-hidden rounded-lg"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                ref={containerRef}
                style={{ touchAction: 'none' }}
              >
                {/* After image (bottom layer, fully visible) */}
                <img
                  alt="After"
                  className="block max-h-[80vh] max-w-[90vw] object-contain"
                  draggable={false}
                  src={after}
                />

                {/* Before image (top layer, clipped by slider) */}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${sliderPos}%` }}
                >
                  <img
                    alt="Before"
                    className="block max-h-[80vh] max-w-[90vw] object-contain"
                    draggable={false}
                    src={before}
                  />
                </div>

                {/* Slider divider line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 cursor-ew-resize bg-white shadow-[0_0_6px_rgba(0,0,0,0.5)]"
                  style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
                >
                  {/* Slider handle */}
                  <div className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/50 shadow-lg">
                    <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M8 6l-4 6 4 6M16 6l4 6-4 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Close button */}
              <button
                className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/40"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ============================================================================
// Message Bubble
// ============================================================================

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2', isUser && 'flex-row-reverse')}>
      {!isUser && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20">
          <Bot className="h-3.5 w-3.5 text-sidebar-primary" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 font-barlow text-sm',
          isUser ? 'bg-sidebar-primary text-white' : 'bg-accent/30',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        {/* Placement proposal options */}
        {message.toolCalls?.some((tc) => tc.tool === 'propose_placement') && (
          <PlacementProposalCards
            message={message}
            onSelectOption={(option) => {
              const text = `我选择方案 ${option.id}：${option.label}`
              window.dispatchEvent(new CustomEvent('ai-select-option', { detail: text }))
            }}
          />
        )}

        {/* Operation summary */}
        {message.operations && message.operations.length > 0 && (
          <div className="mt-2 border-border/30 border-t pt-2">
            <OperationSummary
              messageId={message.id}
              operations={message.operations}
              status={message.operationStatus}
            />
          </div>
        )}

        {/* Before/After thumbnails with click-to-enlarge */}
        {message.screenshotBefore && message.screenshotAfter && (
          <BeforeAfterComparison
            after={message.screenshotAfter}
            before={message.screenshotBefore}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Operation Summary
// ============================================================================

function OperationSummary({
  operations,
  status,
  messageId,
}: {
  operations: ValidatedOperation[]
  status?: string
  messageId?: string
}) {
  const validCount = operations.filter((op) => op.status !== 'invalid').length
  const invalidCount = operations.filter((op) => op.status === 'invalid').length
  const adjustedCount = operations.filter((op) => op.status === 'adjusted').length

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="font-barlow font-medium text-xs">
          {validCount} 项操作
        </span>
        {adjustedCount > 0 && (
          <span className="font-barlow text-[10px] text-yellow-400">
            ({adjustedCount} 项已调整)
          </span>
        )}
        {invalidCount > 0 && (
          <span className="font-barlow text-[10px] text-destructive">
            ({invalidCount} 项无效)
          </span>
        )}
      </div>

      {/* Individual operation items */}
      <div className="space-y-0.5">
        {operations.map((op, i) => (
          <div
            className={cn(
              'flex items-center gap-1.5 font-barlow text-[11px]',
              op.status === 'invalid' && 'text-destructive/70 line-through',
            )}
            key={i}
          >
            <span className="shrink-0">
              {(op.type === 'add_item' || op.type === 'add_wall' || op.type === 'add_door' || op.type === 'add_window') && '+ '}
              {(op.type === 'remove_item' || op.type === 'remove_node') && '- '}
              {op.type === 'move_item' && '~ '}
              {op.type === 'update_material' && '* '}
            </span>
            <span className="truncate">
              {op.type === 'add_item' && `添加 ${op.asset?.name ?? 'item'}`}
              {op.type === 'add_wall' && `添加墙体`}
              {op.type === 'add_door' && `添加门`}
              {op.type === 'add_window' && `添加窗户`}
              {op.type === 'remove_item' && `移除 ${op.nodeId}`}
              {op.type === 'remove_node' && `移除${op.nodeType === 'wall' ? '墙体' : op.nodeType === 'door' ? '门' : op.nodeType === 'window' ? '窗户' : '节点'} ${op.nodeId}`}
              {op.type === 'move_item' && `移动 ${op.nodeId}`}
              {op.type === 'update_material' && `更新材质 ${op.nodeId}`}
            </span>
            {op.status === 'adjusted' && (
              <span className="shrink-0 text-[9px] text-yellow-400">调整</span>
            )}
          </div>
        ))}
      </div>

      {status === 'confirmed' && (
        <div className="flex items-center gap-1 font-barlow text-[10px] text-green-400">
          <Check className="h-3 w-3" /> 已确认
          {messageId && (
            <button
              className="ml-2 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
              onClick={() => {
                const { operationLog, undoOperation } = useAIChat.getState()
                const log = operationLog.find((l) => l.messageId === messageId && l.status === 'confirmed')
                if (log) undoOperation(log.id)
              }}
              type="button"
            >
              撤销
            </button>
          )}
        </div>
      )}
      {status === 'rejected' && (
        <div className="flex items-center gap-1 font-barlow text-[10px] text-muted-foreground">
          <X className="h-3 w-3" /> 已拒绝
        </div>
      )}
      {status === 'undone' && (
        <div className="flex items-center gap-1 font-barlow text-[10px] text-yellow-400">
          <X className="h-3 w-3" /> 已撤销
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Operation History Panel (collapsible, above input)
// ============================================================================

function OperationHistoryPanel({
  logs,
  onUndo,
}: {
  logs: import('./types').AIOperationLog[]
  onUndo: (logId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  // Only show logs that have real operations (not empty)
  const visibleLogs = logs.filter((l) => l.operations.length > 0)
  if (visibleLogs.length === 0) return null

  const confirmedCount = visibleLogs.filter((l) => l.status === 'confirmed').length
  const undoneCount = visibleLogs.filter((l) => l.status === 'undone').length

  return (
    <div className="border-border/50 border-t">
      <button
        className="flex w-full items-center gap-1.5 px-3 py-1.5 font-barlow text-[11px] text-muted-foreground transition-colors hover:bg-accent/30"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <History className="h-3 w-3" />
        <span>操作历史</span>
        <span className="text-[10px] text-muted-foreground/60">
          ({confirmedCount} 项已确认{undoneCount > 0 ? `，${undoneCount} 项已撤销` : ''})
        </span>
        <ChevronDown
          className={cn(
            'ml-auto h-3 w-3 transition-transform',
            !isOpen && '-rotate-90',
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="max-h-[200px] overflow-y-auto px-3 pb-2">
              {[...visibleLogs].reverse().map((log, i) => (
                <OperationHistoryItem
                  key={log.id}
                  log={log}
                  onUndo={onUndo}
                  stepNumber={visibleLogs.length - i}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function OperationHistoryItem({
  log,
  onUndo,
  stepNumber,
}: {
  log: import('./types').AIOperationLog
  onUndo: (logId: string) => void
  stepNumber: number
}) {
  const validOps = log.operations.filter((op) => op.status !== 'invalid')
  const time = new Date(log.timestamp)
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`

  // Summarize operation types
  const typeCounts = new Map<string, number>()
  for (const op of validOps) {
    const label = getOperationTypeLabel(op.type)
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1)
  }
  const summary = Array.from(typeCounts.entries())
    .map(([label, count]) => count > 1 ? `${label}×${count}` : label)
    .join('、')

  const isUndone = log.status === 'undone'
  const isConfirmed = log.status === 'confirmed'

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-1.5 py-1 font-barlow text-[11px]',
        isUndone && 'opacity-50',
      )}
    >
      <span className="w-4 shrink-0 text-center text-[10px] text-muted-foreground/50">
        {stepNumber}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/60">{timeStr}</span>
      <span className={cn('flex-1 truncate', isUndone && 'line-through')}>
        {summary}
      </span>
      <span className="shrink-0 text-[9px] text-muted-foreground/50">
        {validOps.length} 节点
      </span>
      {isConfirmed && (
        <button
          className="shrink-0 rounded px-1 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
          onClick={() => onUndo(log.id)}
          title="撤销此操作"
          type="button"
        >
          <Undo2 className="h-3 w-3" />
        </button>
      )}
      {isUndone && (
        <span className="shrink-0 text-[9px] text-yellow-400/70">已撤销</span>
      )}
    </div>
  )
}

function getOperationTypeLabel(type: string): string {
  switch (type) {
    case 'add_item': return '添加家具'
    case 'add_wall': return '添加墙体'
    case 'add_door': return '添加门'
    case 'add_window': return '添加窗户'
    case 'remove_item': return '移除家具'
    case 'remove_node': return '移除节点'
    case 'move_item': return '移动家具'
    case 'update_material': return '更新材质'
    default: return type
  }
}

// ============================================================================
// Placement Proposal Cards (propose_placement tool)
// ============================================================================

function PlacementProposalCards({
  message,
  onSelectOption,
}: {
  message: ChatMessage
  onSelectOption: (option: PlacementOption) => void
}) {
  const proposalCall = message.toolCalls?.find(
    (tc) => tc.tool === 'propose_placement',
  ) as ProposePlacementToolCall | undefined
  if (!proposalCall) return null

  return (
    <div className="mt-2 border-border/30 border-t pt-2">
      <p className="mb-1.5 font-barlow font-medium text-xs">{proposalCall.question}</p>
      <div className="flex flex-col gap-1.5">
        {proposalCall.options.map((option) => (
          <button
            className="group flex items-start gap-2 rounded-lg border border-border/50 bg-accent/20 px-2.5 py-2 text-left transition-all hover:border-sidebar-primary/50 hover:bg-sidebar-primary/10"
            key={option.id}
            onClick={() => onSelectOption(option)}
            type="button"
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 font-barlow font-semibold text-[10px] text-sidebar-primary">
              {option.id}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-barlow font-medium text-xs">{option.label}</p>
              <p className="mt-0.5 font-barlow text-[10px] text-muted-foreground leading-relaxed">
                {option.reason}
              </p>
            </div>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-sidebar-primary" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Pending Operation Card (Sticky at top)
// ============================================================================

// ============================================================================
// Proposal Tabs (Multi-proposal A/B/C comparison)
// ============================================================================

function ProposalTabs({
  proposals,
  activeProposalId,
  onSwitch,
  onConfirm,
  onReject,
}: {
  proposals: Proposal[]
  activeProposalId: string | null
  onSwitch: (proposalId: string) => void
  onConfirm: () => void
  onReject: () => void
}) {
  return (
    <motion.div
      animate={{ height: 'auto', opacity: 1 }}
      className="overflow-hidden border-border/50 border-b bg-sidebar-primary/5"
      initial={{ height: 0, opacity: 0 }}
    >
      <div className="px-3 py-2.5">
        {/* Proposal tabs */}
        <div className="mb-2 flex items-center gap-1">
          {proposals.map((proposal) => {
            const isActive = proposal.id === activeProposalId
            return (
              <button
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 font-barlow text-xs transition-all',
                  isActive
                    ? 'bg-sidebar-primary text-white'
                    : 'bg-accent/30 text-muted-foreground hover:bg-accent/60',
                )}
                key={proposal.id}
                onClick={() => onSwitch(proposal.id)}
                type="button"
              >
                {proposal.label}
              </button>
            )
          })}
        </div>

        {/* Active proposal operation count */}
        {activeProposalId && (
          <div className="mb-2">
            {proposals
              .filter((p) => p.id === activeProposalId)
              .map((p) => {
                const validOps = p.operations.filter((op) => op.status !== 'invalid')
                return (
                  <span className="font-barlow text-[11px] text-muted-foreground" key={p.id}>
                    {validOps.length} 项操作 · 切换标签预览不同方案
                  </span>
                )
              })}
          </div>
        )}

        {/* Confirm / Reject buttons */}
        <div className="flex items-center justify-end gap-1.5">
          <button
            className="flex h-7 items-center gap-1 rounded-md bg-destructive/20 px-2.5 font-barlow text-destructive text-xs transition-colors hover:bg-destructive/30"
            onClick={onReject}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
            全部拒绝
          </button>
          <button
            className="flex h-7 items-center gap-1 rounded-md bg-sidebar-primary px-2.5 font-barlow text-white text-xs transition-colors hover:bg-sidebar-primary/90"
            onClick={onConfirm}
            type="button"
          >
            <Check className="h-3.5 w-3.5" />
            确认当前方案
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// Pending Operation Card (Sticky at top — single proposal mode)
// ============================================================================

function PendingOperationCard({
  messages,
  onConfirm,
  onReject,
}: {
  messages: ChatMessage[]
  onConfirm: (messageId: string, operations: ValidatedOperation[]) => void
  onReject: (messageId: string) => void
}) {
  // Find the latest message with pending operations
  const pendingMessage = [...messages].reverse().find(
    (m) => m.operationStatus === 'pending' && m.operations?.length,
  )

  if (!pendingMessage || !pendingMessage.operations) return null

  const validOps = pendingMessage.operations.filter((op) => op.status !== 'invalid')

  return (
    <motion.div
      animate={{ height: 'auto', opacity: 1 }}
      className="overflow-hidden border-border/50 border-b bg-sidebar-primary/5"
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-barlow font-medium text-xs">
            预览 {validOps.length} 项操作
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="flex h-7 items-center gap-1 rounded-md bg-destructive/20 px-2.5 font-barlow text-destructive text-xs transition-colors hover:bg-destructive/30"
              onClick={() => onReject(pendingMessage.id)}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
              拒绝
            </button>
            <button
              className="flex h-7 items-center gap-1 rounded-md bg-sidebar-primary px-2.5 font-barlow text-white text-xs transition-colors hover:bg-sidebar-primary/90"
              onClick={() => onConfirm(pendingMessage.id, pendingMessage.operations!)}
              type="button"
            >
              <Check className="h-3.5 w-3.5" />
              确认
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
