'use client'

import { Check, ChevronDown, History, Maximize2, Undo2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { cn } from '../../../lib/utils'
import { useAIChat } from '../ai-chat-store'
import type { AIOperationLog, ChatMessage, ValidatedOperation } from '../types'

// ============================================================================
// Operation Summary
// ============================================================================

export function OperationSummary({
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
          {validCount} operation{validCount !== 1 ? 's' : ''}
        </span>
        {adjustedCount > 0 && (
          <span className="font-barlow text-[10px] text-yellow-400">
            ({adjustedCount} adjusted)
          </span>
        )}
        {invalidCount > 0 && (
          <span className="font-barlow text-[10px] text-destructive">
            ({invalidCount} invalid)
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
              {(op.type === 'add_item' || op.type === 'add_wall' || op.type === 'add_door' || op.type === 'add_window' || op.type === 'add_stair') && '+ '}
              {(op.type === 'remove_item' || op.type === 'remove_node') && '- '}
              {op.type === 'move_item' && '~ '}
              {op.type === 'update_material' && '* '}
            </span>
            <span className="truncate">
              {op.type === 'add_item' && `Add ${op.asset?.name ?? 'item'}`}
              {op.type === 'add_wall' && 'Add wall'}
              {op.type === 'add_door' && 'Add door'}
              {op.type === 'add_window' && 'Add window'}
              {op.type === 'add_stair' && 'Add staircase'}
              {op.type === 'remove_item' && `Remove ${op.nodeId}`}
              {op.type === 'remove_node' && `Remove ${op.nodeType ?? 'node'} ${op.nodeId}`}
              {op.type === 'move_item' && `Move ${op.nodeId}`}
              {op.type === 'update_material' && `Update material ${op.nodeId}`}
            </span>
            {op.status === 'adjusted' && (
              <span
                className="shrink-0 cursor-help text-[9px] text-yellow-400"
                title={'adjustmentReason' in op && op.adjustmentReason ? String(op.adjustmentReason) : 'Position was adjusted'}
              >
                adjusted
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Adjustment summary — show reasons when items were auto-adjusted */}
      {adjustedCount > 0 && (() => {
        const reasons = operations
          .filter((op) => op.status === 'adjusted' && 'adjustmentReason' in op && op.adjustmentReason)
          .map((op) => String(('adjustmentReason' in op && op.adjustmentReason) || ''))
          .filter(Boolean)
        if (reasons.length === 0) return null
        return (
          <div className="mt-1 rounded bg-yellow-400/5 px-2 py-1">
            <p className="font-barlow text-[10px] text-yellow-400/80">
              {reasons.length === 1
                ? reasons[0]
                : reasons.map((r, i) => <span key={i}>{i > 0 && ' · '}{r}</span>)
              }
            </p>
          </div>
        )
      })()}

      {status === 'confirmed' && (
        <div className="flex items-center gap-1 font-barlow text-[10px] text-green-400">
          <Check className="h-3 w-3" /> Confirmed
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
              Undo
            </button>
          )}
        </div>
      )}
      {status === 'rejected' && (
        <div className="flex items-center gap-1 font-barlow text-[10px] text-muted-foreground">
          <X className="h-3 w-3" /> Rejected
        </div>
      )}
      {status === 'undone' && (
        <div className="flex items-center gap-1 font-barlow text-[10px] text-yellow-400">
          <X className="h-3 w-3" /> Undone
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Operation History Panel (collapsible, above input)
// ============================================================================

export function OperationHistoryPanel({
  logs,
  onUndo,
}: {
  logs: AIOperationLog[]
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
        <span>Operation History</span>
        <span className="text-[10px] text-muted-foreground/60">
          ({confirmedCount} confirmed{undoneCount > 0 ? `, ${undoneCount} undone` : ''})
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
            <div className="subtle-scrollbar max-h-[200px] overflow-y-auto px-3 pb-2">
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

// ============================================================================
// Operation History Item
// ============================================================================

export function OperationHistoryItem({
  log,
  onUndo,
  stepNumber,
}: {
  log: AIOperationLog
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
    .join(', ')

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
        {validOps.length} node{validOps.length !== 1 ? 's' : ''}
      </span>
      {isConfirmed && (
        <button
          className="shrink-0 rounded px-1 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
          onClick={() => onUndo(log.id)}
          title="Undo this operation"
          type="button"
        >
          <Undo2 className="h-3 w-3" />
        </button>
      )}
      {isUndone && (
        <span className="shrink-0 text-[9px] text-yellow-400/70">undone</span>
      )}
    </div>
  )
}

// ============================================================================
// getOperationTypeLabel helper
// ============================================================================

export function getOperationTypeLabel(type: string): string {
  switch (type) {
    case 'add_item': return 'Add furniture'
    case 'add_wall': return 'Add wall'
    case 'add_door': return 'Add door'
    case 'add_window': return 'Add window'
    case 'remove_item': return 'Remove furniture'
    case 'remove_node': return 'Remove node'
    case 'move_item': return 'Move furniture'
    case 'update_material': return 'Update material'
    default: return type
  }
}

// ============================================================================
// Pending Operation Card (Sticky at top — single proposal mode)
// ============================================================================

export function PendingOperationCard({
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
            Preview {validOps.length} operation{validOps.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="flex h-7 items-center gap-1 rounded-md bg-destructive/20 px-2.5 font-barlow text-destructive text-xs transition-colors hover:bg-destructive/30"
              onClick={() => onReject(pendingMessage.id)}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              className="flex h-7 items-center gap-1 rounded-md bg-sidebar-primary px-2.5 font-barlow text-white text-xs transition-colors hover:bg-sidebar-primary/90"
              onClick={() => onConfirm(pendingMessage.id, pendingMessage.operations!)}
              type="button"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// BeforeAfterComparison with Lightbox
// ============================================================================

export function BeforeAfterComparison({ before, after }: { before: string; after: string }) {
  const [isOpen, setIsOpen] = useState(false)
  // Slider position as percentage (0-100), default 50% center
  const [sliderPos, setSliderPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const updateSlider = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPos(pct)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    updateSlider(e.clientX)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return
    updateSlider(e.clientX)
  }

  const onPointerUp = () => {
    isDragging.current = false
  }

  return (
    <>
      {/* Thumbnail grid */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div>
          <p className="mb-0.5 font-barlow text-[10px] text-muted-foreground">Before</p>
          <img alt="Before" className="rounded border border-border/30" loading="lazy" src={before} />
        </div>
        <div>
          <p className="mb-0.5 font-barlow text-[10px] text-muted-foreground">After</p>
          <img alt="After" className="rounded border border-border/30" loading="lazy" src={after} />
        </div>
      </div>
      {/* Click-to-compare button */}
      <button
        className="mt-1 flex w-full items-center justify-center gap-1 rounded bg-accent/40 py-1 font-barlow text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        onClick={() => { setIsOpen(true); setSliderPos(50) }}
        type="button"
      >
        <Maximize2 className="h-3 w-3" />
        Slide to compare
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
